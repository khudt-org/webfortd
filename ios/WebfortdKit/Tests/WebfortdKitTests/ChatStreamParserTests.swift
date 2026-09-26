import Foundation
import Testing
@testable import WebfortdKit

// Fixtures/chat-stream.sse: 2026-07-10 /api/chat prod 실캡처(SSE, UIMessage stream).
@Suite struct ChatStreamParserTests {
    private func fixtureLines() throws -> [String] {
        let url = try #require(Bundle.module.url(
            forResource: "Fixtures/chat-stream", withExtension: "sse"))
        let raw = try String(contentsOf: url, encoding: .utf8)
        return raw.components(separatedBy: "\n")
    }

    private func fixtureEvents() throws -> [ChatStreamEvent] {
        try fixtureLines().compactMap(ChatStreamParser.parse(line:))
    }

    @Test func textDelta를_모두_이어붙이면_전체_답변이_복원된다() throws {
        let text = try fixtureEvents().compactMap { event -> String? in
            if case .textDelta(let delta) = event { return delta }
            return nil
        }.joined()
        #expect(text.hasPrefix("한국장애인고용공단을 통해 보조공학기기 지원을"))
    }

    @Test func metadata_이벤트가_sourceRefs_3건과_첫_slug를_담는다() throws {
        let metadataEvent = try fixtureEvents().first {
            if case .metadata = $0 { return true }
            return false
        }
        guard case .metadata(let sourceRefs, let threadId, let historyUnsaved) = metadataEvent else {
            Issue.record("metadata 이벤트가 있어야 합니다.")
            return
        }
        #expect(sourceRefs.count == 3)
        #expect(sourceRefs.first?.slug == "2024-jbu-p-016")
        #expect(threadId == nil)
        #expect(historyUnsaved == false)
    }

    @Test func historyUnsaved_true를_읽는다() {
        let event = ChatStreamParser.parse(line:
            #"data: {"type":"message-metadata","messageMetadata":{"sourceRefs":[],"historyUnsaved":true}}"#)
        #expect(event == .metadata(sourceRefs: [], threadId: nil, historyUnsaved: true))
    }

    @Test func finish_이벤트가_정확히_한_번_등장한다() throws {
        #expect(try fixtureEvents().filter { $0 == .finish }.count == 1)
    }

    @Test func 미지_타입은_nil이다() {
        #expect(ChatStreamParser.parse(line: #"data: {"type":"start"}"#) == nil)
        #expect(ChatStreamParser.parse(line: #"data: {"type":"start-step"}"#) == nil)
        #expect(ChatStreamParser.parse(line: #"data: {"type":"text-start","id":"0"}"#) == nil)
        #expect(ChatStreamParser.parse(line: #"data: {"type":"text-end","id":"0"}"#) == nil)
        #expect(ChatStreamParser.parse(line: #"data: {"type":"finish-step"}"#) == nil)
    }

    @Test func 쓰레기_라인은_nil이다() {
        #expect(ChatStreamParser.parse(line: "") == nil)
        #expect(ChatStreamParser.parse(line: "not even sse") == nil)
        #expect(ChatStreamParser.parse(line: "data: not json") == nil)
        #expect(ChatStreamParser.parse(line: "data: [DONE]") == nil)
    }
}
