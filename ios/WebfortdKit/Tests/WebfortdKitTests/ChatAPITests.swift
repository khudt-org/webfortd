import Foundation
import Testing
@testable import WebfortdKit

// StubURLProtocolBase · CapturedRequestBox · requestBodyData는
// Helpers/ChatStubURLProtocol.swift 공용 헬퍼로 승격됨(ThreadsAPITests와 공유, 중복 제거).
// handler는 Suite별 독립 static var(교차-Suite 경합 회피, 헬퍼 파일 주석 판단 기록 참고).
final class ChatStubURLProtocol: StubURLProtocolBase {
    nonisolated(unsafe) static var handler: ((URLRequest) -> APIStub)?
    override class func stubHandler(for request: URLRequest) -> APIStub { handler!(request) }
}

private func chunked(_ data: Data, size: Int = 48) -> [Data] {
    guard !data.isEmpty else { return [] }
    return stride(from: 0, to: data.count, by: size).map { offset in
        data.subdata(in: offset..<min(offset + size, data.count))
    }
}

/// ChatStubURLProtocol.handler가 전역 공유 상태라 스텁 사용 테스트는 이 스위트에서 직렬 실행한다.
@Suite(.serialized) struct ChatAPITests {
    private let baseURL = URL(string: "https://example.test")!

    private func stubbedAPI(tokenProvider: (@Sendable () async -> String?)? = nil) -> ChatAPI {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [ChatStubURLProtocol.self]
        return ChatAPI(
            baseURL: baseURL, session: URLSession(configuration: config), tokenProvider: tokenProvider)
    }

    private func fixtureData() throws -> Data {
        let url = try #require(Bundle.module.url(
            forResource: "Fixtures/chat-stream", withExtension: "sse"))
        return try Data(contentsOf: url)
    }

    @Test func 스트림이_텍스트_메타데이터_finish를_분할_전달_경로로_복원한다() async throws {
        let chunks = chunked(try fixtureData())
        ChatStubURLProtocol.handler = { _ in .init(statusCode: 200, chunks: chunks) }

        var events: [ChatStreamEvent] = []
        for try await event in stubbedAPI().stream(
            messages: [ChatOutgoingMessage(role: "user", text: "보조공학기기 지원 절차가 궁금해요")],
            threadId: nil
        ) {
            events.append(event)
        }

        let text = events.compactMap { event -> String? in
            if case .textDelta(let delta) = event { return delta }
            return nil
        }.joined()
        #expect(text.hasPrefix("한국장애인고용공단을 통해"))

        guard case .metadata(let sourceRefs, let threadId, _)? = events.first(where: {
            if case .metadata = $0 { return true }
            return false
        }) else {
            Issue.record("metadata 이벤트가 있어야 합니다.")
            return
        }
        #expect(sourceRefs.count == 3)
        #expect(sourceRefs.first?.slug == "2024-jbu-p-016")
        #expect(threadId == nil)
        #expect(events.last == .finish)
    }

    @Test func 첨부가_있으면_text_파트_뒤에_file_파트를_추가로_인코딩한다() async throws {
        let box = CapturedRequestBox()
        ChatStubURLProtocol.handler = { request in
            box.request = request
            return .init(statusCode: 200, chunks: [])
        }

        let attachment = ChatAttachment(mediaType: "image/jpeg", dataBase64: "AAAA", filename: "photo.jpg")
        let message = ChatOutgoingMessage(
            role: "user", text: "이 이미지에 뭐라고 쓰여 있어?", attachment: attachment)
        for try await _ in stubbedAPI().stream(messages: [message], threadId: nil) {}

        let request = try #require(box.request)
        let json = try JSONSerialization.jsonObject(with: requestBodyData(request)) as? [String: Any]
        let messages = try #require(json?["messages"] as? [[String: Any]])
        let parts = try #require(messages.first?["parts"] as? [[String: Any]])
        #expect(parts.count == 2)
        #expect(parts[0]["type"] as? String == "text")
        #expect(parts[0]["text"] as? String == "이 이미지에 뭐라고 쓰여 있어?")
        #expect(parts[1]["type"] as? String == "file")
        #expect(parts[1]["mediaType"] as? String == "image/jpeg")
        #expect(parts[1]["filename"] as? String == "photo.jpg")
        #expect(parts[1]["url"] as? String == "data:image/jpeg;base64,AAAA")
    }

    @Test func 첨부_단독_전송은_빈_text_파트_없이_file_파트만_인코딩한다() async throws {
        let box = CapturedRequestBox()
        ChatStubURLProtocol.handler = { request in
            box.request = request
            return .init(statusCode: 200, chunks: [])
        }

        let attachment = ChatAttachment(mediaType: "application/pdf", dataBase64: "AAAA", filename: "a.pdf")
        let message = ChatOutgoingMessage(role: "user", text: "", attachment: attachment)
        for try await _ in stubbedAPI().stream(messages: [message], threadId: nil) {}

        let request = try #require(box.request)
        let json = try JSONSerialization.jsonObject(with: requestBodyData(request)) as? [String: Any]
        let messages = try #require(json?["messages"] as? [[String: Any]])
        let parts = try #require(messages.first?["parts"] as? [[String: Any]])
        #expect(parts.count == 1)
        #expect(parts[0]["type"] as? String == "file")
    }

    @Test func 첨부가_없으면_file_파트를_추가하지_않는다() async throws {
        let box = CapturedRequestBox()
        ChatStubURLProtocol.handler = { request in
            box.request = request
            return .init(statusCode: 200, chunks: [])
        }

        for try await _ in stubbedAPI().stream(
            messages: [ChatOutgoingMessage(role: "user", text: "첨부 없는 질문")], threadId: nil
        ) {}

        let request = try #require(box.request)
        let json = try JSONSerialization.jsonObject(with: requestBodyData(request)) as? [String: Any]
        let messages = try #require(json?["messages"] as? [[String: Any]])
        let parts = try #require(messages.first?["parts"] as? [[String: Any]])
        #expect(parts.count == 1)
        #expect(parts[0]["type"] as? String == "text")
    }

    @Test func tokenProvider가_있으면_Authorization_헤더를_부착한다() async throws {
        let box = CapturedRequestBox()
        ChatStubURLProtocol.handler = { request in
            box.request = request
            return .init(statusCode: 200, chunks: [])
        }

        let api = stubbedAPI(tokenProvider: { "jwt-abc" })
        for try await _ in api.stream(
            messages: [ChatOutgoingMessage(role: "user", text: "질문")], threadId: nil
        ) {}

        let request = try #require(box.request)
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer jwt-abc")
    }

    @Test func tokenProvider가_없으면_Authorization_헤더를_부착하지_않는다() async throws {
        let box = CapturedRequestBox()
        ChatStubURLProtocol.handler = { request in
            box.request = request
            return .init(statusCode: 200, chunks: [])
        }

        for try await _ in stubbedAPI().stream(
            messages: [ChatOutgoingMessage(role: "user", text: "질문")], threadId: nil
        ) {}

        let request = try #require(box.request)
        #expect(request.value(forHTTPHeaderField: "Authorization") == nil)
    }

    @Test func rate_limit_429_응답은_rateLimited_오류를_던진다() async throws {
        ChatStubURLProtocol.handler = { _ in .init(statusCode: 429, chunks: []) }

        do {
            for try await _ in stubbedAPI().stream(
                messages: [ChatOutgoingMessage(role: "user", text: "질문")], threadId: nil
            ) {}
            Issue.record("ChatAPIError.rateLimited가 던져져야 합니다.")
        } catch let error as ChatAPIError {
            #expect(error == .rateLimited)
        }
    }
}
