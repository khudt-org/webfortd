# PATTERNS — 내부 상세 계약

에이전트 지침(CLAUDE.md, 공개 저장소 밖 로컬 파일)이 요지만 남기고 여기로 옮긴 상세다. 각 절 제목은 지침의 해당 항목 제목과 같다. 지침의 `→ PATTERNS`가 이 파일의 같은 제목 절을 가리킨다.

## 디렉터리 구조

```
webfortd/
├── src/app/
│   ├── (gov)/            # 보수 랜딩 (익명 접근)
│   │   └── legacy/       # 작년 PHP 사이트 대응 정적 안내 26페이지(6개 섹션, 구 URL 리다이렉트 13건은 next.config.ts)
│   ├── (wiki)/           # 위키·채팅 entry (익명 접근, 관리·편집만 역할 게이트)
│   │   ├── [...kb]/      # KB 문서 catch-all — 7축 + resources/{law,research} (PR #100, Hobby 함수 12개 제한 대응. 새 KB 라우트는 파일 라우트 신설 금지, 이 파서에 추가)
│   │   ├── page.tsx      # root /, WikiHero(옴니박스)·TodaysWiki·AxisBrowseEntries·RoleEntries·PopularPages
│   │   ├── chat/         # RAG 채팅 UI (+ 라이브 음성 오버레이, 받아쓰기)
│   │   ├── editor/       # 감수자용 git-backed 마크다운 편집기 (editor/admin 역할, admin/* 게이트와 분리)
│   │   ├── faq/          # FAQ 코너 (axis faq)
│   │   ├── admin/        # dashboard + AdminBar (admin 전용 layout 게이트)
│   │   ├── library/      # 자료실 (PDF 4건, Supabase Storage `library` 버킷)
│   │   ├── media/        # 미디어 자료실 (raster baseline 1건)
│   │   └── about·privacy·terms·sitemap
│   ├── api/
│   │   ├── chat/         # POST /api/chat — RAG Route Handler (nodejs runtime, maxDuration 60) + threads/[id]
│   │   ├── transcribe/   # 웹 받아쓰기(Deepgram)
│   │   ├── voice/        # 라이브 음성 session·execute (Gemini Live 직접 키)
│   │   ├── admin/preview # Draft Mode 토글
│   │   └── cron/cleanup-chats
│   └── auth/             # OTP 콜백(매직링크는 fallback) + /auth/error
├── content/              # 마크다운 정본 (axis 8: agreements·disability-types·domains·faq·policies·regions·uncategorized + resources/law. resources/research는 라우트만 있고 콘텐츠 0건). `_archive-v3/`는 v3 이미지 매핑 보존본(읽기 전용), `.embed-paused`는 야간 sync·embed 일시정지 마커
├── data/                 # 1·2층 원본·정본 (source-hwp·source-pdf·source-md. v4 정본 4종 + v3 보존본, 3층 분해의 입력)
├── scripts/              # 빌드·sync·embed·bootstrap CLI (tsx). decompose-source(3층 분해)·slug-migration/apply-slug-migration(주소 대응표)
│   ├── source-v4/        # 2층 v4 빌드·원본 PDF 대조·하이브리드 후처리(sh·python)
│   ├── drive/            # 자문 드라이브 `3. 위키 문서/` 스냅샷·`문서 목록.csv` 재생성(python, `--keep-as`로 구 스냅샷 보존)
│   └── lib/              # 공용 헬퍼 (chunker·gemini-embed·env-loader·error-format·outline 번호 파서·image-key 등)
├── src/lib/rag/          # retrieval / embed-query / prompt-builder / types
├── src/lib/editor/       # 편집기 서버 코어(edit-core, stateless 프로토콜) · src/lib/github/ Contents API 래퍼
├── src/lib/supabase/     # admin·server·middleware·client·request-auth (`@supabase/ssr`)
├── supabase/migrations/  # 0001~0013 (schema·RLS·RAG RPCs·chat history·storage bucket·admin role/preview)
├── tests/                # node:test (unit) + migrations (integration) + vitest (components) + a11y (playwright)
├── docs/                 # KB_ARCHITECTURE·DIRECTION_2026·BACKLOG·EDITOR_GUIDE·VERCEL_*·M3_SMOKE·VOICEOVER·IOS_DISTRIBUTION 등
├── ios/                  # iOS 네이티브 앱 (5탭 + 홀드 받아쓰기, 상태는 PROGRESS.md)
│   ├── WebfortdKit/      # SPM 패키지(UI 비의존, macOS swift test 가능): KB·검색·채팅·카탈로그
│   ├── Webfortd/         # SwiftUI 앱 타깃(5탭: 위키·채팅·자료실·미디어·설정)
│   ├── Webfortd.xcodeproj # 수동 최소 pbxproj(objectVersion 77 폴더 동기화 — 파일 추가 시 무변경)
│   ├── deploy-device.sh  # 실기기 배포 CLI(gildongmu·dodo-planet·dodo-games·moment·webfortd 5곳 동일본 — 수정 시 모두 반영)
│   └── scripts/bundle-content.mjs # 콘텐츠 번들 파이프라인(published만, 결정적)
└── public/library/       # 빈 디렉터리(.gitkeep) — PDF는 Supabase Storage(0012 버킷, `npm run library:upload`)
```

자료실 PDF는 repo에 두지 않는다(PR #51에서 Supabase Storage `library` 버킷으로 이관, `src/lib/library-catalog.ts` `STORAGE_BASE`). 종전 `outputFileTracingExcludes` 우회는 그때 제거됐다.

## 영구 결정

날짜는 결정일이다. 행의 PR·SHA·경위는 결정 당시 기록이고, 지금도 지켜야 하는 규칙은 각 행의 본문이다.

### "마크다운이 정본, DB는 파생 인덱스"

| 일자 | 결정 |
|------|------|
| 2026-05-22 | **"마크다운이 정본, DB는 파생 인덱스"** — PR #19(squash `cb8597f`) 0004 마이그레이션으로 editor write 정책 DROP. DB write = service_role(sync 스크립트)만. editor_roles 테이블·SELECT·status 트리거는 Phase 4 모더레이션 권한 재사용 대비 보존 |

### 앱 정체성 + 채팅 역할

| 일자 | 결정 |
|------|------|
| 2026-05-23 | **앱 정체성 + 채팅 역할** — 앱 = "장애인교원 교육전념 여건 지원 사업" 자산(장교조 제작이지만 사업 자산). 채팅 = "대한민국 장애인교원 제도·정책 안내"(장교조 정책 안내 X). 톤 = 다정·명료. 시나리오 A(중부대 이관)/B(장교조 직접 운영) 모두 동일. §앱 정체성과 채팅의 역할 본문이 단일 기준점. 변경 시 위원장 명시 결정 필요 |

### dry-run = explicit `--dry-run` flag 강제

| 일자 | 결정 |
|------|------|
| 2026-05-23 | **dry-run = explicit `--dry-run` flag 강제** — PR #17 C1 사고(positional 만으로 production 8개 페이지 의도 외 published 전환). `kb:publish`/`kb:embed` 모두 적용 |

### 위키 브랜드 = "장애인교원 위키"

| 일자 | 결정 |
|------|------|
| 2026-05-24 | **위키 브랜드 = "장애인교원 위키"** — "장교조 위키" 폐기. 근거: 앱 정체성이 사업 자산이므로 위키 브랜드도 사업 정체성을 따른다. 단체협약·정책 본문 인용 안의 "장교조"는 단체 고유명사로 그대로 유지 |

### Admin/일반 화면 토글 패러다임 = Draft Mode + AdminBar

| 일자 | 결정 |
|------|------|
| 2026-05-29 | **Admin/일반 화면 토글 패러다임 = Draft Mode + AdminBar** — PR #63 Phase A. ID/password 인증 미도입(매직링크 그대로). admin 권한은 `editor_roles.role='admin'`(0013 마이그레이션)으로 부여하고 위원장 이메일(`engccer@gmail.com`) seed. URL 파라미터·서브도메인 패턴 도입 금지 — Next.js Draft Mode + 헤더 우측 AdminBar 토글로 통일. **DB 직접 편집 UI는 영구 원칙 위배로 금지**: DB write = service_role(sync 스크립트)만. 편집은 마크다운 정본을 통해서만 가능. ⚠ 당시 "Phase C(Phase 5+) 검토"로 미뤄 둔 git-backed 어댑터는 2026-08-04 결정으로 구현 완료(아래 2026-08-04 행이 정본). 메모리: `project_admin_preview_and_edit_policy.md` |

### Publish = 마크다운 정본 수정 (DB UPDATE 폐기)

| 일자 | 결정 |
|------|------|
| 2026-05-29 | **Publish = 마크다운 정본 수정 (DB UPDATE 폐기)** — PR #66 Phase B M1. sync-content-to-db.ts가 frontmatter status를 DB에 반영(B2, 기존 D1 'draft 강제' 폐기). published 전환은 마크다운 frontmatter 수정(`kb:bootstrap` 또는 직접 편집) → `kb:sync`로 일원화. 기존 `kb:publish`(DB UPDATE 방식)는 deprecated — DB만 고치면 다음 sync에서 frontmatter로 복귀. 근거: "마크다운이 정본" 영구 원칙 완전 정합 + Phase A 대시보드가 드러낸 정합 불일치(마크다운 published 8 vs DB published 1) 해소 |

### 로그인 = 6자리(실측 8자리) 인증코드 방식

| 일자 | 결정 |
|------|------|
| 2026-06-04 | **로그인 = 6자리(실측 8자리) 인증코드 방식** — PR #77(squash `9250784`). 매직링크 단독 방식 폐기. `AuthContext` `requestOtp`+`verifyOtp(type:'email')`, `AuthModal` 2단계(이메일→코드). 매직링크는 이메일 fallback으로만 유지(템플릿에 `{{ .ConfirmationURL }}` 잔존). 근거: 매직링크가 다른 브라우저 컨텍스트(모바일 메일앱 인앱 브라우저)에서 열리면 세션 쿠키가 다른 jar에 박혀 "재방문 시 매번 재로그인" 발생 — 코드 검증은 PKCE verifier 불필요라 코드 입력한 *그 브라우저*에 세션 생성으로 원천 차단 + 스크린리더 접근성 향상. **매직링크 단독으로 되돌리지 말 것.** 진단: 코드·설정·refresh·도메인 전 계층 실측 무결(표준 경로 세션 유지 증명) → 원인은 컨텍스트 분리뿐. 메모리: project_phase_status.md |

### iOS 네이티브 트랙 신설 + 아키텍처 원칙

| 일자 | 결정 |
|------|------|
| 2026-07-10 | **iOS 네이티브 트랙 신설 + 아키텍처 원칙** — spec 정본 `docs/superpowers/specs/2026-07-10-ios-native-app-design.md`. ① 순수 API 클라이언트 + 오프라인 콘텐츠 번들("마크다운이 정본" 정합, DB 직접 접근은 인증·이력뿐) ② WebfortdKit(SPM)은 UIKit/SwiftUI/supabase 무의존(토큰은 클로저 주입) ③ iOS 26 최소, 의존성은 swift-markdown + supabase-swift(앱 타깃)만 ④ 서버 Bearer 이중 인증(`src/lib/supabase/request-auth.ts`) — 무효 토큰은 쿠키 폴백 금지 ⑤ **라이브 음성은 M5 보류**(dodo-planet Live 오류 수정·검증 후 이식, 위원장 지시) ⑥ TestFlight 배포 전제·Developer Program 가입은 비용 하드 스톱(절차 정본 `docs/IOS_DISTRIBUTION.md`). 진행 상태는 PROGRESS.md |

### 감수자용 git-backed 웹 마크다운 편집기 도입

| 일자 | 결정 |
|------|------|
| 2026-08-04 | **감수자용 git-backed 웹 마크다운 편집기 도입** (2026-05-29 "편집 UI 보류" 방침 대체) — PR #113(`a28b314`). 도입 근거는 기능 확장이 아니라 **편집자 승계 가능성**: 중부대 연구보조원 등 비개발자가 저장소를 다루지 못하므로, 편집자가 누구로 바뀌어도 콘텐츠를 확인·수정할 수 있어야 한다는 위원장 결정. **영구 원칙("마크다운이 정본") 번복이 아니다** — 편집 대상이 DB가 아니라 GitHub의 마크다운 파일이라(Contents API 왕복) 원칙 안에서의 해소다. **위원장 명시 설계 제약(임의 확장 금지)**: ①WYSIWYG 불필요, 에디터↔프리뷰 토글이면 충분 ②실시간 라이브 변환 금지, 수동 "반영" 버튼 ③주요 이벤트 단축키 제어 ④**웹앱 전용, iOS 앱에는 붙이지 않음**. 라우트는 `/admin/editor`가 아니라 **`(wiki)/editor`**(admin이 아니어도 editor면 편집 가능해야 하므로 되돌리지 말 것). DB 파생 인덱스는 야간 워크플로가 `content/` SHA 게이트로 따라잡는다. 상세: CHANGELOG 2026-08-04, spec `docs/superpowers/specs/2026-08-04-web-content-editor-design.md`, 메모리 `project_admin_preview_and_edit_policy.md` |
