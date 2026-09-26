import SwiftUI
import WebfortdKit

/// 자료실: 정책 PDF 목록 + 다운로드·캐시·QuickLook 미리보기.
/// 상태 3분리(미캐시·다운로드 중·캐시됨): 트레일링 버튼 라벨(받기·중단·열기)이 곧 텍스트 신호.
struct LibraryView: View {
    // DeveloperToolsSupport(Xcode Preview 라이브러리)에도 동명 타입이 있어 완전 수식 필요.
    let items: [WebfortdKit.LibraryItem]?

    @State private var downloadStore = LibraryDownloadStore()
    @State private var previewItem: PreviewItem?

    private struct PreviewItem: Identifiable {
        let url: URL
        var id: String { url.absoluteString }
    }

    var body: some View {
        Group {
            if let items, items.isEmpty {
                // 3-state: 비어 있음은 실패와 다른 문구로(번들은 있으나 항목 0건).
                ContentUnavailableView("아직 등록된 자료가 없습니다", systemImage: "tray")
            } else if let items {
                List(items) { item in
                    row(item)
                }
            } else {
                // 3-state: 번들 결함은 "자료 0건"이 아니라 실패로 알린다.
                ContentUnavailableView(
                    "자료를 불러오지 못했습니다",
                    systemImage: "exclamationmark.triangle",
                    description: Text("앱 콘텐츠 번들이 없습니다. 개발 중이라면 node ios/scripts/bundle-content.mjs 실행 후 다시 빌드하세요."))
            }
        }
        .navigationTitle("자료실")
        .task {
            downloadStore.restoreCachedStates(slugs: (items ?? []).map(\.slug))
        }
        .sheet(item: $previewItem) { item in
            // QLPreviewController 단독 표시는 자체 Done 버튼·드래그 그리퍼가 없어(실기 확인) 명시적
            // 닫기 버튼을 감싼다. 모달은 접근 가능한 닫는 수단이 필수(완결성, 잉여 아님).
            NavigationStack {
                QuickLookPreview(fileURL: item.url)
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .confirmationAction) {
                            // 44pt frame은 label 안쪽 + contentShape(바깥 frame은 히트 영역을 안 넓힌다)
                            Button {
                                previewItem = nil
                            } label: {
                                Text("닫기")
                                    .frame(minWidth: 44, minHeight: 44)
                                    .contentShape(Rectangle())
                            }
                        }
                    }
            }
        }
    }

    @ViewBuilder
    private func row(_ item: WebfortdKit.LibraryItem) -> some View {
        let state = downloadStore.state(for: item.slug)
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                // 한 줄 = 한 접근성 객체: 제목·연도·기관·파일 크기를 단일 텍스트로 결합.
                Text("\(item.title), \(item.year)년, \(item.organization), \(item.fileSize)")
                Text(item.summary)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            .accessibilityElement(children: .combine)
            Spacer()
            // 인터랙티브 요소(버튼)는 위 텍스트와 합치지 않고 별도 접근성 객체로 유지.
            trailingControl(item: item, state: state)
        }
        .padding(.vertical, 4)
        .frame(minHeight: 44)
        .swipeActions(edge: .trailing) {
            if case .cached = state {
                Button("받은 파일 삭제", role: .destructive) {
                    downloadStore.deleteCached(slug: item.slug)
                }
            }
        }
        .contextMenu {
            if case .cached = state {
                Button("받은 파일 삭제", role: .destructive) {
                    downloadStore.deleteCached(slug: item.slug)
                }
            }
        }
    }

    @ViewBuilder
    private func trailingControl(item: WebfortdKit.LibraryItem, state: LibraryDownloadStore.State) -> some View {
        // 44pt frame은 label 안쪽 + contentShape(바깥 frame은 히트 영역을 안 넓힌다)
        switch state {
        case .notCached:
            Button {
                downloadStore.startDownload(item: item)
            } label: {
                Text("받기")
                    .frame(minWidth: 44, minHeight: 44)
                    .contentShape(Rectangle())
            }
        case .downloading:
            HStack(spacing: 8) {
                // 시각 스피너 보조 표시. 상태 구분은 "중단" 버튼 라벨(텍스트)이 전달하므로 중복 낭독 방지.
                ProgressView()
                    .accessibilityHidden(true)
                Button {
                    downloadStore.cancelDownload(slug: item.slug)
                } label: {
                    Text("중단")
                        .frame(minWidth: 44, minHeight: 44)
                        .contentShape(Rectangle())
                }
            }
        case .cached(let fileURL):
            Button {
                if let cachedURL = downloadStore.cachedURLIfExists(for: item.slug) {
                    previewItem = PreviewItem(url: cachedURL)
                } else {
                    Announce.post("받은 파일이 삭제되어 다시 받아야 해요", interrupting: true)
                }
            } label: {
                Text("열기")
                    .frame(minWidth: 44, minHeight: 44)
                    .contentShape(Rectangle())
            }
        }
    }
}
