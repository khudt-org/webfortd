#!/bin/bash
# 인쇄 책자 3종 2층 v4 (2026-08-28, 하이브리드: 구조는 HWP, 내용은 PDF 대조).
# 사용: bash scripts/source-v4/build-3docs.sh <staff|school|hr>
# 입력: data/source-hwp/3종/<key>.hwpx (hwp2hwpx 패치 JAR -Xmx6g 변환본, gitignore) + data/source-pdf/ 원본 PDF
# 흐름: hwpx-tomd --cell-br --merge-fill → hwpx_enrich(제목·쪽 번호) → postprocess-hybrid(간지·이미지·명단·표기)
#       → apply_corrections(정본 수정 목록.csv) → data/source-md/*_fused_v4_hwpxlocal+hwpxenrich+pdftotext.md
set -eo pipefail
KEY="${1:?staff|school|hr}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
W="$ROOT/data/source-hwp/3종/_work"; PDFD="$ROOT/data/source-pdf"; S="$HOME/.claude/skills/docparse/scripts"
cd "$W"
ROMAN_H1='^[ⅠⅡⅢⅣⅤⅥ]\. :1'
case "$KEY" in
  staff)
    PDF="$PDFD/내지_장애인교원_지원인력_직무_수행_안내자료인쇄용_156P_수정.pdf"
    OUT='내지_장애인교원_지원인력_직무_수행_안내자료인쇄용_156P_수정_fused_v4_hwpxlocal+hwpxenrich+pdftotext.md'
    DOC='2024 지원인력 직무 수행 안내자료'
    HEADING_RX="$ROMAN_H1;;^<부록\d+> :2;;^[가-힣]\. :3;;^\d{1,2}\) :4;;^\(\d{1,2}\) :5;;^□ :+1"
    DROP_RX='^P∙A∙R∙T$|^:: 장애인교원 지원인력 직무 .*안내자료$'
    EXTRA_POST='' ;;
  school)
    PDF="$PDFD/241210_책자_내지_중부대학교_장애인교원_근무지원_안내자료_V4.pdf"
    OUT='241210_책자_내지_중부대학교_장애인교원_근무지원_안내자료_V4_fused_v4_hwpxlocal+hwpxenrich+pdftotext.md'
    DOC='2024 단위학교 근무지원 안내자료'
    HEADING_RX="$ROMAN_H1;;^\[부록\s?\d+\] :2;;^\[안내서 개요\]$:1;;^[가-힣]\. :3;;^\d{1,2}\) :4;;^[가-힣]\) :5;;^\(\d{1,2}\) :6;;^□ :+1"
    DROP_RX='^P∙A∙R∙T$|^:: .*안내자료(\(안\))?$'
    EXTRA_POST='--drop-section-regex=^#\s\[안내서\s개요\]$' ;;
  hr)
    PDF="$PDFD/2023 장애인교원 인사관리 안내서.pdf"
    OUT='2023 장애인교원 인사관리안내서(단면)_fused_v4_hwpxlocal+hwpxenrich+pdftotext.md'
    DOC='2023 인사관리 안내서'
    # 부록3의 「1.~4.」 평문 절을 3수준으로 올리고 그 아래 「1)~5)」를 4수준으로(2차 검수 28번: 상위 제목 누락)
    HEADING_RX="$ROMAN_H1;;^<부록\d+> :2;;^\[안내서 개요\]$:1;;^[1-4]\. (시·도교육청 장애인교원 업무|장애인교원 지원 관련 유관기관|교원단체|편의지원 유형별 관련 기관):3;;^\d{1,2}\) :3;;^\(\d{1,2}\) :4;;^□ :+1"
    DROP_RX='^P∙A∙R∙T$|^:: .*안내서(\(안\))?$'
    EXTRA_POST='' ;;
  *) echo "unknown key $KEY"; exit 2 ;;
esac

hwpx-tomd "../$KEY.hwpx" --cell-br --merge-fill-vertical --prune-empty -q --image-dir "img_$KEY" -o "${KEY}_raw.md"
python3 "$S/hwpx_enrich.py" --hwpx "../$KEY.hwpx" --md "${KEY}_raw.md" --pdf "$PDF" \
  --heading "머-우:1" --title-table '^\d{1,2}$:2' --heading-regex "$HEADING_RX" \
  --part-title-style 간지제목 --part-title-level 2 \
  --drop-style '간지번호,장숫자,머리말' --drop-regex "$DROP_RX" \
  --drop-table-regex '^[IⅠⅡⅢⅣⅤ]$' --mark-color NONE --page-comment-every --italic \
  --out "${KEY}_enriched.md" --report "${KEY}_enrich_report.json" 2>&1 | (grep -v 'Syntax Warning' || true)
# 인사관리 부록3: 「4. 편의지원 유형별 …」(3수준) 아래 「1)~5)」는 한 수준 내린다(본문의 「1) 인적지원」과 구분)
if [ "$KEY" = hr ]; then python3 - "${KEY}_enriched.md" <<'PYIN'
import sys, re
p = sys.argv[1]; lines = open(p, encoding="utf-8").read().split("\n")
start = next(i for i, l in enumerate(lines) if l.startswith("## <부록3>"))
n = 0
for i in range(start, len(lines)):
    if lines[i].startswith("## ") and i > start: break
    if re.match(r"^### \d\) ", lines[i]): lines[i] = "#" + lines[i]; n += 1
assert n == 5, f"부록3 하위 절 {n}건(5 기대)"
open(p, "w", encoding="utf-8").write("\n".join(lines))
PYIN
fi
python3 "$ROOT/scripts/source-v4/postprocess-hybrid.py" --in "${KEY}_enriched.md" --out "${KEY}_post0.md" \
  --report "${KEY}_post_report.json" --image-alt "@$ROOT/scripts/source-v4/alts/$KEY.json" $EXTRA_POST
python3 - "${KEY}_post_report.json" <<'PY'
import json, sys
r = json.load(open(sys.argv[1], encoding="utf-8"))
for k in ("credits_tables", "part_h1_from_cell", "part_h1_unplaced", "draft_marks", "dropped_sections"):
    for v in r.get(k) or []:
        print(f"[후처리 확인] {k}: {v[:160]}")
PY
# 최종본 추가분(앵커 삽입) — 있는 문서만
if [ -f "$ROOT/scripts/source-v4/alts/${KEY}_additions.json" ]; then
  python3 "$ROOT/scripts/source-v4/apply-additions.py" --spec "$ROOT/scripts/source-v4/alts/${KEY}_additions.json" --in "${KEY}_post0.md" --out "${KEY}_post.md"
else
  cp "${KEY}_post0.md" "${KEY}_post.md"
fi
# 지원인력 부록2: 표 안 기기 사진(추출 불가)은 직전 항목명으로 「(사진: …)」 표기
if [ "$KEY" = staff ]; then python3 "$ROOT/scripts/source-v4/fill-photo-cells.py" staff_post.md; fi
# 수정 목록 적용(드라이브 "6. 콘텐츠 편집/2. 마크다운 정본/정본 수정 목록.csv"와 동일본을 ../../_work에 둔다)
python3 "$S/apply_corrections.py" --csv '../../_work/정본 수정 목록.csv' --doc "$DOC" \
  --in "${KEY}_post.md" --out "${KEY}_corrected.md" --pdf "$PDF" 2>&1 | (grep -v 'Syntax Warning' || true)
# 문단 사이 빈 줄·PUA 글리프 정규화(4종 공통 마지막 단계)
python3 "$ROOT/scripts/source-v4/normalize-paragraphs.py" --in "${KEY}_corrected.md" --out "$OUT"
cp "$OUT" "$ROOT/data/source-md/"
pdftotext -layout "$PDF" "${KEY}_pdf.txt" 2>/dev/null
echo "== PDF 대조"; python3 "$ROOT/scripts/source-v4/compare-md-pdf.py" "$OUT" "${KEY}_pdf.txt" --top 40
