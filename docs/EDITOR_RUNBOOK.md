# 편집기 운영 런북

> 운영자(위원장·Claude Code)용. 감수자 사용 안내는 `docs/EDITOR_GUIDE.md`. 설계 정본은 `docs/superpowers/specs/2026-08-04-web-content-editor-design.md` §5·§11.

편집기의 "반영"은 GitHub Contents API로 master에 직접 커밋하는 것이다. 편집기가 알리는 성공은 **커밋 접수**까지이고, 그 뒤 Vercel 빌드는 독립적으로 실패할 수 있다. 실패하면 Vercel이 위원장 메일로 알린다. 빌드가 실패해도 production은 직전 성공 배포를 계속 서비스하므로 사이트가 내려가지는 않는다. 다만 그 뒤의 모든 반영이 배포되지 못하고 쌓인다.

## 1. Vercel 빌드 실패 메일을 받았을 때

1. **실패 커밋 확인**: 메일의 배포 링크에서 커밋 SHA와 빌드 로그 마지막 오류를 본다. 편집기 커밋은 메시지가 `content: ` 계열이고 작성자가 가명 식별자다.
2. **원인 분류**
   - `validate:content` 오류(frontmatter 형식·끊긴 위키링크·주소 규칙 위반 등): 편집 내용이 원인이다. 2단계로 간다.
   - 그 밖(의존성 설치 실패·Vercel 일시 장애·함수 수 제한): 편집과 무관하다. 대시보드에서 Redeploy를 한 번 시도하고, 반복되면 코드 쪽 문제로 따로 진단한다.
3. **되돌리기**: 편집 커밋을 되돌리는 새 커밋을 만든다. master ruleset이 force push를 막으므로 이력을 지우는 방법은 쓰지 않는다.

   ```bash
   git fetch origin && git switch -c revert/<짧은-sha> origin/master
   git revert --no-edit <실패-커밋-sha>
   npm run validate:content          # 되돌린 상태가 통과하는지 먼저 확인
   git push -u origin HEAD && gh pr create --fill
   ```

   PR 머지 뒤 새 배포가 성공하는지 확인한다. 편집 의도 자체는 살려야 하므로, 되돌린 내용과 오류 원인을 감수자에게 알리고 고친 편집을 다시 반영하게 한다.
4. **실패 커밋 뒤에 다른 편집이 쌓였을 때**: 실패 커밋 하나만 revert하면 된다. 뒤의 편집이 같은 파일을 고쳤으면 revert 충돌이 나므로, 그때는 충돌 부분을 손으로 풀어 오류만 고친 수정 커밋을 만든다.

## 2. 긴급 수정을 RAG에 바로 반영할 때

채팅 검색 인덱스(DB)는 야간 워크플로 `nightly-embed`(KST 03:00)가 `content/` 커밋 SHA를 보고 따라잡는다. 틀린 정보를 채팅이 계속 인용하고 있어 새벽까지 기다릴 수 없을 때만 즉시 갱신한다.

- ⚠ **`content/.embed-paused`가 있는 동안은 하지 않는다**(주소 체계 전환 중. CLAUDE.md 개발 명령 절). 이 기간의 긴급 수정은 웹 문서 페이지에만 반영되고 채팅 인덱스는 공개 재개(BACKLOG C9) 때 함께 갱신된다.
- 일시정지가 아니면 GitHub Actions에서 `nightly-embed`를 수동 실행(workflow_dispatch)하는 것이 1순위다. 성공하면 `LAST_EMBED_SHA`도 갱신돼 야간 실행과 어긋나지 않는다.
- 로컬에서 돌려야 하면 master 최신 상태에서 dry-run으로 차이를 먼저 본다.

  ```bash
  npm run kb:sync:dry-run && npm run kb:sync
  npm run kb:embed:dry-run && npm run kb:embed
  ```

  로컬 실행은 `LAST_EMBED_SHA`를 갱신하지 않으므로 다음 야간 실행이 같은 내용을 한 번 더 처리한다(결과는 같고 임베딩 비용만 한 번 더 든다).

## 3. 모든 편집이 "시스템 연결 문제"로 실패할 때

편집기 PAT(`webfortd-content-editor`, 만료 2027-08-05)가 만료됐거나 폐기된 경우다. 위원장 GitHub 계정에서 같은 권한(해당 저장소 contents:write 한정)으로 새로 발급해 Vercel 환경변수를 교체하고 재배포한다. 새 만료일을 캘린더에 등록한다.
