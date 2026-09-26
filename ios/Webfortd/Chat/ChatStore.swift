import Foundation
import Observation
import SwiftUI
import WebfortdKit

/// 채팅 메시지 1건. `role`은 `ChatOutgoingMessage`와 동일 표기("user" | "assistant").
struct ChatMessage: Identifiable, Equatable {
    let id: UUID
    let role: String
    var text: String
    var sourceRefs: [ChatSourceRef]
    var isError: Bool = false
    /// 이 질문과 함께 보낸 첨부 파일명(첨부 단독 전송의 표시·이력 문맥용).
    var attachmentFilename: String?
    /// 로그인 상태로 새 대화를 시작했는데 서버가 대화 id를 돌려주지 않은 답변(= 이력 저장 실패).
    var historyNotSaved: Bool = false

    init(role: String, text: String, sourceRefs: [ChatSourceRef] = [], attachmentFilename: String? = nil) {
        id = UUID()
        self.role = role
        self.text = text
        self.sourceRefs = sourceRefs
        self.attachmentFilename = attachmentFilename
    }

    /// 텍스트 없는 질문(첨부 단독 전송, 첨부는 이력에 보존되지 않아 복원 시 파일명도 없음)의 표시 문구.
    var displayText: String {
        guard text.isEmpty, role == "user" else { return text }
        return "첨부: \(attachmentFilename ?? "파일")"
    }
}

/// 채팅 스트리밍 상태 저장소. M2는 익명 동작: threadId는 앱 세션 내에서만 재사용하고
/// 영속화(로그인·서버 저장 이력)는 M3 몫이다.
@MainActor
@Observable
final class ChatStore {
    enum Phase: Equatable {
        case idle
        case streaming
    }

    private(set) var messages: [ChatMessage] = []
    private(set) var phase: Phase = .idle
    /// 마지막 전송이 오류로 끝났으면 오류 문구, 성공(정상 finish)이거나 중단이면 nil.
    /// ChatView가 완료 시 접근성 포커스 이동 여부를 판단하는 데만 쓰인다(오류는 Announcement로
    /// 이미 전달했으므로 focus 이동까지 겹치면 같은 문구가 두 번 낭독된다. 중복 통지 금지).
    private(set) var lastErrorMessage: String?

    /// 전송 대기 중인 첨부(이미지·PDF 1건, 크기 검증 통과분만). 전송 시 마지막 user 메시지에
    /// 실려 나가고, 전송 즉시 클리어된다(웹 계약 미러: 1건만).
    private(set) var pendingAttachment: ChatAttachment?
    /// 10MB 초과 등 첨부 실패 시 표시 문구. 새 첨부가 성공하거나 clearAttachment()가 호출되면 nil.
    private(set) var attachmentErrorMessage: String?
    /// 첨부 데이터 로드(사진 디코드·PDF 읽기) 진행 중 여부. ChatView가 non-main에서 로드하는 동안
    /// true로 두어 send()가 완성 전 첨부를 실어 보내는 race를 막고, 로드 중임을 사용자에게 알린다.
    private(set) var isAttachmentLoading = false
    /// 스트리밍 델타가 반영될 때마다 증가하는 tick. ChatView가 이 값 변화를 관찰해 자동 스크롤을
    /// 트리거한다(시각 사용자용 추적, VoiceOver 포커스 이동은 완료 시 1회만 별도로 처리하므로 영향 없음).
    private(set) var streamTick = 0
    /// `loadThread(id:)`가 messages를 통째로 교체할 때마다 증가하는 tick. ChatView가 이 값
    /// 변화를 관찰해 첫 메시지로 접근성 포커스를 이동한다(streamTick과 동형, 별개 원인의 messages
    /// 변경을 구분해야 하므로 messages.count 변화만으로는 판별할 수 없다).
    private(set) var threadLoadTick = 0
    /// 스트리밍이 자연 완료(오류 포함, finish 도달)될 때마다 증가하는 세대 신호. ChatView의
    /// 완료 포커스 시퀀스(§6: 완료 시에만 질문 헤딩 이동)가 이 값을 관찰한다. 사용자 중단
    /// (stop())은 완료가 아니므로 올리지 않는다 — phase 전이(streaming→idle)만으론 중단과
    /// 완료를 구분할 수 없어 별도 신호가 필요하다(gildongmu answerRevision 동형).
    private(set) var answerRevision = 0

    static let maxAttachmentBytes = 10 * 1024 * 1024 // 10MB, 서버 계약(MAX_FILE_SIZE) 미러
    private static let oversizeAttachmentMessage = "파일이 너무 커요. 10MB 이하만 첨부할 수 있어요."

    private let api: ChatAPI
    /// 로그인 여부. 서버는 무효 토큰을 익명으로 처리하고 저장 실패를 알리지 않으므로, 로그인 상태에서
    /// 새 대화의 threadId가 오지 않은 것을 iOS가 저장 실패로 판정하는 근거로만 쓴다.
    private let isSignedIn: @MainActor () -> Bool
    /// internal(비-private): `ThreadListSheet`가 별도 `ThreadsAPI` 인스턴스를 새로 만들지 않고
    /// 이 인스턴스를 재사용한다(같은 tokenProvider를 중복 구성하지 않기 위함).
    let threadsAPI: ThreadsAPI
    private var streamTask: Task<Void, Never>?
    private(set) var threadId: String?
    /// stop() 직후 곧바로 재전송하면 취소된 이전 Task의 완료 처리가 새 Task의 phase를
    /// 되돌릴 수 있다. 세대 토큰으로 "내 Task가 아직 최신인가"만 확인한다.
    private var generation = 0

    init(
        api: ChatAPI = ChatAPI(baseURL: AppConfig.webBaseURL),
        threadsAPI: ThreadsAPI = ThreadsAPI(baseURL: AppConfig.webBaseURL, tokenProvider: { nil }),
        isSignedIn: @escaping @MainActor () -> Bool = { false }
    ) {
        self.api = api
        self.threadsAPI = threadsAPI
        self.isSignedIn = isSignedIn
    }

    /// 사용자 질문 전송. 스트리밍 중 재진입, 첨부 로드 중 전송은 가드로 거부한다.
    /// 반환값 true면 실제로 전송을 시작했다는 뜻: ChatView가 이 값으로 입력 텍스트를 비울지
    /// 판단해 가드 거부 시 입력 텍스트가 유실되지 않도록 한다.
    @discardableResult
    func send(_ text: String) -> Bool {
        guard phase == .idle else { return false }
        guard !isAttachmentLoading else {
            Announce.post("첨부를 준비하고 있어요. 잠시 후 전송해 주세요.")
            return false
        }
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        // 텍스트·첨부 둘 다 없을 때만 거부(첨부 단독 전송은 웹과 같이 허용)
        guard !trimmed.isEmpty || pendingAttachment != nil else { return false }

        let attachment = pendingAttachment
        pendingAttachment = nil
        attachmentErrorMessage = nil

        lastErrorMessage = nil
        // outgoing: 오류 메시지(isError == true) + 빈 assistant 제외. 이전 턴의 첨부 단독 질문은
        // 첨부가 재전송되지 않으므로 표시 문구("첨부: 파일명")로 턴 구조만 보존한다.
        // 모델 컨텍스트 오염 방지: 오류는 사용자에게 로컬로만 표시하고 다음 요청에 재전송하지 않음.
        var outgoing = messages.filter { !$0.isError && !$0.displayText.isEmpty }
            .map { ChatOutgoingMessage(role: $0.role, text: $0.displayText) }
        // 이번 질문은 원문 그대로(첨부 단독이면 빈 텍스트 — 서버가 첨부 내용으로 검색한다).
        outgoing.append(ChatOutgoingMessage(role: "user", text: trimmed, attachment: attachment))
        messages.append(ChatMessage(role: "user", text: trimmed, attachmentFilename: attachment?.filename))
        let assistantIndex = messages.count
        messages.append(ChatMessage(role: "assistant", text: ""))

        phase = .streaming
        generation += 1
        let myGeneration = generation
        let requestThreadId = threadId
        let expectsNewThread = requestThreadId == nil && isSignedIn()

        Announce.post("답변 작성 중")

        streamTask = Task { @MainActor [weak self, api] in
            guard let self else { return }
            do {
                for try await event in api.stream(messages: outgoing, threadId: requestThreadId) {
                    guard !Task.isCancelled else { break }
                    self.apply(event, at: assistantIndex)
                }
                // 이력 저장 실패 판정: 서버가 무효 토큰을 익명으로 처리하거나 저장에 실패하면
                // 오류 없이 threadId만 빠진다. 새 대화에서만 판정 가능(기존 대화 이어쓰기 실패는
                // 응답에 신호가 없다). 통지는 답변 아래 정적 문구 — 완료 포커스 계약(§6)을
                // 건드리지 않고 답변을 읽어 내려가면 만난다(추가 live 통지 없음).
                if !Task.isCancelled, expectsNewThread, self.threadId == nil {
                    self.messages[assistantIndex].historyNotSaved = true
                }
            } catch {
                // stop()에 의한 취소는 오류가 아니다. 부분 답변을 그대로 유지한다.
                if !Task.isCancelled {
                    self.applyError(error, at: assistantIndex)
                }
            }
            self.finishStreaming(generation: myGeneration)
        }
        return true
    }

    /// 첨부 로드 시작 통지: ChatView가 PhotosPicker/fileImporter 로드에 착수할 때 호출한다.
    /// 로드 완료(성공·실패 불문)는 stageAttachment/notifyAttachmentLoadFailure/notifyAttachmentTooLarge가
    /// isAttachmentLoading을 false로 되돌린다.
    func beginAttachmentLoad() {
        isAttachmentLoading = true
        Announce.post("첨부 준비 중")
    }

    /// 첨부 스테이징: 10MB 초과면 즉시 오류 문구 설정 + Announcement 후 미첨부, 통과하면 저장.
    /// 데이터 로드(PhotosPicker 재인코딩·fileImporter 읽기)는 ChatView가 담당하고, 이 메서드는
    /// 완성된 바이트만 받아 크기 검증 + base64 인코딩만 수행한다.
    func stageAttachment(mediaType: String, data: Data, filename: String) {
        guard data.count <= Self.maxAttachmentBytes else {
            notifyAttachmentTooLarge()
            return
        }
        isAttachmentLoading = false
        attachmentErrorMessage = nil
        pendingAttachment = ChatAttachment(
            mediaType: mediaType, dataBase64: data.base64EncodedString(), filename: filename)
    }

    /// 첨부 제거(사용자 명시 조작). 오류 문구도 함께 지운다.
    func clearAttachment() {
        pendingAttachment = nil
        attachmentErrorMessage = nil
    }

    /// 첨부 로드 실패 시 호출: attachmentErrorMessage 설정 + Announcement로 사용자 통지.
    /// 10MB 초과와 동일한 채널 사용 (stageAttachment 패턴 미러).
    func notifyAttachmentLoadFailure() {
        isAttachmentLoading = false
        let message = "파일을 불러오지 못했습니다. 다른 파일을 선택해 주세요."
        attachmentErrorMessage = message
        // 실패는 interrupting: 시각으론 오류 문구가 뜨지만 SR 사용자는 이 통지가 유일 신호(§6)
        Announce.post(message, interrupting: true)
    }

    /// 첨부 크기 초과 통지: 로드 후 검증(stageAttachment)과 ChatView의 PDF 사전 크기 검증
    /// 양쪽에서 공용으로 쓴다(같은 문구를 두 곳에서 재구현하지 않도록).
    func notifyAttachmentTooLarge() {
        isAttachmentLoading = false
        attachmentErrorMessage = Self.oversizeAttachmentMessage
        Announce.post(Self.oversizeAttachmentMessage, interrupting: true)
    }

    /// 스트리밍 중단: Task를 취소하되 지금까지 누적된 부분 답변은 그대로 둔다(접미 없음).
    /// 첫 델타 전 중단이면 빈 메시지를 배열에서 제거(ProgressView 영구 잔존 방지).
    func stop() {
        streamTask?.cancel()
        streamTask = nil
        // 취소된 Task가 뒤늦게 finishStreaming에 도달해도 완료(answerRevision)로 처리되지
        // 않도록 세대를 올려 무효화한다 — 중단은 완료가 아니다(포커스는 중단 버튼에 유지).
        generation += 1
        phase = .idle
        // 마지막 assistant 메시지가 비어있으면 제거(중단 시 텍스트가 없는 경우).
        if let lastMessage = messages.last, lastMessage.role == "assistant", lastMessage.text.isEmpty {
            messages.removeLast()
        }
    }

    /// 로그인 사용자의 저장된 대화 이력을 불러와 현재 세션의 messages를 통째로 교체한다.
    /// `ThreadListSheet`가 스레드 선택 시 호출한다. 스트리밍 중이면 먼저 중단한다. 진행 중이던
    /// Task가 초기화된 배열에 옛 인덱스로 접근해 범위 오류를 내는 것을 막기 위함(MainActor
    /// 직렬 실행이라 이 stop() 호출과 messages 교체 사이에 다른 코드가 끼어들 수 없다).
    func loadThread(id: String) async throws {
        if phase == .streaming {
            stop()
        }
        let (_, threadMessages) = try await threadsAPI.messages(threadId: id)
        messages = threadMessages.map { ChatMessage(role: $0.role, text: $0.content, sourceRefs: $0.sourceRefs) }
        threadId = id
        lastErrorMessage = nil
        threadLoadTick += 1
    }

    /// "새 대화" 버튼 및 로그아웃 시 호출: 이력을 비우고 threadId를 리셋해 다음 send()가 새
    /// 스레드로 시작하게 한다(로그아웃 후에는 서버 저장 없는 익명 휘발 모드로 복귀).
    /// 스트리밍 중이면 loadThread(id:)와 동일한 이유로 먼저 중단한다.
    func startNewThread() {
        if phase == .streaming {
            stop()
        }
        threadId = nil
        messages = []
        lastErrorMessage = nil
    }

    private func finishStreaming(generation: Int) {
        guard self.generation == generation else { return }
        phase = .idle
        answerRevision += 1
    }

    private func apply(_ event: ChatStreamEvent, at index: Int) {
        switch event {
        case .textDelta(let delta):
            messages[index].text += delta
            streamTick += 1
        case .metadata(let sourceRefs, let newThreadId):
            messages[index].sourceRefs = sourceRefs
            if let newThreadId {
                threadId = newThreadId
            }
        case .finish:
            break
        }
    }

    private func applyError(_ error: Error, at index: Int) {
        let message: String
        if let apiError = error as? ChatAPIError, apiError == .rateLimited {
            message = "요청이 많아요. 1분 뒤 다시 시도해 주세요."
        } else {
            message = "답변을 가져오지 못했습니다. 네트워크를 확인해 주세요."
        }
        // 오류는 assistant 자리 메시지 text로 표시(답변 위치 한 군데 원칙).
        messages[index].text = message
        messages[index].isError = true
        lastErrorMessage = message
        // 실패는 interrupting(§6): SR 사용자는 보내기 버튼에 앉아 있어 이 통지가 유일 신호.
        Announce.post(message, interrupting: true)
    }
}
