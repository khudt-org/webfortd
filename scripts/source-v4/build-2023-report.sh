#!/bin/bash
# 2023 최종보고서 2층 v4 (2026-08-28). 입력: data/source-hwp/ 스파이크 산출물(gitignore, hwp2hwpx 변환 HWPX)과 data/source-pdf/ 원본 PDF.
# 산출: data/source-hwp/_work/enriched.md → apply_corrections.py(정본 수정 목록.csv) → *_fused_v4_hwpxlocal+hwpxenrich+pdftotext.md
# 2023 최종보고서 2층 v4: hwpx-tomd 출력에 HWPX 메타(제목·취소선·파란색)와 PDF 쪽 번호를 입힌다.
set -e
cd "$(dirname "$0")/../../data/source-hwp/_work"
# 0) hwpx-tomd 변환(이미지 참조 포함) → 이미지 4종(배치 8회)을 대체텍스트/삭제로 치환
hwpx-tomd '../2023 최종보고서_hwp2hwpx변환.hwpx' --cell-br --merge-fill-vertical --prune-empty -q --image-dir img2 -o with_img.md
python3 - <<'PY'
import re
s=open('with_img.md',encoding='utf-8').read()
alts={'image4.png':'(이미지: 중부대학교 산학협력단 로고)',
      'image1.bmp':'(이미지: [그림 Ⅰ-1] 데이컴 기법 직무분석 분류표 예시. 세로축은 임무(Duties) 5개 행, 가로축은 작업(Tasks)으로, 행마다 5~8개의 빈 칸이 격자로 배열됨)',
      'image2.jpg':None,'image3.jpg':None}  # 2·3은 동일한 장식 배경(내용 없음) → 삭제
for k,v in alts.items():
    s=s.replace(f'![image]({k})', v or '')
assert '![image]' not in s
open('hwpxlocal_mergefill_cellbr.md','w',encoding='utf-8').write(s)
PY
python3 ~/.claude/skills/docparse/scripts/hwpx_enrich.py \
  --hwpx '../2023 최종보고서_hwp2hwpx변환.hwpx' \
  --md hwpxlocal_mergefill_cellbr.md \
  --pdf '../../source-pdf/2023 장애유형별 장애인교원 근무 지원 방안_최종보고서.pdf' \
  --heading "바탕글 사본6:1,머-우:1,개요 2:2,개요 3:3,개요 4:4,개요 5:5,개요 6:6" \
  --heading-regex '^\[부록 \d+-\s?\d+\]:3' \
  --part-title-style 간지제목 --part-title-level 2 \
  --drop-style '간지번호,장숫자,@1_제목' \
  --drop-regex '^:: 장애유형별 장애인교원 근무 지원 방안$|^P∙A∙R∙T$' \
  --drop-table-regex '^(장애유형별<br>장애인교원<br>근무 지원<br>방안|I|[ⅠⅡⅢⅣⅤ]|부록)$' \
  --mark-color 0000FF,0611F2 \
  --page-label-rule '1-12:목차 ,13-24:Ⅰ-' --page-comment-every --italic \
  --out enriched.md --report enrich_report.json

# 도식→글 구조·[부록 1-1] 제목 이동(앵커 삽입, 9/7 결정 1·2차 검수 2번)
python3 ../../../scripts/source-v4/apply-additions.py --spec ../../../scripts/source-v4/alts/research_additions.json --in enriched.md --out enriched_add.md
# 수정 목록 적용(드라이브 "6. 콘텐츠 편집/2. 마크다운 정본/정본 수정 목록.csv"와 동일본을 _work에 둔다)
OUT='2023 장애유형별 장애인교원 근무 지원 방안_최종보고서_fused_v4_hwpxlocal+hwpxenrich+pdftotext.md'
python3 ~/.claude/skills/docparse/scripts/apply_corrections.py --csv '정본 수정 목록.csv' --doc '2023 최종보고서' \
  --in enriched_add.md --out corrected.md --pdf '../../source-pdf/2023 장애유형별 장애인교원 근무 지원 방안_최종보고서.pdf'
# 문단 사이 빈 줄·PUA 글리프 정규화(4종 공통 마지막 단계)
python3 ../../../scripts/source-v4/normalize-paragraphs.py --in corrected.md --out "$OUT"
cp "$OUT" ../../source-md/
