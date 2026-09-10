# BACKLOG

> 아직 하지 않은 것만 담는다(열린 항목·판정 대기·이월·폐기 근거). 종결되면 CHANGELOG로 보내고 여기서는 지운다(다른 문서가 참조하는 식별자는 §종결 표에 행선지만 남긴다). 현재 상태·미결 결정은 PROGRESS.md, 항구 규칙은 CLAUDE.md. 2026-08-17 PROGRESS.md에서 분리.

## A. 위원장 실측 대기 (리뷰로 대체 불가)

| # | 항목 | 출처 |
|---|------|------|
| A1 | iOS 실기기 게이트 잔여: 비행기 모드 위키 열람(표 포함)·검색 완주·자료실 캐시 재열람 | PR #87~#91, 2026-07-10 |
| A2 | iOS VoiceOver 잔여: 로터 헤딩 점프, 축 카드·검색 결과 한 객체 낭독, 문서 제목 1회 낭독, 표 행 "헤더 값" 낭독(실패 시 폴백은 plan M0 Task 8) | 2026-07-10 |
| A3 | iOS OTP 로그인 전체 플로(이메일→코드) + 대화 저장·복원 실동작 | PR #90 |
| A4 | iOS BlockRenderer 리스트 마커 이중 낭독 확인 | PR #108 이월 ② |
| A5 | iOS List NavigationLink 행 전체 탭 육안 확인 | PR #111 |
| A6 | 웹 위키 홈 hero 검색 실 마이크 스모크 | PR #106 |
| A7 | 애니메이션 feel check(reduced-motion 토글·채팅 자동 스크롤·모바일 드로어) | PR #97·#98 |
| A8 | 웹 콘텐츠 편집기 VoiceOver 실기기 실측(편집 흐름 전체) | PR #113 |
| A9 | 라이브 음성 채팅 실 마이크 smoke(`docs/PHASE7_ENV_SETUP.md` §3) | PR #74 |

채팅 VoiceOver(전송 포커스 유지→완료 시 질문 헤딩·홀드 받아쓰기 전 항목)는 2026-07-20 실기기 합격으로 종결(CHANGELOG 2026-07-20).

## B. 편집기 운영 잔여 (spec `docs/superpowers/specs/2026-08-04-web-content-editor-design.md` §11)

- B1 연구보조원 이메일 `editor_roles` seed(위원장이 이메일 주면 service_role로 실행)
- B2 감수자 안내 `docs/EDITOR_GUIDE.md` 전달(위원장)
- B3 PAT `webfortd-content-editor` 만료일 2027-08-05 캘린더 등록(위원장)
- B4 런북: Vercel 빌드 실패 이메일 수신 시 대응(revert 절차), 긴급 수정 시 RAG 즉시 갱신은 수동 `kb:sync`+`kb:embed`

## C. 콘텐츠

- C1 FAQ 9건(`content/faq/`, axis faq) 검수 → published(PR #86, 2026-07-04 이후 draft 대기)
- C2 콘텐츠 큐레이션(자료실·카드뉴스·위키 — 허유진 교수 협업)
- C3 ~~이미지 매핑 검수 큐 79건~~ → 폐기(2026-08-29): v3 LLM alt 기반 매핑은 2층 v4가 그림을 전사·대체텍스트로 흡수해 실체가 사라짐. 자산은 `content/_archive-v3/`에 보존, 새 매핑은 alt 해시 키로 `image:template`부터 시작(현재 마커 4건)
- C4 `reviewed_by: ["1차 검토(김헌용)"]` placeholder를 정밀 검수 시 실제 reviewer로 교체(점진)
- C6 지원인력 안내자료 부록2 기기 사진 12장 대체텍스트: v4는 `(사진: 기기명)` 자리표시(표 안 이미지라 HWPX 추출 불가). v3 LLM alt 11건 이식 또는 `generate_alt_text.py` 생성 — 3층 단계에서 처리
- C9 **일괄 공개·임베딩 재개**(2차 검수 반영 재생성 9/11 완료, 3차 검수 9/14~16 → 수행사 전달 9/21 뒤 webfortd 공개는 별건 위원장 판정 — PROGRESS §미결 결정): `npm run kb:bootstrap` → `content/.embed-paused` 삭제·커밋 → 야간 워크플로(또는 workflow_dispatch)가 kb:sync+kb:embed 1회 실행 → `tests/lib/sitemap.test.ts` 임계값 복원. **재개 전 필수 3건**: ① `scripts/lib/chunker.ts`가 `## 관련 페이지` 블록을 빼고 `[[slug|제목]]`을 표시명으로 치환(현재는 링크 구문이 그대로 임베딩됨, 리뷰 지적 2026-08-29) ② **구 v3 `documents` 행은 sync가 지우지 않는다** — `upsertDocuments`가 `onConflict: 'slug'` upsert라 주소가 바뀐 구 행이 published 상태로 남는다(delete-then-insert는 `wiki_backlinks` 전용, `sync-content-to-db.ts:178`·`:264`). 고아 행 정리 단계를 따로 넣을 것 ③ `kb:bootstrap`은 `content/**/*.md` **전체**(현재 draft 367건 = 4종 358 + FAQ 9)를 승격하므로 FAQ 9건(C1)·uncategorized 3건의 공개 여부를 먼저 판정할 것. reviewed_by는 스크립트 상수 `'1차 검토(김헌용)'` 고정이라 2차 검증 결과 반영은 별건(C4 + reviewer 인자 신설 선행).
- C14 법령 최신화(2차 검수 47번: 장애인차별금지법 2025-03-18 개정 제4조 제1항 제7호 신설 등)는 방침대로 내년 갱신. 정본 수정 목록 유형 「법령 갱신」에 기록
- C15 3층 축(폴더) 이동 54건(2026-09-11 장애유형 판정 변화): URL이 `/{axis}/{slug}`라 공개 뒤에 같은 일이 생기면 구 주소 리다이렉트가 필요하다. 공개 전(C9)에 축 판정을 확정하거나 slug 단독 라우트를 검토
- C13 홈 메타 설명(`src/app/(wiki)/page.tsx` metadata)이 「535개 정책·법령·사례·보조공학 페이지」로 v3 시점 수치를 말한다 — 현재 공개 건수는 50(단체협약 49 + resources 1)이라 검색엔진·공유 카드에 노출되는 값이 사실과 다르다. C9 일괄 공개 판정 뒤 실제 공개 건수로 갱신(공개 여부에 따라 값이 달라지므로 그때 함께)
- C7 2층 v4 2차 검증 대상(콘텐츠팀): 신청 서식 전사 블록(OCR 유래), 인사관리 도표 2종 대체텍스트, `정본 수정 목록.csv` 「확인 필요」 행

## D. iOS TestFlight 준비물 (`docs/IOS_DISTRIBUTION.md` §2)

- D1 앱 아이콘 1024×1024 제작(`.xcassets` 자체 부재) — 디자인 방향은 PROGRESS 미결 결정
- D2 App Store 스크린샷 6.9" 1세트
- D3 웹 `/privacy` 본문 작성(placeholder — 심사 필수)
- D4 웹 `/terms` 본문 작성(placeholder — 권장)
- D5 Support URL 신설(`/support`) 또는 대표 이메일 등록
- D6 App Store Connect 앱 레코드 생성 → Archive → TestFlight 내부 테스터(판매자명 결정 후, `docs/IOS_DISTRIBUTION.md` §3)
- D7 M5 라이브 음성 이식(보류 — dodo-planet Live 오류 수정·검증 후, spec §4.4). 이식 시 Privacy Nutrition Label 음성 데이터 항목 추가

## E. 기술 부채 (비차단, 우선순위 낮음)

- E1 iOS M3: 무효 Bearer 시 조용한 미저장(이력 저장 실패 신호 없음) / `GET /api/chat/threads*` rate limit 부재 / 첨부 이력 미보존(저장은 텍스트만)
- E2 iOS M2: 첨부 단독 전송 미지원(웹은 허용, `ChatStore.swift` 빈 텍스트 guard)
- E3 iOS M0/M1: 파서 스모크 assertion 보강, `MarkdownBlockParser` HTMLBlock 정규식 협소화, `DocumentView` backlinkSection compactMap 선필터(발현 불가·방어적)
- E4 iOS M4: 자료실·미디어 빈 목록 상태 뷰(현재 도달 불가), CatalogStore 로더 제네릭 통합
- E5 `tests/migrations` 8건이 운영 DB 베이스라인 드리프트(published 535 vs 초기 가정 0 등)로 실패 중 — 베이스라인 갱신 또는 fixture 격리(CHANGELOG 2026-08-04 부수 발견)
- E6 웹 감사 보류분(PR #78): ChatUI `aria-relevant`(위원장 실 VoiceOver 판정) / KB fixed overlay 탭 잔존(구조 대수술) / retrieval 직렬 3왕복(RPC 마이그레이션) / 분산 rate limit·첨부 magic bytes 검사
- E7 RAG 청크 `char_start`/`char_end` DEFERRED(Phase 3 M1)
- E8 decompose 리뷰 잔여(2026-08-29): 범위 경고가 자기+부모 kind만 봄(조상 전체로 넓히면 2층 승격 누락 신호 증가) / 분해 규칙(split·merge·range·demote·-d2) 단위 테스트 부재(함수 미export, 현재는 실 content e2e만)

## F. 사업·운영 결정 대기 (판정은 PROGRESS §미결 결정)

- F1 LICENSE 파일 부재(README "추후 결정"). 공개 저장소(khudt-org)이자 사업 자산이라 저작권 주체(장교조 vs 개인)·라이선스 선택은 위원장 결정 — 워크스페이스 이식 원장 PORTS.md webfortd 행 참조
- F2 KHUDT Pro 재활성(월 $20) 실행 시점 — 절차 `docs/VERCEL_RECOVERY_PLAN.md`
- F3 UPSTAGE_API_KEY production 미등록(HWP/HWPX 첨부만 영향, `docs/M7_ENV_SETUP.md`)

## 폐기 (재조사 방지)

| 항목 | 판정 | 근거 |
|------|------|------|
| Phase 4(개정) 소셜 피드 · Phase 5 TTS·alt 자동생성 · Phase 6 다국어·통계 시각화 | 보류(미착수, 트리거 없음) | CLAUDE.md §개발 방향 Phase 표가 원 기록. 2026-06-05 본 사업 분리 이후 webfortd는 레퍼런스 트랙이라 착수 트리거는 위원장 지시 |
| 멀티모달 임베딩 · 모바일 PWA 강화 | 장기 과제(도입 트리거 미충족) | CLAUDE.md §장기 과제 |
| KB 문서 파일 라우트 신설 | 영구 금지 | Hobby 함수 12개 제한 — `[...kb]` 파서에 추가(CLAUDE.md) |
| 웹 옴니박스의 iOS 이식(위키 탭 검색어 → 채팅 탭 전달 버튼) | 미채택(위원장 판정 2026-09-04) | iOS는 위키·채팅이 탭으로 갈라져 검색창 중복이 없고, 옴니박스는 탭바 없는 웹이 탭 구조를 대신하는 장치다(gildongmu spec §1: 「옴니박스 = iOS 탭과 개념적으로 등가」). 검색 계약도 다르다 — 웹은 라이브, iOS는 제출형(`performSearch`). 이식하면 탭바와 같은 일을 두 겹으로 한다. 재검토 트리거: 받아쓰기로 말한 문장을 채팅에서 다시 말해야 하는 불편이 실사용에서 누적될 때 |

## 종결 표 (식별자 → 행선지)

| 식별자 | 행선지 |
|--------|--------|
| 편집기 운영 체크리스트 ✅ 5건(PAT·ruleset·Secrets·야간 워크플로·production 실호출) | CHANGELOG 2026-08-04 |
| Apple Developer Program 가입 결정(연 $99) | 2026-07-12 개인 등록 승인, 팀 ID 72JQ7VD4V5 유료 승격 완료(dodo-planet CHANGELOG Round 170). 남은 판정은 App Store 판매자명(PROGRESS 미결 결정) |
| iOS 채팅 VoiceOver 실기기 판정(#108·#109) | 2026-07-20 합격, CHANGELOG 2026-07-20 |
| gildongmu SpeechService 레이스 가드 백포트 | gildongmu `e1f5d2f`, CHANGELOG 2026-07-20 |
| C5 3층 위키 문서 재생성 | 2026-08-29 완료(363건 draft), CHANGELOG 2026-08-29. 공개·임베딩 재개는 C9 |
| C10 `source_page` 형식 혼재 | 2026-09-11 종결: `pdf` 라벨은 `source_page_pdf`로만(CHANGELOG 2026-09-11) |
| C11 2023 보고서 2층 재빌드 회귀 | 2026-09-11 종결: 쪽 주석 조밀화 + 구간 범위 의미로 쪽 한정 치환 전부 통과 |
| C12 부록 조사지 쪽 고정 | 2026-09-11 종결: 표 첫 줄 앞 쪽 주석으로 표지 쪽 403/419/436/452/467/482/498/513 확보(3층은 결정 3으로 미게시) |
| C8 청각 (2)(3) 제목 승격 + 델파이 학교급 승격 | 2026-08-30 완료(363 → 367건, 분할 한도 5.5만 자 상향 포함), CHANGELOG 2026-08-30 |
| A10 웹 홈 옴니박스 VoiceOver 실사용 | 2026-09-05 **합격**(4항목: 낭독 순서 검색창→음성→AI에게 질문 / Cmd+Enter 질문 전송 / `/chat` 도착 시 sr-only h1 「채팅」 낭독 / 완료 시 질문 헤딩 안착 후 다음이 답변), CHANGELOG 2026-09-04 |
| E9 색상 대비 AA 미달 | 2026-09-05 완료(라이트 3종·다크 1종 토큰 조정 + 전수 매트릭스 게이트 신설, axe 기준선에서 color-contrast 제거로 0건 고정), CHANGELOG 2026-09-05 |
