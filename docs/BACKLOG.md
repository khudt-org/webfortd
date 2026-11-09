# BACKLOG

> 아직 하지 않은 것만 담는다(열린 항목·판정 대기·이월·폐기 근거). 종결되면 CHANGELOG로 보내고 여기서는 지운다(다른 문서가 참조하는 식별자는 §종결 표에 행선지만 남긴다). 현재 상태·미결 결정은 PROGRESS.md, 항구 규칙은 CLAUDE.md. 2026-08-17 PROGRESS.md에서 분리.

## 착수 순서

| 묶음 | 항목 | 필요 환경 | 순서 |
|------|------|-----------|------|
| 공개 준비 | **C6 부록2 기기 사진 대체텍스트** | 로컬 필요 | 선행 |
| TestFlight 준비 | **D2 App Store 스크린샷** | 로컬 필요 | 병행 |
| 웹 정책 페이지 | **D3 /privacy 본문**, **D4 /terms 본문**, **D5 Support URL** | 위원장 | 병행 |
| 채팅 이력 | **E1 채팅 이력 잔여** | | 병행 |

판정 대기(C1·C7·C9·C15 대안 선택·E8·F1·F2)·미결 결정 대기(D1 디자인 방향·D6 판매자명)·C9 종속(C13·E10, 공개 판정·실행과 함께)·위원장 실측(§A)·운영 잔무(§B·F3)·보류(D7·E12)·점진(C2·C4·C14·C16)·E6(구조 대수술·운영 DB·비용이 섞여 착수 전 판정 필요)은 표에 넣지 않는다.

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
| A11 | iOS 이력 저장 실패 문구에 VoiceOver가 답변을 읽어 내려가며 도달하는지 / 첨부 단독 전송의 답변 수신·질문 헤딩 「첨부: 파일명」 낭독·포커스 보내기 버튼 유지 | PR #123 |

채팅 VoiceOver(전송 포커스 유지→완료 시 질문 헤딩·홀드 받아쓰기 전 항목)는 2026-07-20 실기기 합격으로 종결(CHANGELOG 2026-07-20).

## B. 편집기 운영 잔여 (spec `docs/superpowers/specs/2026-08-04-web-content-editor-design.md` §11)

- [ ] **B1 연구보조원 editor_roles seed**: 연구보조원 이메일 `editor_roles` seed(위원장이 이메일 주면 service_role로 실행)
- [ ] **B2 감수자 안내 전달**: 감수자 안내 `docs/EDITOR_GUIDE.md` 전달(위원장)
- [ ] **B3 PAT 만료 캘린더 등록**: PAT `webfortd-content-editor` 만료일 2027-08-05 캘린더 등록(위원장)

## C. 콘텐츠

- [ ] **C1 FAQ 9건 검수**: FAQ 9건(`content/faq/`, axis faq) 검수 → published(PR #86, 2026-07-04 이후 draft 대기)
- [ ] **C2 콘텐츠 큐레이션**: 콘텐츠 큐레이션(자료실·카드뉴스·위키 — 허유진 교수 협업)
- C3 ~~이미지 매핑 검수 큐 79건~~ → 폐기(2026-08-29): v3 LLM alt 기반 매핑은 2층 v4가 그림을 전사·대체텍스트로 흡수해 실체가 사라짐. 자산은 `content/_archive-v3/`에 보존, 새 매핑은 alt 해시 키로 `image:template`부터 시작(현재 마커 4건)
- [ ] **C4 reviewed_by 실제 reviewer 교체**: `reviewed_by: ["1차 검토(김헌용)"]` placeholder를 정밀 검수 시 실제 reviewer로 교체(점진)
- [ ] **C6 부록2 기기 사진 대체텍스트**: 지원인력 안내자료 부록2 기기 사진 12장 대체텍스트: v4는 `(사진: 기기명)` 자리표시(표 안 이미지라 HWPX 추출 불가). v3 LLM alt 11건 이식 또는 `~/Mac-Projects/docparse/scripts/generate_alt_text.py` 생성. 3층 재생성 세 번(8/29·9/11·9/23)에도 남아 있어 C9 공개 전에 2층 데이터(`scripts/source-v4/alts/`)에 넣어 재생성
- [ ] **C9 일괄 공개·임베딩 재개**(3차 검수 반영 재생성 9/23 완료(358건) → 수행사 전달(2026-09~10) 완료, webfortd 공개는 별건 위원장 판정 — PROGRESS §미결 결정): `npm run kb:bootstrap` → `content/.embed-paused` 삭제·커밋 → `nightly-embed` workflow_dispatch(`allow_mass_delete`)가 kb:sync+kb:embed 1회 실행 → `tests/lib/sitemap.test.ts` 임계값 복원. 첫 실행이 수동인 이유: 구 v3 주소 행이 DB 과반(2026-09-26 dry-run 482/544)이라 `kb:sync`의 고아 정리가 플래그 없이는 멈추고, 야간 스케줄 실행은 플래그를 넘기지 못한다(PR #125). 옛 대화 기록의 출처 링크는 이때 끊긴 주소가 된다. **재개 전 남은 판정**: `kb:bootstrap`은 `content/**/*.md` **전체**(현재 draft 367건 = 4종 358 + FAQ 9)를 승격하므로 FAQ 9건(C1)·uncategorized 3건의 공개 여부를 먼저 판정할 것. reviewed_by는 스크립트 상수 `'1차 검토(김헌용)'` 고정이라 2차 검증 결과 반영은 별건(C4 + reviewer 인자 신설 선행).
- [ ] **C14 법령 최신화**: 법령 최신화(2차 검수 47번: 장애인차별금지법 2025-03-18 개정 제4조 제1항 제7호 신설 등)는 방침대로 내년 갱신. 정본 수정 목록 유형 「법령 갱신」에 기록
- [ ] **C15 3층 축 이동 주소 대응**: 3층 축(폴더) 이동 54건(2026-09-11 장애유형 판정 변화): URL이 `/{axis}/{slug}`라 공개 뒤에 같은 일이 생기면 구 주소 리다이렉트가 필요하다. 공개 전(C9)에 축 판정을 확정하거나 slug 단독 라우트를 검토
- [ ] **C16 여러 쪽 표 안의 쪽 주석**: 여러 쪽에 걸친 표 안의 쪽 주석(2026-09-23): 쪽 주석은 쪽이 바뀐 첫 본문 줄 앞에만 들어가고 GFM 표 안에는 둘 수 없어, 표 한 덩어리가 여러 쪽이면 그 안의 쪽은 마커가 없다(최종보고서 161쪽 — 직무분류표 53~79·면담 결과표 228~288·부록 결과표 352~402, 인사관리 5쪽, 중부대 6쪽, 지원인력 11쪽. `docs/regression-2026-09-review50.md` 「남은 빈 쪽」). 3층 `source_page_end`는 넘치지 않고 짧을 뿐이라 검수 지적은 없었다. 필요해지면 표를 자르지 않고 frontmatter에 표별 쪽 범위 목록을 두는 방안을 검토
- [ ] **C13 홈 메타 설명 공개 건수**: 홈 메타 설명(`src/app/(wiki)/page.tsx` metadata)이 「535개 정책·법령·사례·보조공학 페이지」로 v3 시점 수치를 말한다 — 현재 공개 건수는 50(단체협약 49 + resources 1)이라 검색엔진·공유 카드에 노출되는 값이 사실과 다르다. C9 일괄 공개 판정 뒤 실제 공개 건수로 갱신(공개 여부에 따라 값이 달라지므로 그때 함께)
- [ ] **C7 2층 v4 확인 필요 잔여**: `정본 수정 목록.csv` 「확인 필요」 5행 + 신청 서식 전사 블록(OCR 유래)·인사관리 도표 2종 대체텍스트. 2·3차 검수가 끝났고 4차 검수는 열지 않아 처리 경로(수행사 인계 또는 위원장 판정)가 미정 — 판정 대기

## D. iOS TestFlight 준비물 (`docs/IOS_DISTRIBUTION.md` §2)

- [ ] **D1 앱 아이콘**: 앱 아이콘 1024×1024 제작(`.xcassets` 자체 부재) — 디자인 방향은 PROGRESS 미결 결정
- [ ] **D2 App Store 스크린샷**: App Store 스크린샷 6.9" 1세트
- [ ] **D3 /privacy 본문**: 웹 `/privacy` 본문 작성(placeholder — 심사 필수)
- [ ] **D4 /terms 본문**: 웹 `/terms` 본문 작성(placeholder — 권장)
- [ ] **D5 Support URL**: Support URL 신설(`/support`) 또는 대표 이메일 등록
- [ ] **D6 TestFlight 내부 테스터**: App Store Connect 앱 레코드 생성 → Archive → TestFlight 내부 테스터(판매자명 결정 후, `docs/IOS_DISTRIBUTION.md` §3)
- [ ] **D7 M5 라이브 음성 이식**: M5 라이브 음성 이식(보류 — dodo-planet Live 오류 수정·검증 후, spec §4.4). 이식 시 Privacy Nutrition Label 음성 데이터 항목 추가

## E. 기술 부채 (비차단, 우선순위 낮음)

- [ ] **E1 채팅 이력 잔여**: 첨부 이력 미보존(저장은 텍스트만, iOS 이력 복원 시 「첨부: 파일」로만 보임) / 웹 쿠키 세션이 대화 중 만료되면 서버가 익명과 구분하지 못해 `historyUnsaved` 신호가 없다(Bearer만 신호, PR #124 리뷰 P3)
- [ ] **E6 웹 감사 보류분**(PR #78): KB fixed overlay 탭 잔존(구조 대수술) / retrieval 직렬 3왕복(RPC 마이그레이션 — 운영 DB 변경이라 C9 재개와 묶어 판단) / 분산 rate limit(외부 저장소 필요, 비용)
- [ ] **E8 decompose 범위 경고 조상 확대**: decompose 범위 경고가 자기+부모 kind만 봄(조상 전체로 넓히면 2층 승격 누락 신호 증가 — 잡음 대비 이득 판정 필요)
- [ ] **E10 0005 테스트 절대 수치**: `tests/migrations/0005_rag_infrastructure.test.ts`가 청크 1000+·문서 535+ 절대 수치를 가정한다. 지금은 통과하지만 C9 재개(고아 482건 삭제) 뒤 깨진다 — 재개 PR에서 불변식 단언으로 교체(PR #122 리뷰 발견)
- [ ] **E12 Cache Components 도입**: Cache Components(`cacheComponents: true`) 미도입. 루트 레이아웃이 사이드바 SSR 쿠키(D1~D9)를 `<html>` 속성에 쓰려고 Suspense 밖에서 읽어 모든 경로의 프리렌더가 막힌다(`/_not-found`부터 빌드 실패). 루트에 `instant = false`를 걸어도 `/`의 `new Date()` 동기 IO 오류가 남는다. 도입하려면 사이드바 상태 전달 방식 재설계와 동기 IO 이동이 먼저이고, 지금은 전 경로가 이미 동적(ƒ)이라 그 재설계 전에는 이득이 없다. 도입 시 `runtime = 'nodejs'` 7곳·`force-dynamic` 2곳도 지운다(Cache Components가 지원하지 않는다)

## F. 사업·운영 결정·잔무 (판정은 PROGRESS §미결 결정)

- [ ] **F1 LICENSE**: LICENSE 파일 부재(README 「아직 정해지지 않았습니다(장교조 결정 사항)」). 공개 저장소(khudt-org)이자 사업 자산이라 저작권 주체(장교조 vs 개인)·라이선스 선택은 위원장 결정 — 워크스페이스 이식 원장 PORTS.md webfortd 행 참조
- [ ] **F2 KHUDT Pro 재활성**: KHUDT Pro 재활성(월 $20) 실행 시점 — 절차 `docs/VERCEL_RECOVERY_PLAN.md`
- [ ] **F3 UPSTAGE_API_KEY production 등록**(결정이 아니라 위원장 실행 잔무): UPSTAGE_API_KEY production 미등록(HWP/HWPX 첨부만 영향, `docs/M7_ENV_SETUP.md`)

## 장기 과제 (비공식)

Phase 표에는 포함하지 않지만 위원장이 명시한 장기 비전. 도입 시점은 시범 모델 안정화 + 콘텐츠 다양화 후. **별도 plan/spec 작성 금지** — 이 절이 곧 마스터 기록(실시간 음성 채팅은 Phase 7로 승격·완료, CHANGELOG 「이전 이력」).

| 과제 | 내용 | 도입 트리거 |
|------|------|-------------|
| **멀티모달 임베딩** | 카드뉴스/영상 시각 자체를 임베딩 (현재는 alt/캡션 텍스트로 우회). Vertex AI `multimodal-embedding` 또는 동급 모델. `document_chunks`에 modality 컬럼 추가 + 인덱스 분리. | "이 그래프와 비슷한 도표 찾아줘" 같은 시각 유사도 검색 요구가 누적되는 시점 |
| **모바일 PWA 강화** | 홈 화면 설치, 오프라인 캐시(검색 인덱스 일부), 푸시 알림(공지·정책 변경). | 모바일 트래픽 비중 누적 + 정책 변경 알림 수요가 명확해지는 시점 |
| **위키 페이지 오디오 내레이션 (ElevenLabs Audio Native)** | 위키·atomic 페이지 본문을 AI 내레이션 플레이어로 임베드. ElevenLabs Audio Native는 페이지 URL을 등록하면 본문을 읽어 플레이어 스니펫을 발급하고 본문이 바뀌면 재생성한다. CLI 표면 `elevenlabs audio-native`(CLI v1.1.0, Win·Mac 설치 완료). Phase 7 라이브 음성 채팅과 역할이 다름: Live는 대화형 질의응답, Audio Native는 정적 본문의 낭독. 주 수요층은 저시력·난독·이동 중 청취 사용자이고 스크린리더 사용자에겐 중복이므로 자동 재생 금지 + 명시적 재생 컨트롤 + 페이지당 단일 플레이어로 설계. 크레딧이 페이지 수 × 본문 길이로 소모되므로 도입 전 플랜 한도 산정 선행. | 콘텐츠 정본이 안정화(대규모 재작성 종료)되고 저시력·난독 사용자 낭독 수요가 확인되는 시점 |

## G. 의존성·보안 유지 (절차는 `dependency-upkeep` 스킬)

- G1 [위원장] 조직 보안 설정 켜기: 저장소가 khudt-org 소유라 일반 회원 계정(Engccer)으로는 켤 수 없다. 조직 관리자 계정(khudt01)으로 저장소 Settings → Advanced Security에서 Dependabot alerts·Dependabot security updates·Secret scanning·Push protection을 켠다. 완료 기준: 네 항목 모두 Enabled
- G4 [로컬] 통합 테스트 Supabase 인증 실패: 실제 DB에 붙는 통합 테스트가 의존성 갱신 전후 모두 인증 오류로 실패한다(`Invalid Compact JWS`, `PGRST303 JWT issued at future`, 0001 RLS 단정). `.env.local`의 Supabase 키 형식(새 publishable/secret 키로 바뀌었는지)과 시계 차이를 확인해 고친다. 완료 기준: 통합 테스트 통과
- G5 [로컬] eslint-config-next 16.0.10 고정 풀기: 16.4가 가져오는 react-hooks 7.1 규칙 오류 13건을 고친 뒤 버전을 올리고 `.github/dependabot.yml`의 eslint-config-next 제외 줄을 지운다(CHANGELOG 2026-10-26). 완료 기준: 최신판에서 `npm run lint` 오류 0
- G6 [로컬] 월간 의존성·보안 점검: 다음 회차 2026-12. 완료 기준: 그달 보안 경고·Dependabot PR 정리
- G7 [위원장] 운영 채팅의 Gemini 키 교체: Vercel Production의 `GOOGLE_GENERATIVE_AI_API_KEY`가 무효라 `/api/chat`이 자료 검색(임베딩)에서 실패해 "자료 검색 중 오류"만 답한다(2026-11-08 실호출, 로그 `API key not valid`). 위원장 전역 `GEMINI_API_KEY`를 교체할 때 이 저장소에는 반영되지 않았다(로컬 `.env.local`은 같은 날 현재 키로 맞춤). Vercel Production·Preview 값과 GitHub Actions 시크릿(야간 임베딩)을 바꾸고 재배포한다. 완료 기준: 운영 `/api/chat`이 답변을 스트리밍하고 로그에 키 오류가 없다

## 폐기 (재조사 방지)

| 항목 | 판정 | 근거 |
|------|------|------|
| Phase 4(개정) 소셜 피드 · Phase 5 TTS·alt 자동생성 · Phase 6 다국어·통계 시각화 | 보류(미착수, 트리거 없음) | CHANGELOG 맨 아래 「이전 이력」의 Phase 표가 원 기록. 2026-06-05 본 사업 분리 이후 webfortd는 레퍼런스 트랙이라 착수 트리거는 위원장 지시 |
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
| B4 편집기 운영 런북 | 2026-09-26 `docs/EDITOR_RUNBOOK.md`, CHANGELOG 2026-09-26 |
| C9 재개 전 필수 ①②(청크 전처리·고아 행 정리), E7 청크 오프셋 | 2026-09-26 PR #125, CHANGELOG 2026-09-26 |
| E1 서버 신호·threads rate limit, E6 첨부 magic bytes | 2026-09-26 PR #124 |
| E1 iOS 표시, E2·E3·E4 | 2026-09-26 PR #123 |
| E5 통합 테스트 드리프트, E8 분해 규칙 단위 테스트 | 2026-09-26 PR #122 |
| E11 테스트 파일 tsc 오류 11건 | 2026-10-26 next 16.4.3 업그레이드에서 수정, 이후 `next build` 타입 검사가 tests/까지 본다. CHANGELOG 2026-10-26 |
| E9 색상 대비 AA 미달 | 2026-09-05 완료(라이트 3종·다크 1종 토큰 조정 + 전수 매트릭스 게이트 신설, axe 기준선에서 color-contrast 제거로 0건 고정), CHANGELOG 2026-09-05 |
