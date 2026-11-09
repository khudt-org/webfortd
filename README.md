# webfortd: 장애인교원 교육전념 여건 지원 플랫폼

장애인교원·예비교사·학부모·정책 담당자가 대한민국 장애인교원 관련 제도·법령·단체협약·연구자료를 한곳에서 찾고 물어볼 수 있는 웹앱입니다. 함께하는장애인교원노동조합(장교조)이 만드는 **시범 모델**로, 교육부·중부대 "장애인교원 교육전념 여건 지원 웹사이트 구축 사업"의 레퍼런스입니다.

- 운영 주소: https://webfortd.vercel.app/
- 저장소: https://github.com/khudt-org/webfortd

## 무엇이 있나

- **장애인교원 위키**: 마크다운 정본(`content/`, 417건 중 현재 공개 50건, 나머지는 검수 뒤 공개 예정)에서 빌드되는 정적 위키. 장애유형·영역·지역·정책·법령·단체협약·자료실 축 + FAQ, 위키링크·백링크·검색.
- **채팅**: 위키 문서를 검색해 출처와 함께 답하는 RAG 채팅(텍스트·음성 받아쓰기·첨부), 로그인 시 대화 이력 저장, 라이브 음성 대화.
- **자료실·미디어**: 원문 PDF와 카드뉴스 등 시각 자료(대체 텍스트·캡션 본문 게시).
- **감수자용 웹 편집기**(`/editor`): 편집 권한자가 위키 문서 마크다운을 화면에서 고치면 GitHub 커밋으로 반영.
- **iOS 앱**(`ios/`): 위키(오프라인·검색)·채팅·자료실·미디어·설정 5탭 네이티브 앱(TestFlight 준비 단계).

접근성(WCAG 2.2 AA, 스크린 리더 실사용 기준)이 협상 불가 원칙입니다.

## 실행

요구: Node.js 22 이상, npm.

```bash
git clone https://github.com/khudt-org/webfortd.git
cd webfortd
npm install
cp .env.example .env.local   # 값 채우기(주석 참고)
npm run dev                  # http://localhost:3000
```

| 명령 | 설명 |
|------|------|
| `npm run dev` | 개발 서버 |
| `npm run build` | 콘텐츠 검증·인덱스 생성 + 프로덕션 빌드 + 함수 번들 추적 범위 검사 |
| `npm test` | 단위 테스트(node:test) |
| `npm run test:components` | 컴포넌트 테스트(vitest) |
| `npm run test:a11y` | Playwright + axe 접근성 테스트 |
| `npm run kb:sync` / `npm run kb:embed` | 마크다운 → Supabase 인덱스·임베딩(`.env.local` 필요, `--dry-run` 변형 있음) |

iOS 앱은 `node ios/scripts/bundle-content.mjs`로 콘텐츠를 번들한 뒤 `ios/Webfortd.xcodeproj`를 빌드합니다. 번들에는 공개 문서만 담기므로 일괄 공개 전까지 새 클론의 오프라인 위키는 50건입니다.

## 문서

- `docs/DIRECTION_2026.md`: 사업 맥락과 개발 방향(레퍼런스 트랙 위상)
- `PROGRESS.md`: 현재 상태·다음 단계·미결 결정
- `CHANGELOG.md`: 날짜별 변경 이력
- `docs/BACKLOG.md`: 열린 항목·판정 대기
- `docs/KB_ARCHITECTURE.md`: 콘텐츠 정본·빌드 파이프라인 설계
- `docs/CONTENT_CONVENTIONS.md`: 마크다운 작성 규약
- `docs/EDITOR_GUIDE.md`: 감수자용 웹 편집기 안내
- `docs/IOS_DISTRIBUTION.md`: iOS 배포 절차

## 라이선스

라이선스는 아직 정해지지 않았습니다(장교조 결정 사항). 문의는 GitHub 이슈로 남겨 주세요.
