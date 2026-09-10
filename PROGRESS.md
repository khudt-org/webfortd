# PROGRESS

> 현재 상태·다음 단계·미결 결정만 담는다(자율성 헌장 §문서화 규율). 항구 원칙은 CLAUDE.md, 날짜별 이력은 CHANGELOG.md, 열린 항목·판정 대기·이월은 docs/BACKLOG.md, PR 단위 상세는 git log.

## 현재 상태 (2026-09-11)

- **색상 대비 AA 충족(2026-09-05)**: 라이트 `--primary`·`--sidebar-primary`(#306cff → #215bf1)·`--muted-foreground`·`--destructive`, 다크 `--primary-foreground`(near-white → near-black) 조정으로 토큰·알파 조합 전 조합이 4.5:1 이상. 회귀는 `tests/lib/color-contrast.test.ts`가 계산으로 차단(브라우저 불필요).
- **홈 검색 표면 단일화(2026-09-04)**: 홈은 히어로 **옴니박스** 단독(입력창 하나 + `[AI에게 질문]`, Cmd+Enter). 헤더 검색창은 홈에서만 숨고 그 밖 경로에서는 유지, 단축키 타깃 id는 `search-input` 하나로 통합. 질문은 `/chat?q=` → mount 시 1회 자동 전송 + 주소 정리. VoiceOver 실사용 합격(2026-09-05: 낭독 순서·Cmd+Enter·도착 커서·완료 커서 4항목).
- **웹**: Phase 1~3·A·B·7 + 위키 리뉴얼(§Phase 진행 요약의 "Phase 4") 완료. 개정 Phase 4(소셜 피드)는 미착수. production https://webfortd.vercel.app (engccer Hobby 임시 운영, KHUDT Pro는 결제 락 — 복귀는 §미결 결정). Hobby 함수 12개 제한 아래 함수 9개로 배포 정상(2026-07-17 `[...kb]` catch-all 통합 이후).
- **2층 마크다운 정본 v4 4종 완비(2026-08-28)**: `data/source-md/*_fused_v4_*.md`(v3는 `data/source-md/v3/` 보존).
- **2차 검수 반영 재생성 완료(2026-09-11)**: 엔진(hwpx-tomd 0.3.0)·2층 4종·3층을 9/7 결정 4건대로 재생성. 4종 파생 **358건**(research 84·hr 74·jbu 69·staff 131. 결정 3 제외 12건), outline 주소 체계(`docs/DECOMPOSE_V2_DESIGN.md`), 건별 판정 `docs/regression-2026-09-review50.md`, 주소 변경 `docs/slug-migration-2026-09.csv`(8/29 대응표 `docs/slug-migration-2026-08.csv`). 드라이브 `2. 마크다운 정본/`·`3. 위키 문서/` 갱신 완료. **전부 draft** — 3차 검수(9/14~16, 담당 동일) 결과를 반영한 뒤 9/21 수행사 전달. webfortd 공개 여부는 별건 판정(§미결 결정, BACKLOG C9).
- **콘텐츠 baseline**: `content/` 417건 = published 50(단체협약 49 + resources 1) + draft 358(4종) + draft 9(FAQ). 콘텐츠 보유 축 8개(`CONTENT_AXES` 9개 중 stories 0건). RAG 청크는 DB 기준 2775(v3, 재임베딩 전).
- **웹 콘텐츠 편집기 운영 중**(2026-08-04, PR #113): `(wiki)/editor`, GitHub PAT·Actions Secrets 등록 완료, 야간 sync+embed 워크플로(`nightly-embed.yml`, `LAST_EMBED_SHA` 게이트) 가동, production 실호출 통과. 잔여는 운영 잔무·VoiceOver 실측(BACKLOG §A8·§B).
- **iOS 네이티브 v1**: 5탭(위키·채팅·자료실·미디어·설정) + 홀드 받아쓰기(채팅·위키 검색), 오프라인 위키 535건(v3 시점 번들. `bundle-content.mjs`가 published만 담는데 현재 published는 50건이라 C9 일괄 공개 전 재번들 금지), OTP 인증·이력. Kit 테스트 49 green. iPhone 13 Pro 실기기 배포 상태(`ios/deploy-device.sh`), 서명 팀 72JQ7VD4V5(Apple Developer Program 유료, 2026-07-12 승인). TestFlight 미제출(준비물 BACKLOG §D). 정본 spec `docs/superpowers/specs/2026-07-10-ios-native-app-design.md`, 배포 절차 `docs/IOS_DISTRIBUTION.md`.
- **테스트 baseline**(2026-09-11): unit 419 pass + 1 skip(`npm test` 기준 tests 420) / component 211 / **a11y 40 전부 pass**(색상 대비 위반 0건 — 토큰 조정 + `tests/lib/color-contrast.test.ts` 전수 매트릭스 게이트, axe 기준선에서 color-contrast 키 제거) / integration RLS 5(실 DB; 기존 migrations 8건은 드리프트 실패 중 — BACKLOG E5).
- **공식 사업 트랙**(2026-07-14): 과업요청서 최종본 중부대 전달 완료, 수행사 선정·계약은 중부대 주관. webfortd는 독립 레퍼런스 트랙(`docs/DIRECTION_2026.md` §11).
- **서버 공용 자산**: Bearer 이중 인증(`src/lib/supabase/request-auth.ts`) + `GET /api/chat/threads/[id]`(iOS·웹 이력 복원 공용).

## 다음 단계

1. **위원장 실측 게이트 일괄**(BACKLOG §A): iOS 실기기(비행기 모드·VoiceOver 로터/표·OTP 플로), 편집기 VoiceOver 편집 흐름, 웹 hero 검색·라이브 음성 실 마이크, 애니메이션 feel check.
2. 게이트 통과 후 iOS TestFlight: 판매자명 결정(§미결 결정) → App Store Connect 앱 레코드 → Archive → 내부 테스터(`docs/IOS_DISTRIBUTION.md` §3). 준비물은 BACKLOG §D.
3. 편집기 운영 잔무(BACKLOG §B): 연구보조원 `editor_roles` seed(이메일 수령 시), 안내 전달, PAT 만료 캘린더, 런북.
4. **3차 검수 → 수행사 전달**: 3차 검수(9/14(월)~16(수), 2차 문제 보고 33건 재확인 + 새 무작위 17건)는 자문 세션이 안내문·시트를 맡고, 이 저장소는 결과 반영(건별 수정)만 한다. 9/21(월) 원본 PDF·마크다운 정본·위키 문서 3계층 전달. 그 뒤 webfortd 공개 판정(BACKLOG C9)은 별건.

## 미결 결정 (위원장)

| 항목 | 내용 | 근거 문서 |
|------|------|-----------|
| KHUDT Pro 재활성(1안) 실행 시점 | 배포는 2안(PR #100)으로 정상. Pro 복귀는 사업 자산 명의 정합 목적으로 유효한 옵션 — Billing에 Reactivate Pro 버튼 활성 + MasterCard •••• 2970 등록 확인(2026-07-17). 월 $20 결제라 위원장 실행 몫(5~15분) | `docs/VERCEL_RECOVERY_PLAN.md` |
| App Store 판매자명 | 개인(김헌용, 현재 가입 상태 그대로) vs 조직(장교조 명의, D-U-N-S 필요). Developer Program 가입·비용 게이트는 2026-07-12 해소됨 | `docs/IOS_DISTRIBUTION.md` §1 |
| 앱 아이콘 디자인 방향 | 1024×1024 미제작. "장애인교원 위키" 정체성을 담은 신규 제작 필요 | `docs/IOS_DISTRIBUTION.md` §2 |
| M5 라이브 음성 재개 시점 | dodo-planet Live 오류 수정·검증 후 이식(2026-07-10 지시) | iOS spec §4.4 |
| 4종 358건 공개 여부·시점 | 2차 검수 반영 재생성 완료(9/11). 3차 검수(9/14~16)·수행사 전달(9/21) 뒤 webfortd 공개는 **별건 판정**(본 사업과 분리된 트랙) — 공개로 판정되면 절차·선행 조건 3건은 BACKLOG C9 | `docs/BACKLOG.md` C9 |
| LICENSE·저작권 표기 | 공개 저장소이자 사업 자산이라 저작권 주체·라이선스는 위원장 결정 | BACKLOG F1 |
