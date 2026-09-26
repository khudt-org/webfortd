import Foundation
import Markdown

/// swift-markdown Document → [KBBlock]. GFM 표 지원이 채택 근거(161개 문서가 표 사용).
public enum MarkdownBlockParser {
    public static func parse(_ markdown: String) -> [KBBlock] {
        let document = Document(parsing: stripUnderscorePseudoTags(markdown))
        return document.children.compactMap { convertBlock($0) }
    }

    /// CommonMark HTML 태그명 문법(ASCII 문자·숫자·하이픈만 허용, 언더스코어 불가)상
    /// `<page_header>` 같은 태그는 HTML로 인식되지 않고 Paragraph 안의 리터럴 Text로
    /// 파싱된다. 아래 HTMLBlock/InlineHTML 분기를 전혀 타지 않고 plain에 그대로 누출된다
    /// (코퍼스 실측 42개 태그 쌍/84회 출현, 전부 `page_header` 단일 태그명).
    /// 언더스코어를 포함한 태그명의 의사 태그(속성 없는 열림/닫힘 토큰)만 제거한다.
    /// 유효 HTML 태그명은 언더스코어가 없어 매치하지 않으므로 기존 처리와 회귀 충돌 없음.
    /// `<개정 2022. 1. 18.>` 같은 한국어 표기는 첫 글자가 ASCII 문자가 아니라 안전.
    /// 블록 HTML에서 벗길 토큰: 주석(`<!-- p.3 -->`, 여러 줄 가능)과 실제 태그 문법(ASCII 문자로
    /// 시작하는 태그명 + 선택 속성)만. `<[^>]+>`처럼 꺾쇠 전체를 지우면 블록 안의
    /// `<개정 2022. 1. 18.>`·`<표 3>` 같은 한국어 꺾쇠 표기까지 사라진다.
    nonisolated(unsafe) private static let htmlTagOrComment = /<!--[\s\S]*?-->|<\/?[A-Za-z][A-Za-z0-9_-]*(?:\s[^<>]*)?\/?>/

    nonisolated(unsafe) private static let underscorePseudoTag = /<\/?[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)+>/

    /// 펜스 코드블록 내부는 전처리하지 않는다(라인 기반 fence 토글).
    /// `WikilinkRewriter.rewrite`와 같은 방식이지만, 그쪽은 fence 토글과 실제 치환 로직이
    /// 한 함수에 결합돼 있어 그대로 재사용하면 결합이 더 어색해진다. 여기서는 독립된
    /// private 헬퍼로 단순 복제한다(두 벌 다 짧은 라인 순회라 추상화 이득이 크지 않음).
    /// 제거 후 앞뒤 공백 정리는 하지 않는다. 태그만 있던 라인은 빈 라인이 되어 cmark가 자연 처리.
    private static func stripUnderscorePseudoTags(_ markdown: String) -> String {
        var out: [Substring] = []
        var inFence = false
        for line in markdown.split(separator: "\n", omittingEmptySubsequences: false) {
            if line.trimmingCharacters(in: .whitespaces).hasPrefix("```") {
                inFence.toggle()
                out.append(line)
                continue
            }
            guard !inFence else { out.append(line); continue }
            out.append(Substring(line.replacing(underscorePseudoTag, with: "")))
        }
        return out.joined(separator: "\n")
    }

    private static func convertBlock(_ markup: Markup) -> KBBlock? {
        switch markup {
        case let heading as Heading:
            return .heading(level: heading.level, content: inline(of: heading))
        case let paragraph as Paragraph:
            // 단독 이미지 문단은 image 블록으로 승격(렌더러가 AsyncImage+alt 처리).
            if paragraph.childCount == 1, let image = paragraph.child(at: 0) as? Markdown.Image {
                return .image(source: image.source ?? "", alt: image.plainText)
            }
            return .paragraph(inline(of: paragraph))
        case let list as UnorderedList:
            return .bulletList(list.listItems.map { item in
                item.children.compactMap { convertBlock($0) }
            })
        case let list as OrderedList:
            return .orderedList(
                list.listItems.map { item in item.children.compactMap { convertBlock($0) } },
                start: Int(list.startIndex))
        case let table as Markdown.Table:
            // cells/rows는 LazyMapSequence: .map을 이어붙이면 lazy 체이닝이 지속돼
            // [KBInline]/[[KBInline]]로 바로 대입되지 않는다(swift-markdown 0.8.0 실측). Array(...)로 즉시 평가.
            let header = Array(table.head.cells.map { inline(of: $0) })
            let rows = Array(table.body.rows.map { row in Array(row.cells.map { inline(of: $0) }) })
            return .table(header: header, rows: rows)
        case let code as CodeBlock:
            return .codeBlock(code: code.code.trimmingCharacters(in: .newlines),
                              language: code.language)
        case let quote as BlockQuote:
            return .blockquote(quote.children.compactMap { convertBlock($0) })
        case is ThematicBreak:
            return .thematicBreak
        case let html as HTMLBlock:
            // 블록 레벨 HTML은 태그를 제거하고 내부 텍스트만 보존한다.
            // 웹 브라우저가 미지 태그를 무시하고 내부 텍스트만 렌더링하는 동작과 등가이며,
            // 태그 토큰(`<aside>`·`<page_header>` 등)은 스크린리더 낭독 노이즈일 뿐이다.
            // 태그만 있고 내부 텍스트가 없으면 블록 자체를 생략(빈 문단 방지).
            let text = html.rawHTML.replacing(htmlTagOrComment, with: "")
                .trimmingCharacters(in: .whitespacesAndNewlines)
            guard !text.isEmpty else { return nil }
            return .paragraph(KBInline(attributed: AttributedString(text), plain: text))
        default:
            // 미지 블록은 평문 폴백(전방 호환).
            let text = markup.format().trimmingCharacters(in: .whitespacesAndNewlines)
            guard !text.isEmpty else { return nil }
            return .paragraph(KBInline(attributed: AttributedString(text), plain: text))
        }
    }

    /// 인라인 마크업 → AttributedString(+plain). 강조·인라인코드·링크만 반영(미니멀).
    /// plain은 `container.plainText`(원문 재직렬화, 인라인 HTML 태그 포함)가 아니라
    /// **완성된 attributed에서 파생**한다. plain·attributed가 항상 동일한 강등 규칙을
    /// 거치도록 구성상 보장(예: `<br/>` → 공백 1개가 양쪽에 동일 반영). 파라미터 타입은
    /// `container.children` 순회만 쓰므로 기저 프로토콜 `Markup`으로 되돌릴 수 있다
    /// (`plainText` 의존 제거로 `any PlainTextConvertibleMarkup` 좁히기가 불필요해짐).
    private static func inline(of container: Markup) -> KBInline {
        var attributed = AttributedString()
        appendInlines(container.children, to: &attributed, bold: false, italic: false, link: nil)
        return KBInline(attributed: attributed, plain: String(attributed.characters))
    }

    private static func appendInlines(
        _ children: MarkupChildren, to attributed: inout AttributedString,
        bold: Bool, italic: Bool, link: URL?
    ) {
        for child in children {
            switch child {
            case let text as Markdown.Text:
                attributed.append(styled(text.string, bold: bold, italic: italic, link: link))
            case let strong as Strong:
                appendInlines(strong.children, to: &attributed, bold: true, italic: italic, link: link)
            case let emphasis as Emphasis:
                appendInlines(emphasis.children, to: &attributed, bold: bold, italic: true, link: link)
            case let code as InlineCode:
                var run = AttributedString(code.code)
                run.inlinePresentationIntent = .code
                attributed.append(run)
            case let anchor as Markdown.Link:
                let url = anchor.destination.flatMap(URL.init(string:))
                appendInlines(anchor.children, to: &attributed, bold: bold, italic: italic, link: url)
            case let image as Markdown.Image:
                // 인라인 이미지는 alt 텍스트로 강등(단독 이미지는 블록에서 처리).
                attributed.append(styled(image.plainText, bold: bold, italic: italic, link: link))
            case is SoftBreak, is LineBreak:
                attributed.append(AttributedString(" "))
            case let html as InlineHTML:
                // <br>·<br/>·<br >만 공백으로 강등, 그 외 태그 토큰은 버린다(사이 텍스트는 별도 노드).
                if html.rawHTML.lowercased().hasPrefix("<br") {
                    attributed.append(AttributedString(" "))
                }
            default:
                // 미지 인라인(Strikethrough·SymbolLink 등, InlineHTML은 위에서 별도 처리)은 InlineMarkup.plainText로 강등.
                // `Markup`(기저 프로토콜) 자체엔 plainText가 없어(swift-markdown 0.8.0 실측) 하위 프로토콜로 캐스팅.
                let text = (child as? InlineMarkup)?.plainText ?? child.format()
                attributed.append(styled(text, bold: bold, italic: italic, link: link))
            }
        }
    }

    private static func styled(_ string: String, bold: Bool, italic: Bool, link: URL?) -> AttributedString {
        var run = AttributedString(string)
        switch (bold, italic) {
        case (true, true): run.inlinePresentationIntent = [.stronglyEmphasized, .emphasized]
        case (true, false): run.inlinePresentationIntent = .stronglyEmphasized
        case (false, true): run.inlinePresentationIntent = .emphasized
        case (false, false): break
        }
        if let link { run.link = link }
        return run
    }
}
