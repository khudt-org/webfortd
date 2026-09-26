import SwiftUI
import WebfortdKit

struct DocumentView: View {
    let store: KBStore?
    let slug: String
    @State private var blocks: [KBBlock]?
    @State private var loadFailed = false

    var body: some View {
        Group {
            if let store, let summary = store.summary(slug: slug) {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        Text(summary.frontmatter.title)
                            .font(.largeTitle).bold()
                            .accessibilityAddTraits(.isHeader)
                        if let blocks {
                            BlockRenderer(blocks: blocks)
                        } else if loadFailed {
                            Text("본문을 불러오지 못했습니다.")
                        } else {
                            ProgressView("불러오는 중")
                        }
                        sourceFooter(summary)
                        backlinkSection(store: store)
                    }
                    .padding()
                }
            } else {
                // 미지 slug(깨진 내부 링크 등)와 로드 실패를 구분해 알린다.
                ContentUnavailableView("문서를 찾을 수 없습니다", systemImage: "questionmark.circle",
                    description: Text("링크가 가리키는 문서가 아직 공개되지 않았을 수 있습니다."))
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .task(id: slug) {
            blocks = nil
            loadFailed = false
            guard let store, let summary = store.summary(slug: slug) else { return }
            do {
                let body = try store.loadBody(slug: slug)
                blocks = MarkdownBlockParser.parse(body)
                    .droppingLeadingTitleHeading(title: summary.frontmatter.title)
            } catch {
                loadFailed = true
            }
        }
    }

    private func sourceFooter(_ summary: KBDocumentSummary) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Divider()
            // 한 줄 = 한 객체: 출처 전체를 단일 텍스트로.
            Text("출처: \(summary.frontmatter.source.citation), \(summary.frontmatter.source.organization)")
                .font(.footnote)
                .foregroundStyle(.secondary)
            if let urlString = summary.frontmatter.source.url, let url = URL(string: urlString) {
                // 44pt frame은 label 안쪽 + contentShape(바깥 frame은 히트 영역을 안 넓힌다)
                Link(destination: url) {
                    Text("원문 보기")
                        .font(.footnote)
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                }
            }
        }
        .padding(.top, 16)
    }

    @ViewBuilder
    private func backlinkSection(store: KBStore) -> some View {
        // summary 미해석 백링크는 미리 걸러낸다 — 원본이 비어 있지 않아도 해석되는 행이
        // 0건이면 헤딩만 남은 빈 섹션이 되므로, 비어 있음 판정은 해석 결과로 한다.
        let backlinks = store.backlinks(slug: slug).compactMap { backlink in
            store.summary(slug: backlink.from).map { (slug: backlink.from, title: $0.frontmatter.title) }
        }

        if !backlinks.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Divider()
                    .padding(.top, 16)
                Text("이 문서를 참조하는 문서")
                    .font(.headline)
                    .accessibilityAddTraits(.isHeader)

                VStack(alignment: .leading, spacing: 0) {
                    ForEach(backlinks, id: \.slug) { backlink in
                        // 44pt frame은 label 안쪽 + contentShape(바깥 frame은 히트 영역을
                        // 안 넓힌다 — ScrollView라 List 행 전체 탭도 없음)
                        NavigationLink(value: AppRoute.document(slug: backlink.slug)) {
                            Text(backlink.title)
                                .frame(minHeight: 44)
                                .contentShape(Rectangle())
                        }
                    }
                }
            }
        }
    }
}
