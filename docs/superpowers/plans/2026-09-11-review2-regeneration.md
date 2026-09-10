# 2차 검수 반영 재생성 실행 계획 (2026-09-11)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 2차 검수 문제 보고 33건과 9/7 회의 결정 4건을 변환기·생성 규칙에 흡수해 2층 정본 4종과 3층 위키 문서를 재생성하고, 3차 검수(9/14~16)용 데이터를 자문 세션에 넘긴다.

**Architecture:** 결함은 계층별로 그 계층에서만 고친다. 엔진(hwpx-tomd)은 HWPX 구조 손실(자동번호·중첩표·병합 방향·도형 화살표), 2층 후처리(docparse `hwpx_enrich`·`scripts/source-v4/*`)는 쪽 주석·서식·문단 분리·판본 차이, 3층(`scripts/decompose-source.ts`)은 쪽 범위 메타·제외·서문 표시·분류만 담당한다. 문서별 손질은 스크립트에 하드코딩하지 않고 `정본 수정 목록.csv`·`alts/*_additions.json`에 데이터로 둔다.

**Tech Stack:** Python 3.12(hwpx-tomd·docparse 스크립트), tsx/node:test(3층), pytest(엔진).

**Spec:** 자문 드라이브 `1. 자문 메모/260907_위키문서_2차검수_결과분석.md` §3·§5, 회의록 `2. 회의/260907 제5차 전체 회의/260907_제5차_회의_전체_회의록.md` §6(결정 4건).

## Global Constraints

- 결정 1: 흐름도·도식은 표 대신 글 구조(절차=번호 목록, 직무 도식=3열 표, 조직도=들여쓴 목록). 옮긴 자리에 「원본의 도식을 글로 옮김」 한 줄.
- 결정 2: 병합 칸은 세로 병합만 반복, 가로 병합은 한 칸으로 합치고 나머지는 비움.
- 결정 3: 연구 절차 서술 문서 12건(`2023-research-1-3-1`·`1-3-2`·`app-2-x1~x4`·`app-3-x1~x4`·`4-3-1-1`·`4-3-1-2`)은 3층에서 생성하지 않는다(정본에는 남긴다).
- 결정 4: 제목 승격 10곳 유지, 조사지 8건 제목 앞에 「델파이 조사지: 」.
- 원본 오탈자는 정본 수정 목록 방식만(임의 교정 0건), 법령 최신화는 내년, 연구진 개인정보 삭제.
- 3층은 전부 `status: draft`(공개·임베딩 재개는 이번 범위 밖, BACKLOG C9).
- 이용자에게 보이는 곳에 작업 메모(「(서식 전사: …)」)를 남기지 않는다.
- 자작 repo(hwpx-tomd·docparse)는 수정 즉시 commit·push. PyPI 발행은 외부 배포라 하지 않는다.

---

### Task 1: hwpx-tomd 0.3.0 — 엔진 결함 5종

**Files:**
- Modify: `~/Mac-Projects/hwpx-tomd/src/hwpx_tomd/core.py` (`render_cell_lines`·`render_table_md`·`render_block_lines`·`convert`·`to_markdown`)
- Modify: `~/Mac-Projects/hwpx-tomd/src/hwpx_tomd/cli.py`, `_version.py`(0.3.0), `CHANGELOG.md`
- Test: `~/Mac-Projects/hwpx-tomd/tests/test_hwpx_tomd.py`

**규칙(전부 옵션 없이 기본 동작인 것과 옵션인 것을 구분):**
1. 기본: `<hp:ctrl><hp:autoNum num="3" numType="TABLE|PICTURE">` → `prefixChar + num + suffixChar` 텍스트(형식 DIGIT만, 그 밖은 num 그대로). FOOTNOTE는 종전대로 무시.
2. 기본: 1×1 표의 유일한 셀에 텍스트 없이 표 하나만 있으면 안쪽 표를 그 자리에 렌더(래퍼 표 승격).
3. 기본: 셀 안 중첩표(래퍼가 아닌 경우)는 셀에서 빼고 바깥 표 바로 뒤에 별도 표로 낸다(호이스팅). 셀 텍스트는 그대로.
4. 기본: 텍스트 없는 셀에 `<hp:line>`이 있고 `lineShape`의 head/tail 중 하나가 ARROW면 `orgSz` 가로>세로 → `→`, 아니면 `↓`.
5. 옵션 `merge_fill="vertical"`(CLI `--merge-fill-vertical`): rowSpan으로 덮인 칸만 채우고 colSpan 칸은 비운다. 기존 `--merge-fill`(전부)은 유지.
6. 옵션 `prune_empty=True`(CLI `--prune-empty`): 렌더 직전 그리드에서 모든 칸이 빈 행·열을 제거(호이스팅·승격 뒤, 셀 텍스트 기준).

- [x] 테스트 6종 추가(autoNum 캡션 번호, 래퍼 승격, 호이스팅, 화살표, vertical, prune) → 실패 확인 → 구현 → `pytest -q` 전부 통과
- [x] `_version.py` 0.3.0, CHANGELOG `[0.3.0] - 2026-09-11` Added/Changed
- [x] commit·push (`Engccer/hwpx-tomd`)

### Task 2: docparse `hwpx_enrich.py` — 쪽 주석 조밀화 + 이탤릭

**Files:**
- Modify: `~/Mac-Projects/docparse/scripts/hwpx_enrich.py` (`read_header`·`para_runs`·`annotate`·출력 조립)

**규칙:**
1. `--page-comment-every`(기본 off): 제목뿐 아니라 쪽이 바뀐 뒤 처음 만나는 **표 밖 비어 있지 않은 줄** 앞에도 쪽 주석을 낸다(표 블록 안·구분선·빈 줄 제외). 종전 동작(제목 앞만)은 플래그 없을 때 그대로.
2. `--italic`(기본 off): charPr에 `<hh:italic>`이 있는 run은 `*core*`. 최상위 문단(표 밖 줄)의 모든 run이 이탤릭이면 줄 전체를 `> *…*`로.

- [x] 구현 → 2023 보고서로 실측: 쪽 주석 수 134 → 300 이상, 부록 조사지 구간(pdf 427~530)에 주석 존재, `> *` 줄 100건 이상
- [x] docparse CHANGELOG 기록, commit·push

### Task 3: 2층 정본 4종 재빌드

**Files:**
- Create: `scripts/source-v4/normalize-paragraphs.py` — 표 밖 연속 문단 줄 사이에 빈 줄 삽입(직전 줄이 `<br>`·두 칸 공백으로 끝나거나 둘 다 목록 항목(`- `·`* `·`\d+\. `)이면 제외), PUA 매핑(`→→`, `\U000f003b→↓`, `\U000f0036→↓`, `→□`) 후 잔존 PUA 0건 assert
- Create: `scripts/source-v4/alts/research_additions.json` — [그림 Ⅰ-4]·[그림 Ⅰ-5] 흐름도 표 → 번호 목록/들여쓴 목록 + 「원본의 도식을 글로 옮김」, `## ◇ 부록1.` 바로 뒤에 `### [부록 1-1] …` 삽입 + 원래 자리 제목 제거
- Modify: `scripts/source-v4/build-2023-report.sh` — `--merge-fill-vertical --prune-empty`, `--italic --page-comment-every`, additions 적용, normalize 호출
- Modify: `scripts/source-v4/build-3docs.sh` — 같은 옵션, hr `HEADING_RX` 앞에 `^[1-4]\. (시·도교육청 장애인교원 업무|장애인교원 지원 관련 유관기관|교원단체|편의지원 유형별 관련 기관) :3;;^\d\) (인적지원|보조기기 지원 관련 기관|편의시설 지원 관련 기관|이동지원 관련 기관|웹접근성 지원 관련 기관)$:4`, normalize 호출
- Modify: `scripts/source-v4/alts/hr.json`·`school.json` — 「(서식 전사: …)」 첫 줄 삭제, 블록 안 서식 제목 앞에 실제 쪽 주석(PDF 바닥글 기준) 삽입
- Modify: `scripts/source-v4/alts/hr_additions.json` — `### 4) 기타 복무 관리 등` → `### 4) 기타 인사 관리 등` + `#### (1) 전직 임용 과정에서의 차별 금지`(교육전문직원 문단 이동) + `#### (2) 특별연수 대상자 선발 및 실시 과정에서의 차별 금지`(PDF 문단) + `(1) 휴직ㆍ복직`→`(3)`, `(2) 휴가ㆍ병가`→`(4)`
- Modify: `data/source-hwp/_work/정본 수정 목록.csv`(드라이브 동일본 함께) — 제목 승격 8행 수정문에 「델파이 조사지: 」 접두·원본 쪽을 표지 쪽(403·419·436·452 / 467·482·498·513)으로, 39번 Q&A 답변 단계 목록 행 추가(유형 「도식→글」)

- [x] normalize 스크립트 단위 확인(빈 줄 삽입·표 보존·PUA)
- [x] 4종 재빌드 → 게이트: `<표 X->`·`[그림 X-]` 0건 / `서식 전사` 0건 / PUA 0건 / apply_corrections 오류 0 / compare-md-pdf 회귀 없음 / 연속 문단 붙음 0건
- [x] 드라이브 `2. 마크다운 정본/` 4종 + `정본 수정 목록.csv` 갱신은 데이터 회신으로 자문 세션에 넘김(파일 복사만)

### Task 4: 3층 재생성

**Files:**
- Modify: `scripts/decompose-source.ts`
- Test: `tests/decompose-source.test.ts`

**규칙:**
1. 쪽 범위: `source_page_end` = 절 본문 안 마지막 쪽 주석 중 **그 뒤에 본문 텍스트가 있는 것**(다음 제목 직전 주석은 제외). `pdf` 접두 라벨은 `source_page`를 비우고 `source_page_pdf`만.
2. `EXCLUDED_SLUGS` 12건은 페이지·관련 페이지 목록에서 제외(경고 `excluded`).
3. 100자 미만 부모 서문은 첫 자식 앞에 `> 「부모 제목」 서문` 라벨 블록인용으로.
4. 장애유형 추론은 본문 앞 500자가 아니라 본문 전체 + 제목 경로.

- [x] 테스트 추가(쪽 범위 규칙·제외·서문 라벨) → 구현 → `npx tsx scripts/decompose-source.ts --reset` → `npm run validate:content` → `npm run sync:content` → `npm test`
- [x] 결과 대조: 2차 지적 33건 문서 각각 열어 해소 여부 판정(자동 검사 + 육안 표본)

### Task 5: 3차 검수용 데이터

- [x] `scripts/drive/export-wiki-snapshot.py --keep-as "이전 버전(v4 3층 367건 2차검수본, 2026-08-30)"` → 드라이브 `3. 위키 문서/`·`문서 목록.csv` 갱신
- [x] `docs/regression-2026-09-review50.md`: 2차 50건 × (주소·지적 요지·원인 계층·반영 내용·새 주소/제외) 표
- [x] 자문 세션 회신용 요약(건수·주소 변경·제외 12건·수정 목록 갱신) 작성 — 대화 응답으로 전달

### Task 6: 문서 분배·커밋

- [x] CHANGELOG 2026-09-11, PROGRESS 현재 상태, BACKLOG(C10·C11·C12 종결, C9 갱신), CLAUDE.md 함정 1줄(래퍼 표·쪽 주석 규칙)
- [x] `git commit -- <경로>` 단위 커밋, push
