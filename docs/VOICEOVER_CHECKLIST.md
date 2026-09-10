# 위원장 VoiceOver 검수 체크리스트

> **목적**: 자동 검증(axe-core)이 못 잡는 *실제 사용 경험*을 위원장이 iPhone Safari + VoiceOver로 10분 동안 점검.
> **시점**: Phase 4 M3 PR B 머지 + production deploy 검증 직후.
> **결과 보관**: 자유 형식 메모 → `~/Library/CloudStorage/GoogleDrive-khudt@khudt.net/Shared drives/장교조 공유 드라이브/17. 교육부 및 교육청 등 정책연구/2026년 교육부 정책연구/[과제 5[ 정보 지원 웹페이지 개발 및 운영/`

---

## 사전 준비

- iPhone Safari, VoiceOver 활성 (설정 → 손쉬운 사용 → VoiceOver, 트리플 클릭으로 토글)
- 헤드폰 권장 (스피커는 주변 소음 영향)
- 시작 URL: https://webfortd.vercel.app/

---

## 시간 배분 (총 10분)

| Step | 내용 | 분 |
|------|------|----|
| 1 | Skip-link + 헤더 nav | 1분 |
| 2 | EntryToggle (위키↔이전 버전 전환) | 1분 |
| 3 | 위키 entry hero + RoleEntries 5장 | 1분 |
| 4 | /library 카드 4장 + 검색 + atomic footer | 2분 |
| 5 | /media 카드 + 상세 | 1분 |
| 6 | /chat 입력 + 추천 + 응답 + sourceRefs 카드 판독 | 2분 |
| 7 | 매직링크 로그인 흐름 + 모바일 회전 | 2분 |

---

## 8 step 상세

### 1. Skip-link + 헤더 nav (1분)
- `/` 진입 → 첫 Tab 한 번 누름 → "본문으로 이동" 링크 음성 안내 확인
- Enter → main-content 영역으로 점프 (header 건너뜀)
- Tab/Shift+Tab으로 헤더 nav 항목 순회 (위키 / 채팅 / 자료실 / 미디어 / 로그인 등)
- 현재 페이지는 aria-current 음성 "현재 페이지" 안내

### 2. EntryToggle — 위키 ↔ 이전 버전 전환 (1분)
- 위키 entry에서 EntryToggle "이전 버전" 버튼 음성 안내 확인 ("이전 버전 페이지로 이동" 등)
- Enter → `/legacy/about` 페이지 진입 → 음성 흐름 자연스러움
- "위키" 버튼 음성 → Enter → 위키 entry 복귀

### 3. 위키 entry hero + RoleEntries 5장 (1분)
- hero 제목 음성 안내 ("장애인교원 위키" 또는 hero 카피)
- RoleEntries 5장 카드 (교사 / 관리자 / 사무 / 정책 / 학부모) 각각 *역할 + 한 줄 설명* 음성 안내
- placeholder 2장(정책·학부모)은 "준비 중" 음성 안내

### 4. /library 카드 4장 + 검색 + atomic footer (2분)
- `/library` 진입 → 카드 4장 음성 안내 (제목 + 연도 + 기관)
- 검색 input → "자료실 검색" placeholder 음성
- "인사관리" 입력 → 결과 1건 음성
- `/library/2023-hr-guide` 진입 → 상세 정보 음성 + "원본 자료 다운로드" 링크 도달 → Enter로 Storage URL PDF 다운로드 시작 음성
- atomic 페이지 footer 확인: `/agreements/2020-ca-1-2` 같은 atomic 페이지에서 `KbSourceFooter`의 "원본 자료" 링크 음성 안내 (source_origin 매핑 시)

### 5. /media 카드 + 상세 (1분)
- `/media` 진입 → 미디어 카드 음성 안내 (Phase 1.5b 검증 raster 1건)
- 상세 페이지 진입 → 이미지 alt 음성 안내 정합

### 6. /chat 입력 + 추천 + 응답 + sourceRefs 카드 판독 (2분)
- `/chat` 진입 → 입력창 focus 음성 "메시지 입력"
- 추천 버튼 3개 Tab으로 도달 → Enter (예: "장애인교원 편의지원 신청 방법")
- 응답 카드 aria-live로 실시간 음성 안내 ("응답 중..." → 텍스트)
- **sourceRefs 출처 카드 판독**: Tab으로 출처 카드 도달 → 각 카드의 (a) 출처 제목 (b) slug (c) similarity score를 음성으로 듣고 *어떤 정책 문서인지 파악 가능한지* 확인. 못 알아들으면 → Critical.

### 7. 매직링크 로그인 흐름 (2분 중 1분)
- 헤더 "로그인" 버튼 Tab 도달 → Enter
- AuthModal 입력창 음성 "이메일 입력" → 이메일 입력 → "매직링크 발송" 버튼 Enter
- 성공 메시지 음성 안내 ("이메일을 확인하세요")
- (실제 메일 클릭은 별도 — 이번 검수에서는 흐름까지만)

### 8. 모바일 회전 (2분 중 1분)
- 세로 모드에서 위 7단계 흐름 자연스러움 확인
- iPhone 회전 → 가로 모드 → 레이아웃 깨짐 X, 음성 흐름 유지

---

## 발견 시 처리

### Critical (사용 불가 수준) — M3 머지 차단, 즉시 별도 PR fix
예시:
- 키보드만으로 도달 불가능한 인터랙티브 요소 (마우스 hover 필수)
- VoiceOver가 핵심 버튼/링크 이름을 읽지 않음 (`aria-label` 누락)
- 채팅 응답이 `aria-live`로 안 읽힘
- PDF 다운로드 링크가 *작동 X* 또는 *Storage URL이 깨짐*
- 매직링크 발송 버튼 비활성 (Enter 무반응)
- 회전 시 콘텐츠 가로 스크롤 발생 (CLAUDE.md §접근성: 가로 스크롤 금지)

### Moderate (사용 가능하나 불편) — 별도 issue 또는 Phase 5 큐
예시:
- focus 순서가 시각 순서와 다름 (사용 가능하나 혼란)
- sourceRefs 카드 score 음성이 "0.85" 같은 raw 숫자 (사람 친화 표현 부족)
- 헤더 nav 메뉴 항목명이 모호 (예: "위키"보다 "장애인교원 위키"가 명확)
- placeholder 카드 "준비 중" 음성이 너무 짧아 무엇이 준비 중인지 모름

### Nit (취향 수준) — 무시
예시:
- 버튼 음성에 자잘한 띄어쓰기 차이
- 페이지 진입 시 음성 시작 0.5초 지연

발견 사항은 자문 디렉터리에 자유 형식 기록.

---

## 종료

7 step 모두 통과(Critical 0건) → Phase 4 M3 완료 → Phase 4 종료 선언.

Critical 1건 이상 → 즉시 별도 PR fix → 재검수 후 종료.
