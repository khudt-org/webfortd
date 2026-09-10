#!/usr/bin/env python3
"""PDF 최종본에만 있는 내용(초안 HWP 이후 추가분)을 앵커 기준으로 2층 정본에 삽입한다.

spec(JSON 배열): [{"anchor": "문서에 정확히 1회 있는 줄", "mode": "after"|"before"|"replace_block", "text": "삽입 블록", "note": "..."}]
  after/before: 앵커 줄 뒤/앞에 text를 넣는다. replace_line: 앵커 줄만 text로 바꾼다. replace_next_block: 앵커 뒤 첫 표 블록을 바꾼다. after_block: 앵커가 든 표 블록 뒤에 넣는다. "match":"prefix"면 앵커를 줄 접두로 비교한다. replace_block: 앵커 줄부터 이어지는 표 블록(빈 줄 전까지)을 text로 바꾼다.
앵커가 0회 또는 2회 이상이면 오류로 멈춘다(조용히 넘어가지 않는다). 삽입 목록은 정본 수정 목록 CSV에 「판본 차이(최종본 추가분)」로 기록한다.
"""
import argparse, json, sys

ap = argparse.ArgumentParser()
ap.add_argument("--spec", required=True)
ap.add_argument("--in", dest="inp", required=True)
ap.add_argument("--out", required=True)
a = ap.parse_args()
lines = open(a.inp, encoding="utf-8").read().split("\n")
for item in json.load(open(a.spec, encoding="utf-8")):
    if item.get("match") == "prefix":
        hits = [i for i, l in enumerate(lines) if l.startswith(item["anchor"])]
    else:
        hits = [i for i, l in enumerate(lines) if l == item["anchor"]]
    if len(hits) != 1:
        sys.exit(f"오류: 앵커 {len(hits)}회: {item['anchor'][:60]}")
    i = hits[0]
    block = item["text"].rstrip("\n").split("\n")
    mode = item.get("mode", "after")
    if mode == "after_block":  # 앵커가 든 표 블록(연속 | 줄) 바로 뒤에 넣는다
        k = i
        while k < len(lines) and lines[k].startswith("| "):
            k += 1
        lines[k:k] = [""] + block + [""]
    elif mode == "after":
        lines[i + 1:i + 1] = [""] + block + [""]
    elif mode == "before":
        lines[i:i] = block + [""]
    elif mode == "replace_line":
        lines[i:i + 1] = block
    elif mode == "replace_next_block":  # 앵커 줄은 두고, 그 뒤 첫 표 블록을 text로 바꾼다
        j = i + 1
        while j < len(lines) and not lines[j].startswith("| "):
            j += 1
        k = j
        while k < len(lines) and lines[k].startswith("| "):
            k += 1
        lines[j:k] = block
    elif mode == "replace_span":  # 앵커 줄부터 until 줄(앵커 뒤 첫 일치)까지 바꾼다
        ends = [k for k in range(i, len(lines)) if lines[k] == item["until"]]
        if len(ends) != 1:  # 앵커 뒤에서 정확히 1회(앵커 앞의 같은 줄은 세지 않는다)
            sys.exit(f"오류: until {len(ends)}회(앵커 뒤): {item['until'][:60]}")
        lines[i:ends[0] + 1] = block
    elif mode == "replace_whole_block":  # 앵커가 든 표 블록 전체를 바꾼다
        s0 = i
        while s0 > 0 and lines[s0 - 1].startswith("| "):
            s0 -= 1
        e0 = i
        while e0 < len(lines) and lines[e0].startswith("| "):
            e0 += 1
        lines[s0:e0] = block
    elif mode == "replace_block":
        j = i
        while j < len(lines) and lines[j]:
            j += 1
        lines[i:j] = block
    print(f"[삽입:{mode}] {item['anchor'][:40]} ← {len(block)}줄 {item.get('note', '')}")
open(a.out, "w", encoding="utf-8").write("\n".join(lines))
