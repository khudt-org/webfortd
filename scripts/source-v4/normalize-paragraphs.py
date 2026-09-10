#!/usr/bin/env python3
"""2층 정본 마무리 정규화(4종 공통, 빌드 마지막 단계).

1. 연속된 두 줄이 같은 표 블록 안이 아니면 사이에 빈 줄을 넣는다(표 앞뒤 캡션·문단 포함). HWP 문단은 줄 하나인데 Markdown은 빈 줄 없는
   연속 줄을 한 문단으로 합치므로 ◦ 글머리 문단·표 제목·①②③ 절차가 붙어 읽혔다(2차 검수 11건).
   예외: 직전 줄이 `<br>`·두 칸 공백(강제 줄바꿈)으로 끝나거나 두 줄이 모두 목록 항목(`- `·`* `·`1. `)이면
   그대로 둔다. 표 블록(`| ` 줄)·펜스 코드 안은 건드리지 않는다.
2. 심볼 글꼴 사용자 정의 영역 글리프(화면에서만 화살표·상자로 보이는 문자)를 글자로 옮기고
   남은 PUA가 있으면 실패한다.

사용: python3 normalize-paragraphs.py --in a.md --out b.md
"""
import argparse
import re
import sys

PUA = {"\uf0e8": "→", "\U000f003b": "↓", "\U000f0036": "↓", "\uf0fe": "□"}
LIST_RE = re.compile(r"^\s*(?:[-*+] |\d{1,3}\. |[①-⑳㉠-㉭] |[가-힣]\. |\([가-힣0-9]{1,2}\) )")  # 들여쓴 하위 목록 포함


def is_row(line: str) -> bool:
    return line.startswith("| ")


def needs_blank(prev: str, cur: str) -> bool:
    """두 연속 줄 사이에 빈 줄이 필요한가. 표 블록 안(둘 다 표 줄)·목록 연속·인용 연속·강제 줄바꿈 뒤만 예외."""
    if not prev or not cur:
        return False
    if is_row(prev) and is_row(cur):
        return False
    if prev.endswith("<br>") or prev.endswith("  "):
        return False
    if LIST_RE.match(prev) and LIST_RE.match(cur):
        return False
    if prev.startswith("> ") and cur.startswith("> "):
        return False
    return True


def normalize(text: str) -> tuple[str, int, int]:
    for src, dst in PUA.items():
        text = text.replace(src, dst)
    leftover = sorted({c for c in text if 0xE000 <= ord(c) <= 0xF8FF or 0xF0000 <= ord(c) <= 0x10FFFD})
    if leftover:
        raise SystemExit("오류: 매핑되지 않은 PUA 문자 " + ", ".join(f"U+{ord(c):04X}" for c in leftover))
    lines = text.split("\n")
    out: list[str] = []
    inserted = 0
    fenced = False
    for line in lines:
        is_fence = line.startswith("```")
        # 펜스 안(닫는 펜스 줄 포함)은 손대지 않는다. 여는 펜스 앞에는 다른 블록처럼 빈 줄이 필요하다.
        if not fenced and out and needs_blank(out[-1], line):
            out.append("")
            inserted += 1
        out.append(line)
        if is_fence:
            fenced = not fenced
    return "\n".join(out), inserted, len(lines)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    text = open(a.inp, encoding="utf-8").read()
    result, inserted, total = normalize(text)
    open(a.out, "w", encoding="utf-8").write(result)
    print(f"[정규화] 빈 줄 삽입 {inserted}곳 / {total}줄", file=sys.stderr)


if __name__ == "__main__":
    main()
