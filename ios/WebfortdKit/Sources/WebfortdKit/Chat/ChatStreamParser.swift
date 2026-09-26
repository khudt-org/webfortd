import Foundation

/// 웹 `/api/chat` UIMessage 스트림(SSE)에서 앱이 관심 있는 이벤트 3종.
public enum ChatStreamEvent: Equatable, Sendable {
    case textDelta(String)
    /// `historyUnsaved`: 로그인 요청인데 서버가 이력을 저장하지 못했다(무효 토큰·저장 실패). 성공·익명은 false.
    case metadata(sourceRefs: [ChatSourceRef], threadId: String?, historyUnsaved: Bool)
    case finish
}

/// SSE 한 줄(`data: {...}`)을 `ChatStreamEvent`로 디코딩한다. UI 상태·네트워크 비의존 순수 함수.
public enum ChatStreamParser {
    private static let dataPrefix = "data: "

    /// 관심 없는 타입·빈 줄·`[DONE]`·파싱 불가 라인은 모두 nil(로그 없이 무시).
    public static func parse(line: String) -> ChatStreamEvent? {
        guard line.hasPrefix(dataPrefix) else { return nil }
        let payload = String(line.dropFirst(dataPrefix.count))
        guard payload != "[DONE]" else { return nil }
        guard let data = payload.data(using: .utf8),
              let envelope = try? JSONDecoder().decode(Envelope.self, from: data)
        else { return nil }

        switch envelope.type {
        case "text-delta":
            guard let delta = envelope.delta else { return nil }
            return .textDelta(delta)
        case "message-metadata":
            return .metadata(
                sourceRefs: envelope.messageMetadata?.sourceRefs ?? [],
                threadId: envelope.messageMetadata?.threadId,
                historyUnsaved: envelope.messageMetadata?.historyUnsaved ?? false)
        case "finish":
            return .finish
        default:
            // start, start-step, text-start, text-end, finish-step 등 미지 타입은 전방 호환상 무시.
            return nil
        }
    }

    private struct Envelope: Decodable {
        let type: String
        let delta: String?
        let messageMetadata: MessageMetadata?
    }

    private struct MessageMetadata: Decodable {
        let sourceRefs: [ChatSourceRef]?
        let threadId: String?
        let historyUnsaved: Bool?
    }
}
