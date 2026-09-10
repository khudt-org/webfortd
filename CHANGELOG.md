# CHANGELOG

> 날짜별 변경 이력(마일스톤 경계 갱신). 2026-07-10 이전 이력은 git log와 CLAUDE.md §Phase 진행 요약이 정본(지연 생성 원칙에 따라 이 파일은 iOS 트랙 진입 시점부터 시작).

## 2026-09-11 — 2차 검수 반영 재생성: 엔진 5종 결함 + 2층 4종 + 3층 358건 (9/7 결정 4건)

- **배경**: 2차 검수(9/6 마감, 50건 중 문제 보고 33건)와 9/7 제5차 회의 결정 4건(도식→글 구조 / 세로 병합만 반복 / 연구 절차 문서 12건 위키 제외 / 조사지 제목 접두). 지적은 내용 오류가 아니라 표기·메타 결함(캡션 번호 11·줄바꿈 11·쪽 범위 13·병합 반복 7·흐름도 7)이라 계층별로 규칙을 고쳐 4종 전체를 재생성했다. 건별 판정은 `docs/regression-2026-09-review50.md`, 주소 변경은 `docs/slug-migration-2026-09.csv`.
- **엔진 hwpx-tomd 0.3.0**(`~/Mac-Projects/hwpx-tomd` 1a87753): 캡션 자동 번호 필드(`<hp:autoNum>`)를 글자로(최종보고서 237곳, 3층 39건), 1×1 래퍼 표 승격(직무 도식 208개가 「책무·과업·과업요소」 3열 표로), 셀 안 중첩표 호이스팅([별표4]·조사지 2열 책무 목록), 화살표 선 도형 → `→`/`↓`(장애정도 표), `--merge-fill-vertical`(가로 병합은 한 칸 — 참고·지원 사례·유의사항 박스가 5열에서 1열로), `--prune-empty`(빈 행·열 제거).
- **2층**(docparse c4b7ddf + `scripts/source-v4`): `hwpx_enrich --page-comment-every`(쪽 주석을 제목뿐 아니라 쪽이 바뀐 첫 본문 줄·표 앞에도, 2023 보고서 134 → 384곳. 부록 조사지 구간·C11 쪽 한정 치환 실패가 함께 해소) + `--italic`(면담 인용문 `> *…*` 125건), `apply_corrections`는 구간이 다음 주석 쪽까지 덮는 것으로 판정. 신규 `normalize-paragraphs.py`(두 줄 사이 빈 줄, 같은 표 블록·목록·인용 연속만 예외 + PUA 글리프 매핑, 4종 마지막 단계). `research_additions.json`([그림 Ⅰ-4] 번호 목록 2갈래·[그림 Ⅰ-5] 들여쓴 목록·[부록 1-1] 제목을 표 앞으로·[부록 1-5] 쪽 396 고정). `hr_additions.json`(최종본 「4) 기타 인사 관리 등 > (1) 전직 임용·(2) 특별연수·(3) 휴직ㆍ복직·(4) 휴가ㆍ병가」). hr `HEADING_RX`에 부록3 「1.~4.」 승격 + 「1)~5)」 강등(구간 한정). `hr.json`·`school.json` 서식 블록의 「(서식 전사: …)」 메모 삭제 + 쪽 주석(113·114·117·121 / 133·136). `정본 수정 목록.csv` 92행(제목 승격 8행 「델파이 조사지: 」 접두·표지 쪽 403/419/436/452/467/482/498/513, (3) 협의회 결과 291, 39번 Q&A 9단계, 등하교지도 쉼표, 뇌병변장장애, 청각장애교원 40쪽·관할 지사 27쪽 지정). 드라이브 `2. 마크다운 정본/` 교체(구본은 `이전 버전(v4 2차검수본, 2026-08-30)/`).
- **3층**(`decompose-source.ts`, `--reset`): `source_page_end`는 뒤에 본문이 있는 마지막 쪽 주석만(다음 절 제목 직전 주석 제외), `pdf` 라벨은 `source_page_pdf`만(C10), `EXCLUDED_SLUGS` 12건(연구 수행 절차·운영 조직 체계·델파이 조사지 8·청각 협의회 절차 2), 100자 미만 부모 서문은 `> 「부모 제목」 서문` 라벨 인용 블록, 장애유형은 본문 전체로 판정(관련 페이지 제목 제외, 「지체·뇌병변」 병기 인식). 결과 4종 367 → **358건**(전체 417, 전부 draft): 제외 12, 신설 `2023-research-app-1-1`·`2023-hr-2-2-4-1`(전직 임용)·`2023-hr-app-3-1~3`, 부록3 `app-3-N` → `app-3-4-N`, 휴직·휴가 `2-2-4-1/2` → `-3/-4`. 장애유형 판정 변화로 축 폴더가 바뀐 문서 54건(URL `/{axis}/{slug}` — 전부 draft라 공개 링크 영향 없음). `_axis-overrides.json` `2023-hr-app-3` → `2023-hr-app-3-1`.
- **드라이브**: `3. 위키 문서/` 스냅샷 407건·`문서 목록.csv`(구본 `이전 버전(v4 3층 367건 2차검수본, 2026-08-30)/`), `문서 주소 변경 (2026-09-11).csv`. `export-wiki-snapshot.py`가 NFD 파일명 때문에 구 「이전 버전」 폴더를 새 보존 폴더 안으로 넣던 결함 수정(NFC 비교).
- **검증**: hwpx-tomd pytest 64, `validate:content` 417건 통과, unit 419 pass(`tests/decompose-source.test.ts` G절 5건 신설: 제외·쪽 범위·서문 라벨·장애유형·2층 반영), 2층 게이트(빈 캡션 0·서식 전사 0·PUA 0·5열 박스 0·연속 ◦ 붙음 0), compare-md-pdf 실질 차이 0.37~0.40%.
- **반영하지 않은 것**: 49번 Q&A 「:」(원본에 없는 기호), 47번 법령 최신화(내년 방침), 19번 「1) 개요」 소절 병합(의도된 구조), 28번 쪽 132(PDF 바닥글 기준 125가 맞음).
- **배포**: PR #116 첫 배포 ERROR 2건 — ① Vercel 프로젝트의 빌드 생략 판정(`git diff --quiet HEAD^ HEAD …`, 2026-09-10 저장 용량 조치)이 `.vercelignore`의 `.git` 제거로 실패 → `.git` 줄 삭제(5월 CLI 업로드용이라 git 연동 배포에 불필요) ② `WARNING_LABEL`에 새 경고 종류 `excluded` 누락으로 `next build` 타입 검사 실패(tsx 실행·테스트는 타입을 보지 않는다) → 라벨 추가. 이후 Vercel·validate·axe 전부 통과.
- **리뷰(code-reviewer 서브에이전트) 반영**: P1 쪽 한정 치환이 경계 쪽에서 앞 구간까지 바꾸던 것 → 정확 범위 먼저, 경계 포함은 0회일 때만(docparse f992ed9). P2 래퍼 승격·호이스팅된 표의 캡션 유실 → 안쪽·호이스팅 표 캡션도 렌더(hwpx-tomd 5686d54, 정본 3종에서 캡션 8줄 복원). P2 `apply-additions` until 가드 「앵커 뒤 정확히 1회」 복원. P3 정규화 스크립트의 펜스 경계·들여쓴 하위 목록, `--italic` 전역 변수 → 인자.

## 2026-09-05 — 색상 대비 WCAG AA 충족 + 전수 대비 게이트 신설

- **배경**: 옴니박스 작업 중 a11y 실패로 드러난 색상 대비 미달(BACKLOG E9)을 위원장 판정(9/5 「4.5:1로 수정」)에 따라 해소. 미달은 **눈으로 보이지 않는 결함**이라 값 조정은 전부 계산으로 정했다(`oklch` → sRGB 변환 후 WCAG 대비). 검산: 종전 `oklch(0.585 0.233 264)`가 `#306cff`로 나와 axe 측정값과 일치.
- **토큰 조정**(라이트 `:root`): `--primary`·`--sidebar-primary` L 0.585 → 0.535(`#306cff` → `#215bf1`), `--muted-foreground` 0.556 → 0.535, `--destructive` 0.577 → 0.540. 다크 `.dark`: `--primary-foreground` near-white(0.985) → near-black(0.145). 다크 primary는 배경 위 글자로도 쓰여(6.18:1) primary 자체를 어둡게 하지 않고 글자 쪽을 뒤집었다.
- **한 번에 안 끝난 이유(기록)**: primary만 4.5로 올렸을 때 axe가 여전히 실패했다. 남은 것은 ① 배지 `bg-primary/10 text-primary`(**알파 합성** 배경이라 토큰 쌍 검사를 통과, 4.30:1) ② `--muted-foreground`가 흰 배경에서는 4.73인데 회색 배경(`bg-muted`/`secondary`/`accent`, 모두 `#f5f5f5`)에서 4.34 ③ 같은 자리의 `--destructive` 4.37. **쌍을 손으로 나열하는 방식 자체가 원인**이라 게이트를 전수 대조로 바꿨다.
- **게이트 신설** `tests/lib/color-contrast.test.ts`: `globals.css`의 `:root`·`.dark` 블록에서 oklch 토큰을 파싱해 **글자 9종 × 배경 8종 전수 조합** + 실사용 알파 조합(`primary/10`·`primary/5`·`destructive/5`)의 대비를 계산하고 4.5:1 미달을 전부 실패로 낸다. 브라우저·서버가 필요 없어 매 커밋 돌고, 아직 화면에 쓰이지 않은 조합까지 미리 막는다. 계산 검산 테스트(흰·검 21:1, 종전 primary `#306cff`/4.47:1 재현)를 함께 둬 변환 구현이 틀리면 게이트가 먼저 깨지게 했다.
  - ⚠ 이 테스트를 쓰면서 잡은 자기 결함: `.dark` 블록을 `indexOf`로 찾으면 파일 앞쪽 `@custom-variant dark (&:is(.dark *))`에 먼저 걸려 `:root`를 읽는다 — 다크 테스트가 라이트 토큰을 검사하는 **거짓 통과**였다(빨간불 확인 과정에서 발견, 줄머리 정규식으로 교정).
- **axe 기준선 조임**: `tests/a11y/axe-serious-baseline.json`에서 12개 라우트의 `color-contrast: 1`을 제거. 종전 기준선은 규칙 단위로 1건을 허용했고(노드 수와 무관) 그 때문에 배지 미달이 로고 미달에 가려져 있었다. 이제 1건이라도 생기면 실패한다.
- **검증**: unit 414 pass + 1 skip / component 211 / lint 0 error / build 성공 / **a11y 40 전부 pass**(색상 대비 위반 0건 — 8/29 주소 재편 이후 처음). 라이트·다크 화면 육안 확인(브랜드 파랑은 같은 계열의 조금 더 깊은 톤, 다크 파란 버튼은 어두운 글자).

## 2026-09-04 — 홈 검색 표면 단일화: 옴니박스 (검색창 2개 → 1개)

- **배경**: 홈 화면에 검색창이 둘 노출됐다(헤더 소형 `SiteSearch` + 히어로 대형 `SiteSearch variant="hero"`). 위원장 지시로 하나만 남기고, 남는 하나를 gildongmu 웹 옴니박스 계약(입력창 하나 + 듀얼 액션, `docs/superpowers/specs/2026-07-30-omnibox-web-ia-redesign-design.md` §1)대로 재구성.
- **홈 = 히어로 옴니박스 단독**: `Header`가 `usePathname()`으로 홈에서만 검색창을 렌더하지 않는다(사이드바 모드 분기와 같은 패턴, 새 상태 없음). 공존이 끝나 `SiteSearch`의 id 두 갈래(`hero-search-input`/`search-input`, `hero-search-listbox`/`site-search-listbox`)를 하나로 합쳤다 — Alt+3·Cmd+K 타깃 `search-input`이 어느 화면에서든 그 화면의 검색창을 가리킨다.
- **듀얼 액션**: `SiteSearch`에 `onAsk` 추가 → `[AI에게 질문]` 버튼 + Cmd/Ctrl+Enter. gildongmu와 달리 `[검색]` 제출 버튼은 두지 않는다(webfortd 검색은 타이핑 즉시 결과가 펼쳐지는 라이브 검색이라 제출 대상이 없다). Enter는 종전 검색 결과 이동 유지. 좁은 화면에서는 `flex-wrap` + 입력창 최소폭으로 질문 버튼이 다음 줄로 내려가 44px 타깃을 지킨다.
- **자동 전송**(위원장 판정 9/4): 질문은 `/chat?q=`로 넘기고 `useAutoSendInitialQuestion`(신설)이 mount 시 1회 전송한 뒤 주소에서 `q`만 제거한다 — 재전송 경로는 리렌더·Strict Mode(ref 가드)와 새로고침(주소 정리) 둘뿐이다. 주소 정리는 `router.replace`가 아니라 `history.replaceState`로 한다(서버 컴포넌트 재렌더가 스트리밍 중 상태를 흔들지 않게). 포커스는 건드리지 않는다 — 완료 시 마지막 질문 헤딩 이동 계약(`useChatCompletionFocus`)이 그대로 성립한다.
- **제거**: 히어로 소제목("정책·법령·사례부터 보조공학까지, 검색하거나 채팅으로 물어보세요")과 별도 "채팅으로 질문" 링크. 전자는 바로 아래 컨트롤이 두 액션을 이미 보여주는 중복 안내였고(미니멀 + SR 낭독 노이즈), 후자는 옴니박스 질문 버튼에 흡수됐다(입력 텍스트를 함께 넘기므로 기능은 늘었다).
- **테스트**: 신규 `tests/components/search/site-search-ask.test.tsx`(4) · `tests/components/WikiHero.test.tsx`(4) · `tests/components/useAutoSendInitialQuestion.test.tsx`(6) · `tests/a11y/omnibox.spec.ts`(3, 실 브라우저 E2E: 질문이 사용자 턴 헤딩으로 서고 `q`가 사라지는 것까지) · `tests/a11y/sidebar.spec.ts`에 "홈 검색창 1개 + Alt+3 안착". `Header.test.tsx`·`AppShell.test.tsx`는 경로 mock을 가변으로 바꿔 홈/홈밖 양쪽을 검증.
- **리뷰가 잡은 결함(별도 컨텍스트, 실측 기반)**: ① **P1 자동 전송 실패가 무음**이었다 — 자동 전송이 `send()`를 우회해 `sendMessage`를 직접 불러 `lastFailedMessage`가 비었고, 오류 배너(`chatError && lastFailedMessage`)와 재시도가 영영 렌더되지 않았다. 완료 신호(효과음·질문 헤딩 포커스)만 나고 답도 오류도 재시도도 없는 3-state 붕괴라, 화면을 볼 수 없는 사용자는 실패를 알 방법이 없다. 실패 표면 준비를 `armFailureSurface()` 한 곳으로 모아 모든 전송 경로가 지나게 하고 회귀 테스트 5건을 고정(수정을 되돌리면 2건이 실패하는 것까지 확인). ② **P2 `/chat`에 `h1`이 없어** 라우트 이동 시 `FocusManager`(첫 `h1`으로 포커스)의 착지점이 없었다 — sr-only `h1` "채팅" 추가(사용자 질문 `h2`의 계층 기준점이기도 하다). 실기기 확인은 BACKLOG A10.
- **리뷰 반영(P3)**: `AppShell` 테스트의 경로 mock 복구를 `beforeEach`로 옮김(assertion 실패 시 상태 누수) / E2E "Enter는 검색 유지"가 결과 0건 쿼리라 공회전하던 것을 결과가 나오는 쿼리로 바꿔 Enter·Cmd+Enter를 각각 검증 / 질문 길이 상한 500자 / 훅 주석의 `router.replace` 근거를 실측대로 정정(RSC 왕복은 실재하나 클라이언트 state는 보존됨) / StrictMode 이중 실행 케이스 테스트 고정.
- **리뷰가 확인한 것**: `sentRef` 가드가 StrictMode에서도 1회 보장 / `history.replaceState`가 App Router에서 캐노니컬 URL만 갱신하고 RSC 재요청·리마운트를 하지 않음(Next 16.2.6 소스 실독) / `variant="hero"` 공존 경로 부재·잔존 참조 0건 / 낭독 순서 `combobox → 지우기 → 음성 → AI에게 질문`, 터치 타깃 108×44·44×44, 320px에서 줄바꿈 288×44.
- **VoiceOver 실사용 합격(2026-09-05, 위원장 실측 — BACKLOG A10 종결)**: ① 홈 낭독 순서 `검색창 → 음성으로 검색 → AI에게 질문` ② 검색창 Cmd+Enter가 채팅으로 이동 + 질문 자동 전송 ③ `/chat` 도착 시 sr-only `h1` 「채팅」 낭독(리뷰 P2 수정이 실기기에서 확인됨) ④ 답변 완료 시 질문 헤딩으로 커서 안착, 다음 항목이 답변 첫 문단. 정적 감사·E2E로 대체 불가한 축이라 이 판정이 정본이다.
- **검증**: unit 409 pass + 1 skip / component 211 / lint 0 error / build 성공(487 정적 페이지) / a11y 38 pass. 잔여 a11y 실패 2건은 이 변경과 무관한 기존 상태(`git stash` 대조로 확인, 원인·판정은 BACKLOG E9).

## 2026-08-30 — 델파이 조사지 학교급 제목 승격 + 청각 전문가협의회 (2)(3) 승격 (3층 363 → 367건)

- **배경**: 2차 검수 표본 3·26번이 `2023-research-app-3-pt1`·`pt2`였는데, 부록3(델파이 2차 조사지)이 학교급(초·중·고·특수) 경계가 아니라 5만 자 기준으로 잘려 있었다. 원인은 「「장애인교원 교육 전념 여건 지원사업」을 위한 전문가 패널 의견 조사_(초등학교용, 2차)」 표지가 제목이 아니라 표 셀 안에 있어 분해기가 경계로 보지 못한 것. 위원장 결정(8/30, 자문 세션)으로 표지를 제목으로 승격. BACKLOG C8(청각 (2)(3) 본문 서식 → 「① 진행 절차」 중복)도 같은 경로로 종결.
- **2층**: `정본 수정 목록.csv`에 유형 「제목 승격」 10행(부록2 1차 4 + 부록3 2차 4 + 청각 2, 처리 적용, 표지의 `<br>`는 띄어쓰기). 제목 문구는 원본 표지 그대로. `apply_corrections.py`가 쪽 범위 한정으로 바뀐 뒤 기존 행이 실패해(BACKLOG C11) 10행은 같은 의미의 직접 치환으로 정본에 적용, diff 10 hunk 확인.
- **3층**(`decompose --reset`): 부록2 `app-2-pt1`·`pt2` → `app-2-x1`~`x4`(학교급별 1.1~1.2만 자), 부록3 `app-3-pt1`~`pt4` → `app-3-x1`(초등 2.6만)·`x2`(중 2.8만)·`x3`(고 3.3만)·`x4`(특수 3.6만), 청각 `4-3-1-1` → `-1`/`-2`/`-3`. 총 363 → 367(research 92 → 96). 전부 draft, `.embed-paused` 유지.
- **분할 한도 5만 → 5.5만 자**(위원장 결정, 자문 세션 경유): 특수학교용 2차(4.9만 자)가 예산 4.75만을 넘어 「전문가 의견 종합·검토 및 반영 내용」 표 1,411자가 꼬리 문서(`x4-pt2`)로 떨어졌다. 예외 병합은 재생성마다 되풀이되므로 한도를 올림 — `decompose-source.ts` SPLIT_MAX_CHARS·`validate-frontmatter.ts` BODY_MAX_CHARS(둘 다 55_000, 예산 52_500), 설계 정본 §2.3. 다른 출처는 이 구간에 걸린 문서가 없어(분할 0) 영향 없음. 현 4종에 분할 페이지 0건(테스트로 고정).
- **동기화**: `docs/slug-migration-2026-08.csv` 재생성(21행 변경, 델파이·청각 관련만) + 드라이브 `문서 주소 대응표 (2026-08-29).csv` 동일본, 드라이브 `3. 위키 문서/` 스냅샷·`문서 목록.csv` 416건(구 스냅샷은 `이전 버전(v4 3층 363건, 2026-08-29)`·`이전 버전(v4 3층 368건, 2026-08-30)`), `정본 수정 목록.csv` 드라이브 동일본. 2차 검수 세트(docx·xlsx·마크다운 폴더)의 3·26번 갱신은 자문 세션 몫(새 주소 `app-3-x1`·`app-3-x2`).
- **검증**: `validate:content` 427건 통과, unit 409 pass(`tests/decompose-source.test.ts`의 `-pt1` 표본을 「분할 페이지 0건」 단언으로 교체).

## 2026-08-29 — 3층 위키 문서 재생성 (v4 정본 → outline 주소 체계, 485 → 363건)

- **배경**: BACKLOG C5. 2층 v4 4종(8/28)을 입력으로 `scripts/decompose-source.ts`를 설계 정본 `docs/DECOMPOSE_V2_DESIGN.md`대로 개정해 4종 파생 문서를 전면 재생성. 단체협약(2020-ca)은 `frozen`으로 잠가 편집기 커밋 2건을 보존.
- **주소 체계**: 순번 fallback(`p-NNN`·`appendix-NNN`) 폐기 → 출처 접두 + 전 조상 번호(`2023-hr-2-2-2-1` = Ⅱ > 2. > 2) > (1)). 번호 없는 제목 `x<n>`, 원본 번호 중복 `-d2`, 5만 자 분할 `-pt<n>`, 부모 서문 개요 페이지는 부모 경로. splitLevel은 실측으로 research·hr·jbu 4, staff 3(평균 본문 8.2k/2.9k/2.8k/1.6k자).
- **규칙**: 제목 후보 제외(`<표`·`<그림`·참고·TIP·Q&A → 굵게), 출처 내 제목 유일성(구분되는 가장 얕은 조상 접두), 제목 끝 쪽수 제거, 빈 조각(<100자) 형제 병합, 표 경계 5만 자 분할, 쪽 주석 → `source_page`·`source_page_end`·`source_page_pdf`(FrontmatterSchema 신설), 이미지 마커 뒤 원문 `(이미지: alt)` 보존, 본문 소제목 `##`부터 정규화, `## 관련 페이지`(같은 부모 아래 형제 `[[slug|제목]] (원본 N쪽)`, 개요 우선, 20건 초과 앞뒤 10) 신설.
- **렌더**: `kb-mdx.ts`가 위키링크를 링크로 변환(해석기 `kb-links.ts` 주입, 종전엔 `[[slug]]`가 글자로 노출)하고 허용 태그 `<br>`·`<mark>`·`<sub>`·`<sup>`(속성 없음)만 escape 뒤 복원. 편집기 프리뷰도 동일 경로.
- **대응표·참조 갱신**: `scripts/slug-migration.ts`(제목·소제목 일치 327 + 본문 포함도 128, 미매칭 30 = v3 잔재) → `docs/slug-migration-2026-08.csv`; `scripts/apply-slug-migration.ts`가 `_axis-overrides.json`(24 → 17키)·인기/역할 진입·미디어 카탈로그·FAQ 위키링크·테스트 고정값 치환. 회귀 표 `docs/regression-2026-08-review48.md`.
- **검증 게이트**(`validate-frontmatter.ts`): 파서 잔존 태그·허용 태그 불균형·끊긴 위키링크·출처 내 제목 중복·100자 미만/5만 자 초과·순번 주소 재발 → 빌드 실패. 이미지 매핑 키는 `<slug>#<source>#<alt 해시>`로 재설계(`scripts/lib/image-key.ts`), v3 매핑 104건·래스터 후보 79건은 `content/_archive-v3/`에 보존.
- **공개·임베딩**: 위원장 결정(8/28)대로 4종 363건 전부 draft(2차 검증 뒤 `kb:bootstrap` 일괄 공개). 그동안 production에서 4종 문서는 「검토 중」으로 숨겨지고 채팅 RAG는 DB의 v3 published 청크를 그대로 쓴다. 야간 sync+embed는 `content/.embed-paused`로 일시정지(파일 삭제 시 자동 재개).
- **드라이브 공유 폴더 갱신**(자문 메모 8/27 §6 6단계): `scripts/drive/export-wiki-snapshot.py`(신설)로 `6. 콘텐츠 편집/3. 위키 문서/`를 412건(4종 363 + 단체협약 49)으로 교체하고 `문서 목록.csv`를 새 주소·원본 쪽 기준으로 재생성(구 485건은 `이전 버전(v3 3층, 2026-08)/`). 2차 검수 표본 50건(1차 문제 보고 30 + 무작위 20, 시드 20260829)으로 검수 시트 v2·읽기 docx·안내문 초안 작성. `source_page` 형식 혼재 발견 → BACKLOG C10.
- **리뷰**(별도 컨텍스트, 실측 기반 12건): Important 2건 수정 — `kb-mdx` 허용 태그 복원이 대문자 태그를 살려 MDX 컴포넌트 참조(빌드 실패 자기 DoS)가 되던 것, 개요 페이지가 관련 페이지 형제 목록에서 고아가 되던 것(부록 슬러그 역파싱). Minor 7건 같은 커밋(참고 제목 정규식 한국어 경계·5만 자 예산·source_page_end 범위·H1 제거 정규식·병합 조각 소제목 강등·`Object.hasOwn`·적대 테스트), 3건 BACKLOG(C9 청커·E8).
- **검증**: unit 409 / component 190 / lint 0 error / validate 422 / build 성공 / 실렌더 경로 MDX 컴파일 스윕 422건 전부 성공. 분해 경고: 범위 4(research 2건은 2층 제목 승격 누락 → BACKLOG C8), 원본 번호 중복 2, 분할 2(델파이 조사지).

## 2026-08-28 — 2층 마크다운 정본 v4 4종 재생성 (HWP 결정론·하이브리드 경로)

- **배경**: 1차 검수(8/24)가 지적한 2층 결함(병합셀 날조·열 밀림·쪽 경계 잘림·표 누락·파서 태그 잔존)의 뿌리가 LLM 파싱이라, 편집 원본 HWP에서 결정론적으로 재생성. 2023 최종보고서는 HWP=정본 경로(`scripts/source-v4/build-2023-report.sh`, `2590760`), 인쇄 책자 3종은 초안 HWP(구조) + 인쇄 PDF(내용) 하이브리드(`build-3docs.sh`).
- **구성**: docparse `hwpx_enrich.py` 보강(제목 표 승격·상대 수준 정규식·머리말 H1 제거·쪽 번호) + `postprocess-hybrid.py`(간지 표 → H1, 이미지 대체/전사, 집필진 명단·판권·초안 표시 삭제, PUA 글리프·가운뎃점 정규화) + `apply-additions.py`(앵커 삽입 8모드, 모호하면 중단) + `alts/`(문서별 이미지 대체·삽입 명세·서식 전사 블록). 원본과 달라지는 변경은 `정본 수정 목록.csv`(79행)와 삽입 명세뿐.
- **결과**: 지원인력 표 1→173, 단위학교 0→170, 인사관리 1→142(v3는 HTML 표) / 파서 태그·가운뎃점 공백 0 / 인쇄 쪽 주석 122·90·56 / 목차 항목 전량 제목 대응 / PDF 어휘 전수 대조 실질 차이 전량 설명(명단·판권·서식 전사·표 세로 머리글). 최종본 추가분(인사관리 개인정보 보호법·지능정보화기본법·교원지위법 개정 조문, 인권위 결정례, 뇌전증 고려사항 등)과 문구 수정 33건 반영, 신청 서식 9쪽은 검수자 수정본 27 + v3 OCR본 전사 블록(검수 26·27 해소). 8/24 §4.2~4.4 지적(18·19·24~27·35·38~47) 해소, 3층 몫(22·23·28·31)은 5단계로 이관.
- **산출물**: `data/source-md/*_fused_v4_hwpxlocal+hwpxenrich+pdftotext.md` 4종(드라이브 `2. 마크다운 정본/` 동일본 + CSV). 기록: 자문 메모 `260828_2023최종보고서_2층v4_생성검증.md`·`260828_3종HWP_2층v4_생성검증.md`. 후속: 3층 485건 재생성(BACKLOG C5), 지원인력 부록2 기기 사진 alt(C6).

## 2026-08-17 — 문서 만료 점검(doc-audit) + 배포 파일 정비

- `docs/BACKLOG.md` 신설(PROGRESS에서 열린 항목·판정 대기·이월 백로그 분리), PROGRESS.md를 현재 상태·다음 단계·미결 결정만으로 재편, README.md를 얇게 재작성(2026-05-17 MDX·GitHub Pages 시절 서술 전면 폐기), `.env.local.example` → `.env.example` 개명 + 실제 사용 env 전수 반영(`!.env.example` 예외). CLAUDE.md·`docs/IOS_DISTRIBUTION.md`의 낡은 서술 정정(outputFileTracingExcludes 삭제 반영, 축 7개·마이그레이션 0013, kb:bootstrap, Apple Developer Program 가입 완료 반영, 마이크 권한 등). 상세는 커밋 메시지.

## 2026-08-04 — 감수자용 git-backed 웹 마크다운 편집기 (PR #113 `a28b314`)

- **배경**: 중부대 연구보조원 등 비개발자 감수자가 git·저장소 개념 없이 웹앱에서 콘텐츠를 직접 수정할 수 있어야 한다는 위원장 결정. 2026-05-29 영구 원칙("마크다운이 정본, DB 직접 편집 UI 금지")을 뒤집지 않고, 당시 예약된 git-backed 어댑터 경로를 구현 — 편집기는 GitHub Contents API로 마크다운 정본(master)에 커밋하고 push→Vercel 빌드가 사이트를 갱신한다. spec에 codex 적대적 리뷰 28건 처리(수용 15계열·기각 7, 실코드 대조) 반영.
- **구성**: KB 문서 페이지 "편집" 버튼(editor/admin 한정 노출) → `/editor?slug=` 편집 화면(textarea+수동 프리뷰 토글+4상태 polite 통지+충돌 시 내 편집본 분리 보존+localStorage 초안+Cmd/Ctrl+S·E 단축키) → 서버 액션 3종(로드·프리뷰·반영, 전부 권한 재검증+rate limit). frontmatter는 클라이언트 미경유·원본 바이트 보존, 커밋 신원은 가명 식별자(`editor:<uuid8>`, 공개 repo 개인정보 비기재). 프리뷰·검증·프로덕션 렌더가 `kb-mdx` 단일 정본(escape+serialize) 공유. editor 역할 신설(0013 기존 허용 활용, RLS 자기부여 차단 실 DB 고정 테스트). 야간 GitHub Actions가 SHA 게이트로 kb:sync+kb:embed(실패 시 자동 재시도). 감수자 안내 `docs/EDITOR_GUIDE.md`.
- **리뷰 루프가 잡은 실결함**: 초안 복원이 debounce 경합으로 상시 유실(C) / 돌아가기 링크 전 문서 404(C) / editor 역할이 admin layout 게이트에 막혀 편집기 도달 불가 → `/editor` 이동(적대적 리뷰 지적 17 적중) / PUT 409 레이스가 자기 입력을 최신본으로 반환 / 연속 반영 매번 가짜 충돌(baseSha 미갱신) / transport 실패 시 SR 통지 0 / Cmd+E 포커스 이탈 / 동일 메시지 live region 무발화 / 비로그인·무권한 구분 미구현 등. 태스크별 리뷰 10회+스코프 재리뷰 8회+최종 whole-branch 리뷰로 전부 해소·회귀 테스트 고정.
- **검증**: unit 411 / component 190 / a11y 35 / integration RLS 5(실 DB) / lint 0 / build 성공(함수 9/12, 신규 0). 잔여 게이트는 아래 운영 셋업으로 대부분 해소, 위원장 VoiceOver 실기기 실측만 남음(`docs/BACKLOG.md`).
- **운영 셋업 완료(같은 날, `2a08372`)**: fine-grained PAT `webfortd-content-editor`(khudt-org 한정 Contents RW, 2027-08-05 만료) 발급·org 승인 → Vercel `GITHUB_CONTENT_TOKEN`(Production+Preview) 등록·재배포. master ruleset `master-protect`(deletion·non_fast_forward) 생성. ⚠ 기존 classic 보호(PR 필수+validate 체크, 5월 설정)가 편집기 master 직행 커밋을 거부하는 것이 실호출에서 드러나 classic 보호는 삭제(khudt01 승인) — 이후 master 직접 push는 ruleset(강제 push·삭제 금지)만 적용되고 PR 요구 없음. spec의 "보호 규칙 없음 실측"은 admin 권한 없는 토큰의 404 오독이었음(spec 정정). Actions Secrets 4종(`NEXT_PUBLIC_SUPABASE_URL`·`SUPABASE_SECRET_KEY`·`GOOGLE_GENERATIVE_AI_API_KEY`·`VAR_RW_TOKEN`) 등록. 야간 워크플로 workflow_dispatch 완주(sync 544 + embed 2775 + `LAST_EMBED_SHA` 기록) — 최초 실행이 Gemini RPM 쿼터 초과로 실패해 `gemini-embed.ts`에 배치 간 2.5초 지연 + 쿼터 감지 시 65초 대기 재시도 패치(`c52996d`). production 실호출 게이트: 편집 버튼 노출 → `/editor` 로드 → 반영("커밋 접수") → 커밋 `09abc8d`(가명 `[editor:95275c21]`, 이메일 무노출) → 같은 화면 연속 반영 무충돌(`932ff50`, baseSha 갱신 실증) → 원상 복구 확인.
- **부수 발견**: 기존 tests/migrations 8건이 운영 DB 베이스라인 드리프트로 실패 중(본 트랙 무관, published 535 vs 초기 가정 0 등) — 별도 정리 필요(`docs/BACKLOG.md`).
- **iOS 부수**(`f3ecaee`): `ios/deploy-device.sh` 공통본 동기화(세 repo 동일본 — 기기 상태 문자열·CONFIGURATION·서명 훅 분기 개선 2건 + 빌드 구성).

## 2026-07-20 — 받아쓰기 트랙 후속 정비 3건: gildongmu 백포트 + iOS 44pt 정비 + 웹 §6 신계약

- **gildongmu SpeechService 레이스 가드 백포트**(gildongmu main `e1f5d2f`, 실기기 배포): PR #103 리뷰가 검출해 "백포트 권장(미실행)"으로 기록됐던 2건 — ① 세대 토큰(cancel 후 늦게 완주한 start()의 마이크 재점화 차단) ② stopping 상호 배제(stop finalize 중 cancel의 중복 종료 차단) — 를 원본에 이식. 받아쓰기 트랙의 두 repo 정합 완결.
- **iOS 44pt 터치 타깃 정비 7파일**(#108 후속 이월 ①): Axis·WikiHome·Document·Settings·Auth·Library·Media의 바깥 `.frame(minHeight: 44)`를 label 안쪽 `.frame`+`.contentShape`로 이동(확립 패턴 "버튼 바깥 frame은 히트 영역을 안 넓힌다"). 실결함은 비-List 컨텍스트(DocumentView 원문 보기·백링크, LibraryView 트레일링·toolbar, AuthSheet)이고 List 행은 패턴 통일. 리뷰 확인: role·라벨 불변, 회귀 없음.
- **웹 받아쓰기 §6 신계약**(#108 후속 이월 ③, dodo R184·iOS 동형): ① VoiceRecordButton 전사 성공 통지를 일반 안내문("추가했어요")에서 **받아쓴 결과 원문**으로 교체(successMessage prop 제거, 소비자 콜백 먼저 → 원문 통지 순서 = "포커스 발화 뒤 결과 낭독") ② ChatUI 전사 성공 시 **전송 버튼 포커스 이동** — 전송 버튼이 빈 입력일 때 disabled라 `flushSync`로 append 커밋 후 focus(리뷰가 통제 실험으로 flushSync 필요성·ref 스프레드 체인 도달을 실측 확인) ③ hero 검색도 원문 통지로 정렬(입력창 재포커스+건수 통지는 기존 유지). §6 계약 vitest 2건 추가(VoiceRecordButton 원문 통지·ChatUI 포커스).
- **검증**: lint 0 error / unit 374 / components 전건 / next build / iOS 시뮬레이터 빌드 그린. 잔여 실측(위원장): List NavigationLink 행 전체 탭 육안 확인(최소 44pt는 보장됨), BlockRenderer 리스트 마커 이중 낭독 확인(기존 이월 ②).

## 2026-07-20 — iOS WhatsApp식 홀드 받아쓰기 이식: 탭 토글 대체 + Lazy 스택 CPU 결함 선제 제거 (#109)

- **배경**: gildongmu 실기기 VoiceOver 검증 완료(2026-07-20, 위원장 합격)된 홀드 받아쓰기 계약을 이식. 진입점별 차등 — 전송형(채팅)=홀드+잠금+취소 풀 계약, 단일 확정형(위키 검색)=홀드 단일 동작.
- **`HoldDictationButton` 신설**: gildongmu 정본 1:1 이식(UIKit 인식기 계층 — `UILongPressGestureRecognizer` 0.25s + `UITapGestureRecognizer.require(toFail:)`, SwiftUI 제스처 조합은 List 팬 경합·VO pass-through 드래그 유실 실기기 확정으로 금지). 경합 가드 3종(finishInFlight·cancelInFlight·startTask await)·지배 축 슬라이드 판정(위 60pt=잠금, 왼쪽 60pt=취소)·녹음 시작 interrupting 무음 통지(진행 중 VO 낭독 절단)·녹음 중 라벨 불변(정적 "받아쓰기")·짧은 탭=사용법 안내·권한 미시작 세션 잠금 무통지(3-state) 전부 보존. webfortd 적응 2가지: i18n → 한국어 리터럴, 통지 → `Announce` 단일 채널 경유. webfortd `SpeechService`는 동일 엔진(SpeechAnalyzer)에 세대 토큰·stopping 가드가 이미 있어 무수정 재사용.
- **채팅(ChatView)**: 릴리스=초안 병합 즉시 전송(생성 중엔 초안 보존 폴백, `send` 가드 거부 시 초안 복원), 잠금=전사를 입력창에 병합 확정+"받아쓰기 잠김"+새 세그먼트 polite 통지(재홀드로 이어쓰기), 왼쪽 밀기=세션 전사만 취소. "텍스트 지우기" 버튼 신설(초안 있을 때만, 자기소거 시 입력 필드 포커스 선점 §5). 구 탭 토글(라벨 전환 신호)·`micTaskInFlight` 제거.
- **위키 검색(WikiHomeView)**: 홀드 단일 동작(잠금·취소 없음) — 릴리스=쿼리 대체+즉시 검색. 구 탭 토글의 금지 라벨 "음성 입력"도 함께 소거.
- **Lazy 스택 결함 선제 제거**: 채팅 메시지 리스트·BlockRenderer의 `LazyVStack`→eager `VStack`. gildongmu 실기기 cpu_resource 마이크로스택샷으로 확정된 결함 — 대화 몇 턴 후 lazy 레이아웃 캐시(LazySubviewPlacements) 크기 추정 진동이 메인 스레드 100% CPU 무한 루프(앱 먹통·VO 무응답). 히스토리 유한이라 eager가 정본, 화면 밖 AX 컬링(완료 포커스 실패·로터 누락 원인)도 함께 해소.
- **리뷰 fix (P1)**: 홀드 중 탭 이탈 시 인식기 `.cancelled`의 stop()이 onDisappear cancel()보다 stopping 가드를 선점하면 늦은 전사가 떠난 화면의 onTranscript로 배달(전역 통지+무확인 전송) — ChatView에 WikiHomeView 동형 `isVisible` 가드 이식.
- **검증**: Kit 49 그린 / 시뮬레이터 빌드 그린 / iPhone 실기기 배포 / **위원장 VoiceOver 실측 합격**(홀드 시 힌트 낭독 즉시 중단·잠금 통지·이어쓰기·병합 전송·취소·짧은 탭 안내) 후 머지.

## 2026-07-19 — iOS 채팅 VoiceOver 접근성 헌장 §6 정렬: R184 포커스 계약 이식 (#108)

- **배경**: dodo-planet R184(2026-07-19 실기기 판정)·gildongmu 역이식으로 확정된 대화형 UI 계약이 gildongmu 초기 클론 계열인 webfortd iOS 채팅에 전부 미반영 — §6 전 항목 기준 점검·이식.
- **포커스 계약 개정**: 전송 시 보내기 버튼 선점 이동·유지(구계약 "완료 시 답변으로 이동" 폐기), 완료 시에만 마지막 질문 헤딩 이동 — 질문 상단 스크롤 가시화 → 400ms 후 포커스 → 바인딩 nil 리셋(AX 컬링 실패 신호) 감지 시 재스크롤+1회 재시도. VO 실행 중엔 append·델타 스크롤도 질문 상단으로 목적지 단일화. 중단(stop)은 완료가 아님 — `ChatStore.stop()`이 세대를 올려 취소 Task의 완료 신호(`answerRevision` 신설)를 무효화, 포커스는 버튼에 유지.
- **컨트롤 정비**: 전송·중단 단일 버튼 라벨 교체(if/else 교체·`.disabled()` 폐기 — 포커스 쥔 요소 제거로 인한 VO 최상단 리셋 차단) / 질문 버블 `.isHeader`+포커스 바인딩 직접 부착(로터 헤딩 턴 점프) / 마이크 라벨 "받아쓰기 시작/중지"(내용-라벨 충돌 금지) / 받아쓰기 완료 침묵 금지(전사 append → 전송 버튼 자동 포커스 → 결과 원문 polite 통지; SpeechService는 자동 정지 경로가 없어 반환값 소비 유지) / 44pt frame label 안쪽+contentShape 전수(채팅 계열).
- **Announce 단일 채널**: dodo 슬림판 유틸 신설(실패는 interrupting), 전 앱 직접 `Announcement` 호출 15건 일원화. `ChatFocusDiag` 계측(DEBUG, VO 실착지 파일 로그 — 실기기 실패 시 가설 패치 금지·로그 우선) 동반.
- **리뷰 fix**: 스레드 전환·새 대화·로그아웃 시 완료 포커스 시퀀스 미취소 → stale 대입이 새 포커스를 걷어가는 레이스 — 명시 취소 3경로 + `sequenceStillValid`(대상 메시지 생존 확인) 구조 가드.
- **검증**: Kit 49 그린 / 시뮬레이터 빌드 그린 / 시뮬레이터 AX 브리지 실측 — 질문 `AXHeading`, 답변 단락·리스트 항목별 분리 + 본문 `AXHeading`, "받아쓰기 시작"·"전송" 라벨 노출, 긴 답변 시 질문 AX 컬링 재현(2단계 시퀀스 필요성 방증). **VO 포커스 이동은 위원장 실기기 판정 잔여**.
- **웹 점검 결과(수정 불요)**: §5 계열은 기패치 — 전송 시 입력창 포커스 유지 + 완료 시 질문 헤딩 이동(`useChatCompletionFocus`), 산문은 react-markdown 블록 노드라 분리 무관. §6 받아쓰기 신계약(결과 원문 통지+전송 버튼 포커스)은 dodo 웹에도 미적용인 계열이라 웹 후속으로 이월.
- **후속 이월**: 44pt 바깥 frame 채팅 외 7개 파일 잔존(동일 패턴 정비 후보) / BlockRenderer 리스트 마커 `•` 실기기 이중 낭독 여부 확인.

## 2026-07-18 — 음성 받아쓰기 gildongmu 이식: 웹 전면 개선 + iOS 신설 + 웹 검색 (#103·#104·#106)

- **웹 전면 gildongmu화 (#103)**: Web Audio 효과음 3종(상승=시작·하강=정지·단음=취소 — 기존 useSound는 무음 no-op) + useVoiceRecorder 견고화(오류 코드 6종 계약, busyRef 더블탭 잠금, mountedRef 언마운트 가드, AbortController fetch 취소, 핸들러 해제) + VoiceRecordButton 교체(시작/정지 음성 안내 제거 → 효과음+aria-label 변화가 상태 신호, 시작 성공 시 버튼 재포커스, Esc 취소 IME 가드; 120초 마일스톤 안내·성공 polite 통지는 유지) + 권한 사전 모달·훅 삭제(getUserMedia 네이티브 단일 경로) + transcribe 인식 실패 400→422.
- **iOS 채팅 받아쓰기 신설 (#103)**: gildongmu SpeechService 이식(iOS 26 SpeechAnalyzer 온디바이스 ko-KR, 서버 왕복·Deepgram 키 불필요, 소리+햅틱) + ChatView 마이크 버튼(전사 append — 웹과 동형, gildongmu의 대체와 의도적 차이) + NSMicrophoneUsageDescription.
- **iOS 위키 탭 검색 받아쓰기 (#104)**: 마이크 버튼은 목록 첫 행(toolbar는 VoiceOver가 제목보다 먼저 읽는 gildongmu 실측), **정지 = 쿼리 입력 + performSearch 즉시 실행**(검색 전용 계약, 채팅 append와 대비) + 탭 가시성 가드(정지 확정 중 탭 이탈 시 오프스크린 검색·전역 알림 차단).
- **웹 위키 홈 hero 검색창 받아쓰기 (#106)**: iOS 위키 탭 계약의 웹 이식. VoiceRecordButton에 `idleLabel`·`successMessage` 옵셔널 prop(기본값=채팅 카피, ChatUI 회귀 없음)만 열어 재사용. 웹 검색은 라이브 콤보박스라 **전사 완료 = 쿼리 대체 + 결과 팝오버 + 입력창 재포커스**(combobox 화살표 탐색 전제 — 리뷰 P1)만으로 "검색 버튼 효과" 성립, 건수는 기존 `role=status` 발화. 오류는 ChatUI 동형 role=alert+닫기. 헤더 소형 검색창은 제외(h-9에 44px 타깃 부적합, display:contents 래퍼로 DOM 기여 불변). vitest 5건(useVoiceRecorder mock·훅 옵션 캡처). production READY + 라이브 hero 버튼 확인.
- **리뷰 fix 3건 (#103)**: iOS 세대 토큰(cancel 후 늦은 start 완주가 마이크 재점화), 웹 cancelRecording 이중 stop() throw → busyRef 영구 잠김(try/catch+상태 확인), iOS stop/cancel stopping 상호 배제. **①③은 gildongmu 원본에도 동일 결함 — 백포트 권장(미실행)**.
- 검증: unit 374 / components 166 / lint 0 error / 웹·iOS 빌드 성공. production READY + transcribe 실스모크 200(conf 0.95). iPhone 13 Pro 배포 + **위원장 실 마이크 스모크 통과(채팅·위키 검색 모두)**.
- 부수: eslint가 SwiftPM `.build` 산출물을 스캔해 lint가 깨지던 환경 결함 영구 해결(globalIgnores).
- 운영 교훈: GitHub commit status "failure"(deployment blocked 링크)여도 Vercel 배포 목록엔 같은 커밋이 BUILDING→READY로 진행될 수 있음(Hobby 동시 빌드 제한의 일시 차단 추정) — status만으로 실패 단정 금지.

## 2026-07-17 — 프로덕션 배포 정상화: [...kb] catch-all 통합 (#100)

- **원인 규명**: 2026-06-18경부터 engccer Hobby의 전 배포가 `exceeded_serverless_functions_per_deployment`(배포당 함수 12개 제한)로 실패. `vercel build` 산출물 실측 — 유니크 함수 17개 중 9개가 KB 축별 `[slug]` 라우트(prerender 라우트는 라우트당 함수 1개 + 콘텐츠 트레이스 6,501파일이라 공유 람다 그룹핑 불가). 라우트 수가 많은 KB 구조 특성이 원인이라 dodo-planet(API 68개, 균일 설정 → 공유 람다)·gildongmu는 안 걸림.
- **무효 실험 2회 기록**: `dynamicParams=false`·`force-dynamic` 모두 함수 수 불변(17) — 렌더 모드가 아니라 라우트 수가 지배 변수.
- **해소**: 축 `[slug]` 라우트 9개 → `(wiki)/[...kb]/page.tsx` 단일 catch-all(경로 파서 + generateStaticParams 통합, 605페이지 프리렌더·Draft Mode 유지, URL 완전 불변) + `ResourcesDocView` 공용화. 함수 17→9개(실배포 람다 7개).
- **검증**: 프리뷰·프로덕션 배포 READY(한 달 만의 첫 성공), 실서비스 URL smoke(축·law 문서 200, 미지 slug 404, 정적 라우트 불변), 막혀 있던 #97 모션 변경 라이브 반영 확인. unit 370·components 166·a11y 33 그린.
- **영구 규칙**: 새 KB 문서 라우트는 파일 라우트 신설 금지 — `[...kb]` 파서에 추가(파일 라우트 1개 = 함수 1개).
- 1안(KHUDT Pro 재활성)은 위원장 보류 — Billing Reactivate 버튼 활성·카드 등록 확인 상태로 대기(PROGRESS.md §미결 결정).

## 2026-07-17 — 애니메이션·모션 전수 감사 (웹 #97 + iOS #98)

improve-animations 스킬 사이클(감사 → 플랜화 → 실행 → review-animations 기준 리뷰 → 머지)을 두 트랙 단일 세션 완결. 정본: `plans/web-animations/`(9건 반영 + 기각 8건 근거), `plans/ios-animations/`(1건 반영 + 기각 7건 근거).

### 웹 (#97, squash `01545a2`)
- **HIGH**: 데스크탑 사이드바 Cmd+B 토글의 width/padding-left 200ms 전환 제거(키보드 고빈도 + layout 속성) / `src/lib/motion.ts` 신설 — OS `prefers-reduced-motion`+앱 `reduce-motion` 클래스 이중 게이트를 채팅 StickToBottom·scrollIntoView 2곳·TOC에 적용(CSS 전면 차단이 못 잡는 JS 스크롤 공백 해소, 단위 테스트 6) / 레거시 진행률 바 width→scaleX(GPU 합성)
- **MEDIUM**: framer-motion(import 0건)·`@radix-ui/react-navigation-menu` 의존성 제거 + 미사용 sources.tsx·navigation-menu.tsx 삭제 / src 내 `transition-all` 12곳 명시 속성 전환 + Button `active:scale-[0.97]` 눌림 피드백 / `@theme --ease-out` 강화(cubic-bezier(0.23,1,0.32,1)) + 오버레이 7곳 ease-out 명시(tw-animate `--tw-ease` 체인 빌드 CSS 실측) / 검색 결과 listbox 진입 모션
- **LOW**: ThreadDrawer 시트 ease-out·열림300/닫힘200 / 인기 페이지 체브론 hover 이동 제거
- 검증: unit 370 / components 166 / a11y 33 그린. 리뷰 Approve(P1/P2 0건).

### iOS (#98, squash `ee516d1`)
- 감사 결론: 명시 모션 0·시스템 기본 전환의 극소 표면 — 실질 파인딩은 채팅 자동 스크롤 하드 점프 1건(Reduce Motion 유일 공백).
- ChatView `scrollToLastMessage` → `withAnimation(reduceMotion ? nil : .easeOut(duration: 0.25))` 단일 호출. 시뮬레이터 프레임 정량 실측: RM OFF 7~11프레임 연속 곡선 vs RM ON 1프레임 점프 대조 확정.
- `ios/deploy-device.sh` 이식(dodo-planet byte-identical, 세 repo 동일본) + 실기기(iPhone 13 Pro) 설치·실행 검증.

### 운영 이슈 발견 (트랙 부산물)
- **프로덕션 배포 전면 실패 원인 확정**: engccer Hobby의 전 배포가 2026-06-18경부터 `exceeded_serverless_functions_per_deployment`(Hobby 함수 12개 제한)로 ERROR — 빌드 성공·patchBuild 거부. 현 서빙은 스테일 빌드, 이후 서버 변경 라이브 미반영. 해소 경로(KHUDT Pro 복귀 vs 함수 감축)는 PROGRESS.md §미결 결정.

## 2026-07-14 — 공식 사업 트랙 문서 갱신 (docs only)

- 과업요청서 최종본(§1~§9 + 부록 A·B) 중부대 전달 반영: CLAUDE.md 사업 맥락·핵심 자문 문서 표, DIRECTION_2026.md §11 진행 상태, PROGRESS.md 공식 사업 트랙 항목.
- 공식 웹앱 올해 범위에서 일반 이용자 로그인·대화 기록 저장·고충상담 제외(교육부 개인정보 협의) 기록 — webfortd는 독립 트랙으로 해당 기능 유지.
- §앱 정체성의 구 시나리오 A(중부대 이관)/B를 2026-06-05 재포지셔닝의 두 미래 경로 A(레퍼런스)/B(장교조 편입)로 갱신.
- **공개 저장소 비기재 원칙 신설·소급 적용**: 수행 후보 업체 실명·개인 신상을 public repo 문서에서 중립화(CLAUDE.md·AGENTS.md 변경 이력, DIRECTION_2026.md §11, 스펙 2건). 정본은 장교조 자문 디렉터리.

## 2026-07-10 — iOS 네이티브 앱 v1 코딩 완료 (PR #87~#91)

단일 세션에서 설계(spec) → 마일스톤별 plan → subagent-driven 구현 → 3중 리뷰(태스크·whole-branch·coderabbit) → 머지까지 완주. 라이브 음성 채팅은 위원장 지시로 M5 보류(dodo-planet Live 오류 선수정 후 이식).

### M0 — 오프라인 위키 (#87)
- `ios/` 트리 신설: WebfortdKit(SPM, UI 비의존, macOS `swift test`) + SwiftUI 앱 + 수동 최소 pbxproj(폴더 동기화 그룹).
- 콘텐츠 번들 파이프라인(`ios/scripts/bundle-content.mjs`): published 535건 + 축소 kb-index, 결정적 출력.
- 위키 3화면(축 카드 → 가나다 목록 → 문서 렌더러). swift-markdown 0.8.0 기반 블록 AST(표 지원 — 코퍼스 161건이 표 사용).
- 리뷰 fix: 스크린리더 낭독 정본(plain)의 HTML 태그 누출 3계층 차단(`<br/>` 인라인 / 블록 HTML / 언더스코어 의사 태그 `<page_header>` — CommonMark 태그명 문법상 HTML 미인식 사각지대), 문서 제목 이중 낭독 제거(코퍼스 98.3% 발생).

### M1 — 오프라인 검색·백링크·홈 완성 (#88)
- KBSearch: AND 토큰 매치·제목 가중 결정적 정렬·발췌. 검색·발췌 모두 파싱된 plain 정본(리뷰가 raw 마크다운 발췌 노이즈 44%·`\r` 문제를 잡아 구조 수정, 원본 대소문자 보존).
- 홈 `.searchable` submit 검색(3-state + 결과 수 단일 통지), 오늘의 위키(전 문서 순환 — day%count의 169건 영구 미노출 결함 수정), 문서 백링크 섹션.

### M2 — RAG 채팅 (#89)
- Kit Chat 계층: AI SDK v6 UIMessage SSE 파서 + ChatAPI(`URLSession.bytes.lines`). 계약은 prod 실캡처 fixture 정본, 미지 이벤트 무시.
- TabView(위키·채팅) + ChatStore(재진입 가드·세대 카운터·중단) + BlockRenderer 재사용 마크다운 렌더.
- 출처 카드 → 번들 위키 문서 즉시 push(네이티브 차별화). 첨부(이미지 JPEG 재인코딩·PDF, 1건·10MB, 웹 계약 미러) — 실호출 이미지 인식 end-to-end 실증.
- 리뷰 fix: 오류 문구의 대화 이력 서버 재전송 차단(isError), 첨부 비동기 로드 race·대용량 메인 스레드 로드 해소, 빈 중단 메시지 제거.

### M3 — OTP 인증·서버 Bearer·채팅 이력 (#90)
- **서버**: `getRequestAuth()` Bearer 이중 인증(dodo-planet 패턴 — 무효 토큰은 쿠키 폴백 없이 거부) + 신규 `GET /api/chat/threads/[id]`(이력 복원). 웹 쿠키 흐름 무회귀(`npm test` 364).
- **iOS**: supabase-swift 2.50(앱 타깃 전용) OTP 코드 로그인(매직링크 금지 영구 결정 준수), 대화 목록·복원·이어가기(threadId), 로그아웃 시 익명 휘발 복귀.
- 리뷰 fix(Critical, 실 DB 실측): `source_refs`가 `JSON.stringify`로 jsonb 문자열 이중 인코딩 저장 → 이력 복원 전면 실패였을 결함. RPC 객체 직접 바인딩 + 읽기 방어 정규화. production 잔존 행 0건(backfill 불요). 그 외 UUID 그룹핑 검증, Bearer 스킴 대소문자(RFC 7235), bootstrap 상태 잔류(scenePhase 재시도), 대화 선택 재진입 가드.

### M4 — 자료실·미디어·설정 5탭 완성 (#91)
- 카탈로그 번들 추출(library.json 4건·media.json 1건, 웹 TS 배열 정본·published 미러·env fail-fast).
- 자료실: PDF 다운로드(받기/중단/열기 3-state, slug별 세대 가드) + Caches 오프라인 캐시(퍼지 시 열기 시점 재검증·강등) + QuickLook + 삭제 액션.
- 미디어: 이미지 온라인 로드 + alt 정본 + 출처 문서 push. 설정: 계정·콘텐츠 기준일·앱 정체성 문구·웹 링크.
- `docs/IOS_DISTRIBUTION.md`: Developer Program 가입 이후 TestFlight·심사 절차 정본(가입 자체는 비용 하드 스톱).

### 문서·메모리
- spec/plan 6개 문서 커밋, CLAUDE.md(iOS 트랙 원칙·구조·명령), PROGRESS.md·CHANGELOG.md 신설, 세션 메모리 갱신.
