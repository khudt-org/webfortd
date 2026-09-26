import PhotosUI
import SwiftUI
import UIKit
import UniformTypeIdentifiers
import WebfortdKit

/// RAG 채팅 화면. 답변은 위키 문서와 동일한 BlockRenderer로 렌더링(제목 헤딩 드롭은 미적용).
/// 채팅 답변은 문서 제목이 없으므로 별도 처리 없음. 출처 카드는 번들 문서면 즉시 push한다.
struct ChatView: View {
    let store: KBStore?
    /// M4: `WebfortdApp`이 소유하고 `SettingsView`와 공유하는 인스턴스. 설정 탭 로그아웃이 이
    /// 채팅 탭 이력도 함께 리셋해야 하므로(§signOut) 각 화면이 자체 인스턴스를 새로 만들지 않는다.
    let chatStore: ChatStore
    let authStore: AuthStore

    @State private var inputText = ""
    @State private var speech = SpeechService()
    /// 완료 시 마지막 질문 헤딩으로 VoiceOver 포커스 이동(헌장 §6 포커스 계약)
    @AccessibilityFocusState private var focusedMessageId: UUID?
    /// 지우기 버튼이 초안 소거로 자신을 제거할 때 포커스를 입력 필드로 선점 이동(§5)
    @AccessibilityFocusState private var isInputFocused: Bool
    /// 탭 가시성 — 홀드 중 탭 이탈 시 인식기 .cancelled의 endHold()와 onDisappear의
    /// cancel()이 경합해, stop()이 stopping 가드를 선점하면 늦은 전사가 떠난 화면의
    /// onTranscript로 배달된다(전역 통지 + 사용자 확인 없는 전송). 릴리스=즉시 전송
    /// 계약이라 부수효과가 커서 WikiHomeView와 동형 가드 필요(이식 리뷰 P1).
    @State private var isVisible = true
    /// 포커스 계약(헌장 §6, 위원장 실기기 판정 2026-07-19 dodo R184 이식): 전송 시
    /// 항상 존재하는 보내기 버튼으로 이동해 생성 내내 머물고, 완료 시에만 마지막 질문
    /// 헤딩으로 이동한다. 구계약(완료 시 답변으로 이동)은 폐기 — 질문 헤딩에 앉아야
    /// 다음 스와이프가 답변 첫 블록으로 자연스럽게 이어진다.
    @AccessibilityFocusState private var isSendFocused: Bool
    /// 진행 중인 완료 포커스 시퀀스(400ms 가시화 대기 + 600ms 실패 감지 + 재시도).
    /// 새 답변 도착·뷰 이탈 시 취소해 옛 질문으로의 지연 대입 잔류를 막는다.
    @State private var completionFocusTask: Task<Void, Never>?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    // 첨부 선택 흐름: 첨부 버튼 → confirmationDialog(사진 보관함 / 파일) → 각 피커.
    @State private var showAttachmentSourceDialog = false
    @State private var showPhotosPicker = false
    @State private var selectedPhotoItem: PhotosPickerItem?
    @State private var showFileImporter = false

    // M3 인증 흐름: 로그인 시트 · 대화 목록 시트 · 계정 confirmationDialog.
    @State private var showAuthSheet = false
    @State private var showThreadListSheet = false
    @State private var showAccountMenu = false

    var body: some View {
        VStack(spacing: 0) {
            if chatStore.messages.isEmpty {
                ContentUnavailableView(
                    "정책·제도를 물어보세요",
                    systemImage: "bubble.left.and.text.bubble.right",
                    description: Text("예: 보조공학기기 지원은 어떻게 신청하나요?"))
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                messageList
            }
            Divider()
            inputBar
        }
        .navigationTitle("채팅")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { toolbarContent }
        .sheet(isPresented: $showAuthSheet) {
            AuthSheet(authStore: authStore)
        }
        .sheet(isPresented: $showThreadListSheet) {
            ThreadListSheet(authStore: authStore, chatStore: chatStore)
        }
        .confirmationDialog(authStore.email ?? "계정", isPresented: $showAccountMenu, titleVisibility: .visible) {
            Button("로그아웃", role: .destructive) {
                Task { await signOut() }
            }
        }
        .onChange(of: chatStore.threadLoadTick) { _, _ in
            // 스레드 교체는 "world changed" — 진행 중이던 구 스레드의 완료 포커스 시퀀스를
            // 취소한다(살아남으면 400~900ms 뒤 사라진 메시지 id를 대입해, 방금 옮긴 새 스레드
            // 포커스를 바인딩 nil 리셋으로 도로 걷어간다 — 리뷰 검출 레이스).
            completionFocusTask?.cancel()
            completionFocusTask = nil
            // 대화 목록에서 스레드를 불러오면 첫 질문 헤딩으로 포커스 이동(§동적 콘텐츠 등장
            // 시 포커스 이동). 포커스 바인딩은 user 버블에만 있으므로 첫 user 메시지를 찾는다
            // (스레드는 관례상 질문으로 시작하지만 DB 제약은 아니라 방어적으로 필터).
            focusedMessageId = chatStore.messages.first(where: { $0.role == "user" })?.id
        }
        .onAppear {
            isVisible = true
            #if DEBUG
            installChatFocusObserverOnce()
            #endif
        }
        .onDisappear {
            isVisible = false
            // 탭 이탈 시 진행 중 음성 인식 폐기(마이크 잔존 방지, gildongmu 동형).
            Task { await speech.cancel() }
            // 완료 포커스 시퀀스도 폐기(화면을 떠난 뷰의 지연 포커스 대입 방지)
            completionFocusTask?.cancel()
            completionFocusTask = nil
        }
        .alert(speechAlertMessage ?? "", isPresented: speechAlertBinding) {
            Button("확인") {}
        }
    }

    /// denied·failed 안내(gildongmu 동형). 확인 시 idle 복귀(재시도 가능 상태로).
    private var speechAlertMessage: String? {
        switch speech.phase {
        case .denied: "설정에서 마이크 접근을 허용해 주세요"
        case .failed: "음성 인식을 시작하지 못했습니다. 다시 시도해 주세요"
        default: nil
        }
    }

    private var speechAlertBinding: Binding<Bool> {
        Binding(
            get: { speechAlertMessage != nil },
            set: { if !$0 { speech.reset() } }
        )
    }

    // 44pt frame은 label 안쪽 + contentShape(버튼 바깥 frame은 히트 영역을 안 넓힌다).
    // [새 대화]는 상시 존재 버튼이라 포커스가 유지되고, 완료는 polite 통지 1회로 알린다
    // (이력이 조용히 비워지는 전이는 SR에 무신호 — dodo 동일 계약).
    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        ToolbarItem(placement: .navigationBarLeading) {
            Button {
                // 이력이 비워지는 world change — 구 대화의 완료 포커스 시퀀스도 함께 폐기.
                completionFocusTask?.cancel()
                completionFocusTask = nil
                chatStore.startNewThread()
                Announce.post("새 대화를 시작했어요")
            } label: {
                Text("새 대화")
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
            }
        }
        ToolbarItemGroup(placement: .navigationBarTrailing) {
            if authStore.isSignedIn {
                Button {
                    showThreadListSheet = true
                } label: {
                    Text("대화 목록")
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                }
                Button {
                    showAccountMenu = true
                } label: {
                    Text("계정")
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                }
            } else {
                Button {
                    showAuthSheet = true
                } label: {
                    Text("로그인")
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                }
            }
        }
    }

    /// 로그아웃 + 이력 리셋(로그아웃 후 서버 저장 없는 익명 휘발 모드로 복귀).
    private func signOut() async {
        completionFocusTask?.cancel()
        completionFocusTask = nil
        await authStore.signOut()
        chatStore.startNewThread()
    }

    private var messageList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                // ⚠ LazyVStack 금지(gildongmu 실기기 cpu_resource 마이크로스택샷으로 확정,
                // 2026-07-20): 대화가 몇 턴 쌓이면 lazy 레이아웃 캐시(LazySubviewPlacements)가
                // 크기 추정 진동으로 매 UI 사이클 트랜잭션을 재발행해 메인 스레드 100% CPU
                // 무한 루프(앱 먹통, VO 전면 무응답). 채팅 히스토리는 세션당 유한하므로
                // eager VStack이 정본 — 진동 기제 자체가 없고, 화면 밖 요소 AX 컬링
                // (완료 포커스 대입 실패 원인)도 함께 해소.
                VStack(alignment: .leading, spacing: 20) {
                    ForEach(chatStore.messages) { message in
                        messageRow(message)
                            .id(message.id)
                    }
                }
                .padding()
            }
            .onChange(of: chatStore.messages.count) { _, _ in scrollToLastMessage(proxy) }
            // 스트리밍 델타마다 추적 스크롤(시각 사용자용). VoiceOver 포커스 이동은
            // 완료 시 1회(아래 answerRevision onChange)만 처리하므로 이 스크롤과 무관하다.
            .onChange(of: chatStore.streamTick) { _, _ in scrollToLastMessage(proxy) }
            // 완료 시에만 질문 헤딩으로 포커스 이동(헌장 §6). answerRevision은 자연 완료
            // (오류 포함)에만 오르는 세대 신호 — 사용자 중단(stop)은 완료가 아니라 포커스가
            // 중단 버튼(=전송 버튼, 라벨만 교체)에 그대로 남는다.
            .onChange(of: chatStore.answerRevision) { _, _ in
                completionFocusTask?.cancel()
                completionFocusTask = Task { @MainActor in
                    await runCompletionFocusSequence(proxy)
                }
            }
        }
    }

    private func scrollToLastMessage(_ proxy: ScrollViewProxy) {
        guard let last = chatStore.messages.last else { return }
        // VO 실행 중 응답 append·델타는 하단이 아니라 질문 상단으로 스크롤해 완료 포커스
        // 대상(질문 헤딩)을 화면에 유지한다 — 하단 스크롤이 질문을 화면 밖으로 밀면
        // ScrollView가 질문을 AX 트리에서 컬링해 완료 시 포커스 대입이 조용히 실패한다
        // (dodo R184 실기기 로그 확정: 하단 withAnimation 스크롤과 완료 측 질문 상단
        // scrollTo의 경합 → VO 실행 중엔 append부터 목적지를 질문 상단으로 단일화).
        if UIAccessibility.isVoiceOverRunning, last.role == "assistant",
           let lastUserId = chatStore.messages.last(where: { $0.role == "user" })?.id {
            proxy.scrollTo(lastUserId, anchor: .top)
            return
        }
        // 동작 줄이기 사용자는 즉시 점프가 정답(nil 애니메이션). 도착 상태는 두 경우 동일.
        // withAnimation은 연속 호출 시 현재 위치에서 retarget하므로 스트리밍 델타 연타에 안전.
        withAnimation(reduceMotion ? nil : .easeOut(duration: 0.25)) {
            proxy.scrollTo(last.id, anchor: .bottom)
        }
    }

    /// 완료 포커스 시퀀스(헌장 §6, dodo R184 이식): VO 실행 중이면 질문 상단 스크롤로
    /// 가시화 → 400ms 후 포커스 대입 → 600ms 후 바인딩 nil 리셋(AX 컬링 실패 신호)
    /// 감지 시 재스크롤+1회 재시도. 각 체크포인트에서 취소·새 질문 전송(streaming)을
    /// 확인해 stale 대입을 중단한다. VO 미실행 시엔 답변 하단 스크롤만(기존 시각 동작).
    /// 오류 완료는 건너뛴다 — ChatStore가 이미 interrupting 통지했고 포커스는 보내기
    /// 버튼에 유지된다(같은 문구 이중 낭독·이중 신호 방지).
    private func runCompletionFocusSequence(_ proxy: ScrollViewProxy) async {
        guard chatStore.lastErrorMessage == nil, let last = chatStore.messages.last else { return }
        #if DEBUG
        chatFocusLog("completion: voRunning=\(UIAccessibility.isVoiceOverRunning) sendFocused=\(isSendFocused)")
        #endif
        guard UIAccessibility.isVoiceOverRunning,
              let lastUser = chatStore.messages.last(where: { $0.role == "user" }) else {
            proxy.scrollTo(last.id, anchor: .bottom)
            return
        }
        proxy.scrollTo(lastUser.id, anchor: .top)
        try? await Task.sleep(for: .milliseconds(400))
        guard sequenceStillValid(for: lastUser.id) else { return }
        // 보내기 버튼의 포커스 상태를 먼저 해제(이중 점유 충돌 후보 제거)
        isSendFocused = false
        focusedMessageId = lastUser.id
        #if DEBUG
        chatFocusLog("assigned question focus id=\(lastUser.id)")
        #endif
        try? await Task.sleep(for: .milliseconds(600))
        guard sequenceStillValid(for: lastUser.id) else { return }
        // 대입 실패의 진짜 신호는 바인딩 nil 리셋(대상이 AX 트리에 없으면 SwiftUI가
        // 되돌린다, dodo R184 실기기 로그 확정). 재스크롤 후 1회 재시도.
        if focusedMessageId != lastUser.id {
            #if DEBUG
            chatFocusLog("retry: rescroll + reassign (focusedMessageId=\(focusedMessageId?.uuidString ?? "nil"))")
            #endif
            proxy.scrollTo(lastUser.id, anchor: .top)
            try? await Task.sleep(for: .milliseconds(300))
            guard sequenceStillValid(for: lastUser.id) else { return }
            isSendFocused = false
            focusedMessageId = lastUser.id
        }
    }

    /// 완료 포커스 시퀀스의 sleep 체크포인트 공용 가드: 취소·새 질문 전송(streaming)·대상
    /// 메시지 소실(스레드 전환·새 대화·로그아웃 등 world change) 시 stale 대입을 중단한다.
    /// 명시 취소 경로(threadLoadTick·새 대화·signOut·onDisappear)의 안전망 겸용 — 미래의
    /// messages 교체 경로가 취소를 빠뜨려도 사라진 id 대입은 여기서 구조적으로 차단된다.
    private func sequenceStillValid(for messageId: UUID) -> Bool {
        !Task.isCancelled
            && chatStore.phase != .streaming
            && chatStore.messages.contains(where: { $0.id == messageId })
    }

    @ViewBuilder
    private func messageRow(_ message: ChatMessage) -> some View {
        if message.role == "user" {
            userBubble(message)
        } else {
            assistantAnswer(message)
        }
    }

    // user 버블은 단일 평문 Text(마크다운 해석·재구성 금지) + 헤딩 trait(시각 불변):
    // 긴 대화에서 로터 헤딩 탐색으로 턴(질문) 단위 점프가 되는 유일한 경로(헌장 §6).
    // 완료·이력 로드 포커스 대상이라 포커스 바인딩도 이 Text에 직접 둔다(컨테이너 바인딩은
    // 침묵 실패 위험 — dodo·gildongmu 검증 패턴은 질문 Text 직접 바인딩).
    private func userBubble(_ message: ChatMessage) -> some View {
        HStack {
            Spacer(minLength: 32)
            Text(message.displayText)
                .padding(12)
                .background(.tint.opacity(0.15), in: RoundedRectangle(cornerRadius: 14))
                .accessibilityAddTraits(.isHeader)
                .accessibilityFocused($focusedMessageId, equals: message.id)
        }
    }

    // assistant는 BlockRenderer로 전각 배치. 컨테이너를 combine하지 않아 본문 블록의
    // 헤딩·리스트 접근성 구조(로터 탐색 등)를 그대로 유지한다.
    @ViewBuilder
    private func assistantAnswer(_ message: ChatMessage) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            if message.text.isEmpty {
                ProgressView()
            } else {
                BlockRenderer(blocks: MarkdownBlockParser.parse(message.text))
            }
            if !message.sourceRefs.isEmpty {
                sourceCards(message.sourceRefs)
            }
            if message.historyNotSaved {
                Text("이 대화는 대화 목록에 저장되지 않았어요. 계속되면 계정에서 로그아웃한 뒤 다시 로그인해 주세요.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func sourceCards(_ refs: [ChatSourceRef]) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            ForEach(refs, id: \.slug) { ref in
                sourceCard(ref)
            }
        }
        .padding(.top, 4)
    }

    /// 번들 문서면 앱 내 push, 아니면(번들 외 문서) 웹 URL로 폴백.
    /// 44pt frame은 label 안쪽 + contentShape(바깥 frame은 히트 영역을 안 넓힌다).
    @ViewBuilder
    private func sourceCard(_ ref: ChatSourceRef) -> some View {
        if store?.summary(slug: ref.slug) != nil {
            NavigationLink(value: AppRoute.document(slug: ref.slug)) {
                Text("출처: \(ref.title)")
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
            }
        } else if let url = URL(string: ref.href, relativeTo: AppConfig.webBaseURL) {
            Link(destination: url) {
                Text("출처: \(ref.title)")
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
            }
        }
    }

    private var inputBar: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let attachment = chatStore.pendingAttachment {
                attachmentRow(filename: attachment.filename)
            } else if let attachmentErrorMessage = chatStore.attachmentErrorMessage {
                Text(attachmentErrorMessage)
                    .font(.footnote)
                    .foregroundStyle(.red)
            }

            HStack(spacing: 8) {
                attachmentButton

                // 축약 없이 명시적 라벨: 값이 채워져도 접근 가능한 이름으로 남는다.
                TextField("질문 입력", text: $inputText, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                    .lineLimit(1...4)
                    .frame(minHeight: 44)
                    .accessibilityFocused($isInputFocused)

                // 텍스트 지우기(검색창 시스템 clear 버튼의 채팅 판, 2026-07-20 위원장 요청).
                // 초안이 있을 때만 존재 — 지우면 자신이 사라지므로 포커스를 입력 필드로
                // 선점 이동(§5). 키보드 재진입은 VO 제약상 직접 더블탭 필요(프로그래밍 불가).
                if !inputText.isEmpty {
                    Button {
                        inputText = ""
                        isInputFocused = true
                    } label: {
                        Label("텍스트 지우기", systemImage: "xmark.circle.fill")
                            .labelStyle(.iconOnly)
                            .frame(minWidth: 44, minHeight: 44)
                            .contentShape(Rectangle())
                    }
                }

                // WhatsApp식 홀드 받아쓰기(2026-07-20 탭 토글 대체, gildongmu 실기기 합격
                // 이식): 누르는 동안 녹음, 떼면 초안 병합 즉시 전송. 위로 밀면 잠금
                // (일시정지) — 전사를 입력창에 확정해 확인·수정 후 다시 길게 눌러 이어쓴다.
                // 왼쪽 밀기=취소. 라벨 "받아쓰기"는 정적(세션 중 라벨 전환 금지) + 행위
                // 일반명사 충돌 회피("음성 입력" 금지 — 받아쓴 내용의 "음성"과 낭독 혼동,
                // 실측 2026-07-18). 온디바이스 SpeechAnalyzer(ko-KR) — 서버 왕복 없음.
                HoldDictationButton(
                    speech: speech,
                    hint: "누른 채로 말하고, 손을 떼면 전송합니다. 누른 채 위로 밀면 잠겨서 그때까지 받아쓴 내용이 입력창에 들어가고, 수정한 뒤 다시 길게 눌러 이어서 받아쓸 수 있습니다. 누른 채 왼쪽으로 밀면 취소합니다",
                    showsTitle: false,
                    onTranscript: { text in
                        // 홀드 중 탭 이탈의 늦은 전사 차단(위 isVisible 주석, 리뷰 P1)
                        guard isVisible else { return }
                        // 직전 답변의 지연 완료 시퀀스가 대기 중이면 폐기 — streaming 가드는
                        // "새 질문 전송"만 걸러서, 전송 전 시점엔 통과해 방금 잡은 포커스를
                        // 옛 질문 헤딩으로 되돌린다(gildongmu 리뷰 검출).
                        completionFocusTask?.cancel()
                        completionFocusTask = nil
                        // 초안(타이핑·잠금 확정분)과 새 전사는 병합이 정책(무병합이면 초안이
                        // 고아로 방치): 보내는 것 = 초안 + 받아쓴 말 전부, 초안은 소거.
                        // 통지도 병합 원문 전체 — 사용자가 들은 것이 곧 전송된 것(결정론).
                        let message = mergedInput(with: text)
                        if chatStore.phase == .streaming {
                            // 생성 중엔 전송 불가: 발화 유실 금지 — 초안으로 보존(폴백)
                            inputText = message
                            isSendFocused = true
                            Announce.post(message)
                        } else {
                            // 릴리스=즉시 전송(위원장 실기기 지시 2026-07-20, WhatsApp 동형).
                            // 순서는 헌장 §6 "포커스 먼저, 통지 나중": 보내기 버튼 포커스를
                            // 동기 선점한 뒤 통지. send 가드 거부(첨부 로드 중 등) 시 초안
                            // 복원으로 발화 유실 금지(ChatStore.send Bool 계약).
                            inputText = ""
                            isSendFocused = true
                            Announce.post(message)
                            if !chatStore.send(message) {
                                inputText = message
                            }
                        }
                    },
                    // 잠금(일시정지, 2026-07-20 위원장 재설계): 전사를 초안에 확정해 별도 UI
                    // 없이 확인·수정·이어쓰기. 녹음이 멈춘 뒤라 통지가 발화 금지와 무충돌.
                    // 통지는 "받아쓰기 잠김" + 새 세그먼트만(누적 초안 전체 재낭독은 소음 —
                    // 전체 확인은 입력 필드 탐색으로). 포커스는 건드리지 않는다(손가락이
                    // 아직 마이크 위, 다음 행동이 이어쓰기·수정·전송으로 갈리는 지점).
                    onPause: { segment in
                        guard isVisible else { return }
                        completionFocusTask?.cancel()
                        completionFocusTask = nil
                        if let segment {
                            inputText = mergedInput(with: segment)
                            Announce.post("받아쓰기 잠김, \(segment)")
                        } else {
                            Announce.post("받아쓰기 잠김")
                        }
                    }
                )

                // 전송 중에도 TextField는 disabled 금지(입력은 유지, send가 자체 가드).
                // 전송·중단은 단일 버튼의 라벨 교체 — if/else로 버튼을 갈아끼우면 포커스를
                // 쥔 요소가 제거돼 VO가 최상단으로 리셋된다(§5). `.disabled(빈 입력)`도 같은
                // 이유로 금지(전송 직후 입력이 비면 포커스가 body로 이탈) — 빈 입력 전송은
                // ChatStore.send 가드가 무시한다. 전송 시 VO 포커스가 여기로 선점 이동해
                // 생성 내내 머문다(헌장 §6).
                Button {
                    if chatStore.phase == .streaming {
                        chatStore.stop()
                    } else {
                        send()
                    }
                } label: {
                    Text(chatStore.phase == .streaming ? "중단" : "전송")
                        .frame(minWidth: 44, minHeight: 44)
                        .contentShape(Rectangle())
                }
                .accessibilityFocused($isSendFocused)
            }
        }
        .padding()
        .confirmationDialog("첨부 방식 선택", isPresented: $showAttachmentSourceDialog, titleVisibility: .visible) {
            Button("사진 보관함") { showPhotosPicker = true }
            Button("파일") { showFileImporter = true }
            Button("취소", role: .cancel) {}
        }
        .photosPicker(isPresented: $showPhotosPicker, selection: $selectedPhotoItem, matching: .images)
        .onChange(of: selectedPhotoItem) { _, newItem in
            guard let newItem else { return }
            chatStore.beginAttachmentLoad()
            Task {
                await loadImageAttachment(newItem)
                selectedPhotoItem = nil
            }
        }
        .fileImporter(isPresented: $showFileImporter, allowedContentTypes: [.pdf]) { result in
            handleFileImportResult(result)
        }
    }

    private var attachmentButton: some View {
        Button {
            // 스트리밍 중이면 가드 + 통지 (disabled 금지, 포커스 유지 원칙).
            if chatStore.phase == .streaming {
                Announce.post("답변 작성 중에는 첨부할 수 없어요")
                return
            }
            // 이미 첨부가 있으면 가드 + 통지.
            if chatStore.pendingAttachment != nil {
                Announce.post("첨부는 한 건만 가능해요. 기존 첨부를 제거해 주세요.")
                return
            }
            showAttachmentSourceDialog = true
        } label: {
            Text("파일 첨부")
                .frame(minHeight: 44)
                .contentShape(Rectangle())
        }
    }

    // 필드명 + 값을 한 Text로 합쳐(§한 줄 = 한 접근성 객체) 표시, 제거 버튼은 별도 인터랙티브 요소로 유지.
    private func attachmentRow(filename: String) -> some View {
        HStack {
            Text("첨부: \(filename)")
                .font(.footnote)
            Spacer()
            Button {
                chatStore.clearAttachment()
            } label: {
                Text("첨부 제거")
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
            }
        }
    }

    /// 초안(타이핑·잠금 확정분)과 새 전사 세그먼트의 병합(홀드 릴리스·잠금 공용).
    private func mergedInput(with text: String) -> String {
        inputText.isEmpty ? text : inputText + " " + text
    }

    // 가드로 전송이 거부되면(ChatStore.send가 false 반환) 입력 텍스트를 비우지 않고 보존한다.
    // 전송 성공 시 VO 포커스를 보내기 버튼으로 선점(§6: 생성 내내 유지. 타이핑 전송은
    // 이미 여기라 무이동, 받아쓰기 후 전송도 이미 여기다).
    private func send() {
        let text = inputText
        if chatStore.send(text) {
            inputText = ""
            isSendFocused = true
        }
    }

    /// PhotosPicker 선택물은 원본 포맷(HEIC 등 다양)을 UIImage로 로드 후 JPEG(quality 0.8)로
    /// 재인코딩한다. 서버 허용 MIME이 image/png·jpeg·webp뿐이라 HEIC 호환 문제를 클라이언트에서 회피.
    /// 디코드·재인코딩은 non-main(Task.detached)에서 수행해 메인 스레드 블로킹을 막는다.
    /// 로드 실패 시 attachmentErrorMessage 설정 + Announcement로 사용자에게 알린다(무신호 해소).
    @MainActor
    private func loadImageAttachment(_ item: PhotosPickerItem) async {
        guard let data = try? await item.loadTransferable(type: Data.self) else {
            chatStore.notifyAttachmentLoadFailure()
            return
        }
        let jpegData = await Task.detached(priority: .userInitiated) {
            Self.encodeJPEG(from: data)
        }.value
        guard let jpegData else {
            chatStore.notifyAttachmentLoadFailure()
            return
        }
        chatStore.stageAttachment(mediaType: "image/jpeg", data: jpegData, filename: "photo.jpg")
    }

    /// UIImage 디코드 + JPEG 재인코딩 순수 헬퍼. self를 캡처하지 않는 `nonisolated static`으로 둬
    /// Task.detached에서 안전하게 실행한다(렌더링이 아닌 디코드는 non-main에서도 안전).
    private nonisolated static func encodeJPEG(from data: Data) -> Data? {
        guard let uiImage = UIImage(data: data) else { return nil }
        return uiImage.jpegData(compressionQuality: 0.8)
    }

    /// fileImporter는 보안 스코프 URL을 돌려주므로 접근 시작/종료를 명시적으로 감싼다.
    /// 대용량 파일은 실제 로드 전 파일 크기부터 검증해(§2) 불필요한 메모리 로드를 막고,
    /// Data 읽기 자체도 non-main(Task.detached)에서 수행한다.
    /// 각 단계 실패 시 attachmentErrorMessage 설정 + Announcement로 사용자에게 알린다(무신호 해소).
    private func handleFileImportResult(_ result: Result<URL, Error>) {
        guard case .success(let url) = result else {
            chatStore.notifyAttachmentLoadFailure()
            return
        }
        guard url.startAccessingSecurityScopedResource() else {
            chatStore.notifyAttachmentLoadFailure()
            return
        }
        // 파악 가능한 경우에만 사전 차단(§2), fileSize를 알 수 없으면 로드 후 stageAttachment의
        // 크기 검증이 안전망으로 남는다.
        let fileSize = (try? url.resourceValues(forKeys: [.fileSizeKey]))?.fileSize
        if let fileSize, fileSize > ChatStore.maxAttachmentBytes {
            url.stopAccessingSecurityScopedResource()
            chatStore.notifyAttachmentTooLarge()
            return
        }
        chatStore.beginAttachmentLoad()
        let filename = url.lastPathComponent
        Task {
            defer { url.stopAccessingSecurityScopedResource() }
            let data = await Task.detached(priority: .userInitiated) {
                Self.readPDFData(from: url)
            }.value
            guard let data else {
                chatStore.notifyAttachmentLoadFailure()
                return
            }
            chatStore.stageAttachment(mediaType: "application/pdf", data: data, filename: filename)
        }
    }

    /// PDF 파일 읽기 순수 헬퍼. url은 Sendable이라 액터 경계를 안전하게 넘나든다.
    private nonisolated static func readPDFData(from url: URL) -> Data? {
        try? Data(contentsOf: url)
    }
}
