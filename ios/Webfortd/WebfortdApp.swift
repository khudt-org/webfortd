import SwiftUI
import WebfortdKit

/// 내비게이션 목적지: 위키 축 목록과 문서.
enum AppRoute: Hashable {
    case axis(KBAxis)
    case document(slug: String)
}

/// 하단 탭 5개. 각 탭이 독립 NavigationStack(path)을 가진다.
enum AppTab: Hashable {
    case wiki
    case chat
    case library
    case media
    case settings
}

@main
struct WebfortdApp: App {
    private let store: KBStore?
    // DeveloperToolsSupport(Xcode Preview 라이브러리)에도 동명 타입이 있어 완전 수식 필요.
    private let libraryItems: [WebfortdKit.LibraryItem]?
    private let mediaItems: [MediaItem]?
    @State private var selectedTab: AppTab = .wiki
    @State private var wikiPath: [AppRoute] = []
    @State private var chatPath: [AppRoute] = []
    @State private var mediaPath: [AppRoute] = []
    /// M3: OTP 로그인 + 세션 상태. `ChatView`에 명시적으로 넘겨(기존 `store: KBStore?` 전달과
    /// 동일한 패턴, 이 앱은 아직 `.environment()` DI를 쓰지 않는다) `ChatAPI`·`ThreadsAPI`의
    /// tokenProvider로 연결한다.
    @State private var authStore: AuthStore
    /// M4: 설정 탭 로그아웃이 ChatView 로그아웃과 동일하게 대화 이력도 리셋해야 하므로, ChatStore를
    /// 앱 레벨로 끌어올려 ChatView·SettingsView가 같은 인스턴스를 공유한다(이전에는 ChatView가
    /// 자체 init에서 생성·단독 소유했다).
    @State private var chatStore: ChatStore
    @Environment(\.scenePhase) private var scenePhase

    init() {
        // 파이프라인 미실행 등 번들 결함은 홈에서 안내(3-state: 실패를 빈 목록과 뭉개지 않음).
        store = try? KBStore.bundled()
        libraryItems = try? CatalogStore.libraryItems()
        mediaItems = try? CatalogStore.mediaItems()

        let authStore = AuthStore()
        _authStore = State(initialValue: authStore)
        let chatAPI = ChatAPI(baseURL: AppConfig.webBaseURL, tokenProvider: { await authStore.accessToken() })
        let threadsAPI = ThreadsAPI(
            baseURL: AppConfig.webBaseURL, tokenProvider: { await authStore.accessToken() })
        _chatStore = State(initialValue: ChatStore(
            api: chatAPI, threadsAPI: threadsAPI, isSignedIn: { authStore.isSignedIn }))
    }

    var body: some Scene {
        WindowGroup {
            TabView(selection: $selectedTab) {
                // SF Symbol은 장식(aria-hidden 등가)이므로 탭 라벨 텍스트가 접근 가능한 이름.
                Tab("위키", systemImage: "books.vertical", value: AppTab.wiki) {
                    NavigationStack(path: $wikiPath) {
                        WikiHomeView(store: store)
                            .navigationDestination(for: AppRoute.self) { route in destination(for: route) }
                    }
                }
                Tab("채팅", systemImage: "bubble.left.and.text.bubble.right", value: AppTab.chat) {
                    NavigationStack(path: $chatPath) {
                        ChatView(store: store, chatStore: chatStore, authStore: authStore)
                            .navigationDestination(for: AppRoute.self) { route in destination(for: route) }
                    }
                }
                Tab("자료실", systemImage: "tray.full", value: AppTab.library) {
                    NavigationStack {
                        LibraryView(items: libraryItems)
                    }
                }
                Tab("미디어", systemImage: "photo.on.rectangle", value: AppTab.media) {
                    NavigationStack(path: $mediaPath) {
                        MediaView(items: mediaItems)
                            .navigationDestination(for: AppRoute.self) { route in destination(for: route) }
                    }
                }
                Tab("설정", systemImage: "gearshape", value: AppTab.settings) {
                    NavigationStack {
                        SettingsView(store: store, chatStore: chatStore, authStore: authStore)
                    }
                }
            }
            .environment(\.openURL, OpenURLAction { url in
                // 문서 본문 내부 위키링크 → 앱 내 push. 현재 선택된 탭의 path로 분기.
                guard url.scheme == KBLink.scheme, let slug = url.host() else {
                    return .systemAction
                }
                switch selectedTab {
                case .wiki: wikiPath.append(.document(slug: slug))
                case .chat: chatPath.append(.document(slug: slug))
                case .media: mediaPath.append(.document(slug: slug))
                case .library, .settings:
                    // 위키링크를 표시할 본문이 없는 탭. 처리 불가로 되돌린다.
                    return .discarded
                }
                return .handled
            })
            .task {
                // 앱 시작 1회: 기기에 저장된 세션 복원. 세션 없으면 signedOut, 그 외 오류는
                // AuthStore.bootstrap()이 이전 state를 유지한다.
                await authStore.bootstrap()
            }
            .onChange(of: scenePhase) { _, newPhase in
                if newPhase == .active {
                    Task {
                        await authStore.bootstrapIfNeeded()
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func destination(for route: AppRoute) -> some View {
        switch route {
        case .axis(let axis):
            AxisListView(store: store, axis: axis)
        case .document(let slug):
            DocumentView(store: store, slug: slug)
        }
    }
}
