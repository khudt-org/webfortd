import Foundation

/// Webfortd `/api/chat` 스트리밍 호출: dodo-planet `ChatAPI` 패턴을 따른다.
/// `URLSession.bytes(for:)` + `bytes.lines`로 SSE를 줄 단위 소비하고,
/// 소비자 `Task` 취소가 `onTermination`을 통해 내부 네트워크 `Task`까지 전파된다.
public struct ChatAPI: Sendable {
    private let baseURL: URL
    private let session: URLSession
    private let tokenProvider: (@Sendable () async -> String?)?

    /// `tokenProvider`가 nil이면(기본값) 익명 요청 그대로, 기존 M2 호출부 무변경.
    /// 값이 있고 토큰을 반환하면 `Authorization: Bearer <token>` 헤더를 부착한다(M3, RFC 7235 표준 대문자 스킴).
    public init(baseURL: URL, session: URLSession = .shared,
                tokenProvider: (@Sendable () async -> String?)? = nil) {
        self.baseURL = baseURL
        self.session = session
        self.tokenProvider = tokenProvider
    }

    /// `messages` 전체(대화 이력 포함)를 UIMessage JSON으로 인코딩해 POST, 이벤트 스트림 반환.
    public func stream(
        messages: [ChatOutgoingMessage], threadId: String?
    ) -> AsyncThrowingStream<ChatStreamEvent, Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    try await Self.run(
                        messages: messages, threadId: threadId,
                        baseURL: baseURL, session: session, tokenProvider: tokenProvider,
                        continuation: continuation)
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    private static func run(
        messages: [ChatOutgoingMessage],
        threadId: String?,
        baseURL: URL,
        session: URLSession,
        tokenProvider: (@Sendable () async -> String?)?,
        continuation: AsyncThrowingStream<ChatStreamEvent, Error>.Continuation
    ) async throws {
        var request = URLRequest(url: baseURL.appendingPathComponent("api/chat"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let provider = tokenProvider, let token = await provider() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        request.httpBody = try encodeBody(messages: messages, threadId: threadId)
        request.timeoutInterval = 60

        let (bytes, response) = try await session.bytes(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw ChatAPIError.server(status: -1)
        }
        guard httpResponse.statusCode != 429 else {
            throw ChatAPIError.rateLimited
        }
        guard (200..<300).contains(httpResponse.statusCode) else {
            throw ChatAPIError.server(status: httpResponse.statusCode)
        }

        for try await line in bytes.lines {
            guard let event = ChatStreamParser.parse(line: line) else { continue }
            continuation.yield(event)
        }
    }

    /// UIMessage 인코딩: `{"messages":[{"id":<uuid>,"role":role,"parts":[{"type":"text","text":text}, <file part>?]}], "threadId"?}`.
    /// 첨부가 있으면 text part 뒤에 file part(`{type:"file", mediaType, url:"data:<mime>;base64,...", filename}`)를
    /// 이어 붙인다(웹 `ChatUI.tsx` `files:[{type:'file', ...}]` 계약 미러).
    private static func encodeBody(messages: [ChatOutgoingMessage], threadId: String?) throws -> Data {
        let payload = UIMessagesPayload(
            messages: messages.map { message in
                // 첨부 단독 전송(텍스트 없음)은 빈 text 파트를 싣지 않는다(서버는 첨부만으로 허용).
                var parts: [UIMessagesPayload.Part] =
                    message.text.isEmpty && message.attachment != nil ? [] : [.text(message.text)]
                if let attachment = message.attachment {
                    parts.append(.file(
                        mediaType: attachment.mediaType,
                        url: "data:\(attachment.mediaType);base64,\(attachment.dataBase64)",
                        filename: attachment.filename))
                }
                return UIMessagesPayload.Message(id: UUID().uuidString, role: message.role, parts: parts)
            },
            threadId: threadId)
        return try JSONEncoder().encode(payload)
    }

    private struct UIMessagesPayload: Encodable {
        enum Part: Encodable {
            case text(String)
            case file(mediaType: String, url: String, filename: String)

            private enum CodingKeys: String, CodingKey {
                case type, text, mediaType, url, filename
            }

            func encode(to encoder: Encoder) throws {
                var container = encoder.container(keyedBy: CodingKeys.self)
                switch self {
                case .text(let text):
                    try container.encode("text", forKey: .type)
                    try container.encode(text, forKey: .text)
                case .file(let mediaType, let url, let filename):
                    try container.encode("file", forKey: .type)
                    try container.encode(mediaType, forKey: .mediaType)
                    try container.encode(url, forKey: .url)
                    try container.encode(filename, forKey: .filename)
                }
            }
        }
        struct Message: Encodable {
            let id: String
            let role: String
            let parts: [Part]
        }
        let messages: [Message]
        let threadId: String?

        enum CodingKeys: String, CodingKey {
            case messages, threadId
        }

        func encode(to encoder: Encoder) throws {
            var container = encoder.container(keyedBy: CodingKeys.self)
            try container.encode(messages, forKey: .messages)
            try container.encodeIfPresent(threadId, forKey: .threadId)
        }
    }
}
