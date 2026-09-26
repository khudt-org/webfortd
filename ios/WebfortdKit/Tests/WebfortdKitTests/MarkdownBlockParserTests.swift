import Foundation
import Testing
@testable import WebfortdKit

@Suite struct MarkdownBlockParserTests {
    @Test func 헤딩과_문단을_파싱한다() {
        let blocks = MarkdownBlockParser.parse("## 제1조\n\n본 협약의 유효기간.")
        guard case let .heading(level, h) = blocks[0], case let .paragraph(p) = blocks[1] else {
            Issue.record("블록 종류 불일치: \(blocks)"); return
        }
        #expect(level == 2)
        #expect(h.plain == "제1조")
        #expect(p.plain == "본 협약의 유효기간.")
    }

    @Test func 표를_헤더와_행으로_파싱한다() {
        let md = "| 구분 | 내용 |\n|---|---|\n| 기간 | 2년 |\n| 대상 | 전체 |"
        let blocks = MarkdownBlockParser.parse(md)
        guard case let .table(header, rows) = blocks[0] else {
            Issue.record("table 아님: \(blocks)"); return
        }
        #expect(header.map(\.plain) == ["구분", "내용"])
        #expect(rows.count == 2)
        #expect(rows[0].map(\.plain) == ["기간", "2년"])
    }

    @Test func 내부_링크가_attributed에_반영된다() {
        let blocks = MarkdownBlockParser.parse("[협약 전문](webfortd-wiki://target-a) 참조")
        guard case let .paragraph(inline) = blocks[0] else {
            Issue.record("paragraph 아님"); return
        }
        #expect(inline.plain == "협약 전문 참조")
        let links = inline.attributed.runs.compactMap(\.link)
        #expect(links == [URL(string: "webfortd-wiki://target-a")])
    }

    @Test func 리스트_항목을_파싱한다() {
        let blocks = MarkdownBlockParser.parse("- 첫째\n- 둘째")
        guard case let .bulletList(items) = blocks[0] else {
            Issue.record("bulletList 아님"); return
        }
        #expect(items.count == 2)
        guard case let .paragraph(first) = items[0][0] else {
            Issue.record("항목 내부가 paragraph 아님"); return
        }
        #expect(first.plain == "첫째")
    }

    @Test func 단독_이미지는_image_블록이_된다() {
        let blocks = MarkdownBlockParser.parse("![조직도 설명](/source-images/a.png)")
        guard case let .image(source, alt) = blocks[0] else {
            Issue.record("image 아님: \(blocks)"); return
        }
        #expect(source == "/source-images/a.png")
        #expect(alt == "조직도 설명")
    }

    @Test func 인라인_HTML_br은_공백으로_강등된다() {
        let blocks = MarkdownBlockParser.parse("| 구분 |\n|---|\n| 장애유형<br/>대분류 |")
        guard case let .table(_, rows) = blocks[0] else {
            Issue.record("table 아님: \(blocks)"); return
        }
        #expect(rows[0][0].plain == "장애유형 대분류")
        #expect(!rows[0][0].plain.contains("<"))
    }

    @Test func 블록_HTML은_태그를_벗기고_내부_텍스트만_남긴다() {
        let blocks = MarkdownBlockParser.parse("<aside>\n중요 안내\n</aside>")
        guard case let .paragraph(inline) = blocks.first else {
            Issue.record("paragraph 아님: \(blocks)"); return
        }
        #expect(inline.plain == "중요 안내")
        #expect(!inline.plain.contains("<"))
    }

    @Test func 블록_HTML_안의_한국어_꺾쇠_표기는_보존된다() {
        let blocks = MarkdownBlockParser.parse("<div>\n제4조 <개정 2022. 1. 18.> <표 3> 참조\n</div>")
        guard case let .paragraph(inline) = blocks.first else {
            Issue.record("paragraph 아님: \(blocks)"); return
        }
        #expect(inline.plain == "제4조 <개정 2022. 1. 18.> <표 3> 참조")
    }

    @Test func 블록_HTML_주석과_속성_있는_태그는_벗겨진다() {
        let blocks = MarkdownBlockParser.parse("<div class=\"note\">\n<!-- p.3\n(pdf 5) -->안내 <br/>문구\n</div>")
        guard case let .paragraph(inline) = blocks.first else {
            Issue.record("paragraph 아님: \(blocks)"); return
        }
        #expect(inline.plain == "안내 문구")
    }

    @Test func 태그만_있는_블록_HTML은_생략된다() {
        let blocks = MarkdownBlockParser.parse("문단\n\n</div>")
        #expect(blocks.count == 1)
    }

    @Test func 언더스코어_의사_태그는_전처리로_제거된다() {
        let blocks = MarkdownBlockParser.parse("<page_header>\n장애인교원 인사관리\n</page_header>")
        guard case let .paragraph(inline) = blocks.first else {
            Issue.record("paragraph 아님: \(blocks)"); return
        }
        #expect(inline.plain == "장애인교원 인사관리")
        #expect(!inline.plain.contains("<"))
    }

    @Test func 펜스_코드블록_안의_의사_태그는_보존된다() {
        let blocks = MarkdownBlockParser.parse("```\n<page_header>\n```")
        guard case let .codeBlock(code, _) = blocks.first else {
            Issue.record("codeBlock 아님: \(blocks)"); return
        }
        #expect(code.contains("<page_header>"))
    }

    /// 번들은 gitignore라 fresh clone·worktree엔 없다. 없으면 통과가 아니라 skip으로 드러낸다
    /// (조용한 통과는 스모크가 도는 줄 알게 만든다).
    static let bundledStore: KBStore? = {
        guard let store = try? KBStore.bundled(), !store.documents.isEmpty else { return nil }
        return store
    }()

    @Test(.enabled(if: bundledStore != nil, "콘텐츠 번들 없음 — node ios/scripts/bundle-content.mjs 후 실행"))
    func 번들_전량_파싱_스모크() throws {
        let store = try #require(Self.bundledStore)
        var emptySlugs: [String] = []
        var tagsRemaining: [(slug: String, pattern: String)] = []
        for doc in store.documents {
            let blocks = MarkdownBlockParser.parse(try store.loadBody(slug: doc.slug))
            if blocks.isEmpty { emptySlugs.append(doc.slug) }

            // plain 텍스트 전량 수집 후 마크다운 tag 잔존 검사(KBBlock.plainLines가 정본).
            let allPlain = blocks.plainLines.joined(separator: " ")
            for pattern in ["<page_header", "<br", "</", "<!--", "[[", "]]"] {
                if allPlain.contains(pattern) {
                    tagsRemaining.append((slug: doc.slug, pattern: pattern))
                }
            }
        }
        #expect(emptySlugs.isEmpty, "빈 파싱 결과: \(emptySlugs)")
        #expect(tagsRemaining.isEmpty, "마크다운 tag 잔존: \(tagsRemaining)")
    }

    @Test func 첫_heading이_제목과_같으면_제거한다() {
        let blocks = MarkdownBlockParser.parse("# 제1조【유효기간】\n\n본문.")
            .droppingLeadingTitleHeading(title: "제1조【유효기간】")
        guard case .paragraph = blocks.first else {
            Issue.record("첫 블록이 paragraph가 아님: \(blocks)"); return
        }
        #expect(blocks.count == 1)
    }

    @Test func 첫_heading이_제목과_다르면_유지한다() {
        let blocks = MarkdownBlockParser.parse("# 다른 제목\n\n본문.")
            .droppingLeadingTitleHeading(title: "제1조【유효기간】")
        #expect(blocks.count == 2)
    }
}
