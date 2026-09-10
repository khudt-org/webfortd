#!/usr/bin/env python3
"""content/ → 자문 드라이브 `6. 콘텐츠 편집/3. 위키 문서/` 스냅샷 + `문서 목록.csv` 재생성.

대상은 4종 원본 파생 문서 + 단체협약(source_origin 기준, faq·resources·pre-phase-1 제외).
현 스냅샷은 `--keep-as "<폴더명>"`으로 `3. 위키 문서/` 아래에 보존한 뒤 교체한다(폴더가 이미 있으면 중단).
DB·임베딩과 무관한 파일 복사이므로 `content/.embed-paused` 상태와 상관없이 실행 가능.

  python3 scripts/drive/export-wiki-snapshot.py --keep-as "이전 버전(v3 3층, 2026-08)"
  python3 scripts/drive/export-wiki-snapshot.py --dry-run
"""
import argparse
import shutil, csv, sys
import os, re, glob
import yaml
REPO=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ADV=os.path.expanduser("~/Library/CloudStorage/GoogleDrive-khudt@khudt.net/Shared drives/장교조 공유 드라이브/17. 교육부 및 교육청 등 정책연구/2026년 교육부 정책연구/[과제 5[ 정보 지원 웹페이지 개발 및 운영")
EDIT=os.path.join(ADV,"6. 콘텐츠 편집")
WIKI=os.path.join(EDIT,"3. 위키 문서")
REVIEW=os.path.join(EDIT,"4. 위키 문서 검수 (지금 할 일)")
FOLDERS=["disability-types","domains","policies","regions","uncategorized","agreements"]
SOURCE_NAME={
 "2023-disability-types-work-support-report":"2023 장애유형별 장애인교원 근무 지원 방안 최종보고서",
 "2023-hr-guide":"2023 장애인교원 인사관리 안내서",
 "2024-jbu-work-support-guide":"2024 중부대 장애인교원 근무지원 안내자료",
 "2024-support-staff-duty-guide":"장애인교원 지원인력 직무 수행 안내자료",
 "2020-collective-agreement":"2020 교육부-장애인교원노동조합 단체협약",
}
PREFIX={"2023-research":"2023-disability-types-work-support-report","2023-hr":"2023-hr-guide","2024-jbu":"2024-jbu-work-support-guide","2024-staff":"2024-support-staff-duty-guide","2020-ca":"2020-collective-agreement"}
STATUS={"draft":"검토 중","published":"공개"}

def parse(path):
    text=open(path,encoding="utf-8").read()
    m=re.match(r"^---\n(.*?)\n---\n(.*)$",text,re.S)
    fm=yaml.safe_load(m.group(1)); body=m.group(2)
    return fm, body

def body_chars(body):
    b=re.split(r"\n## 관련 페이지\n",body)[0]
    return len(re.sub(r"\s","",b))

def load_docs():
    docs={}
    for f in FOLDERS:
        for p in sorted(glob.glob(os.path.join(REPO,"content",f,"*.md"))):
            fm,body=parse(p)
            if fm.get("source_origin") not in SOURCE_NAME: continue
            slug=os.path.basename(p)[:-3]
            pg=str(fm.get("source_page","") or "")
            pe=str(fm.get("source_page_end","") or "")
            page=pg if not pe or pe==pg else f"{pg}~{pe}"
            docs[slug]=dict(slug=slug,title=fm["title"],source=SOURCE_NAME[fm["source_origin"]],origin=fm["source_origin"],
                location=" > ".join(fm.get("parent_headings") or []),page=page,folder=f,type=fm.get("type",""),
                dis=", ".join(fm.get("disability_types") or []),dom=", ".join(fm.get("domains") or []),
                reg=", ".join(fm.get("regions") or []),year=fm.get("year",""),status=STATUS.get(fm.get("status"),fm.get("status")),
                chars=body_chars(body),path=p,body=body)
    return docs

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--keep-as",default=None,help="현 스냅샷을 보존할 폴더명(3. 위키 문서/ 하위)")
    ap.add_argument("--dry-run",action="store_true")
    args=ap.parse_args()
    if not args.dry_run and not args.keep_as: ap.error("--keep-as 또는 --dry-run 필요")
    docs=load_docs()
    print("docs",len(docs), {k:sum(1 for d in docs.values() if d["origin"]==k) for k in SOURCE_NAME})
    if args.dry_run: print("dry-run: 변경 없음"); sys.exit(0)
    OLD=os.path.join(WIKI,args.keep_as)
    assert not os.path.exists(OLD), f"보존 폴더가 이미 있음: {OLD}"
    os.makedirs(OLD)
    moved=0
    for name in os.listdir(WIKI):
        if name.startswith("이전 버전") or name.startswith("."): continue
        shutil.move(os.path.join(WIKI,name), os.path.join(OLD,name)); moved+=1
    print("moved to old:",moved, "old md count:",sum(len(f) for _,_,f in os.walk(OLD)))
    for d in docs.values():
        dst=os.path.join(WIKI,d["folder"]); os.makedirs(dst,exist_ok=True)
        shutil.copy2(d["path"], os.path.join(dst,d["slug"]+".md"))
    cols=["문서 주소","제목","원본 자료","원본 위치","원본 쪽","분류","형식","장애유형","영역","지역","연도","공개 상태","본문 글자 수","파일 위치"]
    with open(os.path.join(WIKI,"문서 목록.csv"),"w",encoding="utf-8-sig",newline="") as f:
        w=csv.writer(f); w.writerow(cols)
        for d in sorted(docs.values(), key=lambda d:(list(SOURCE_NAME).index(d["origin"]), d["slug"])):
            w.writerow([d["slug"],d["title"],d["source"],d["location"],d["page"],d["folder"],d["type"],d["dis"],d["dom"],d["reg"],d["year"],d["status"],d["chars"],f"3. 위키 문서/{d['folder']}/{d['slug']}.md"])
    # 역검증
    new=sum(1 for f in FOLDERS if os.path.isdir(os.path.join(WIKI,f)) for x in os.listdir(os.path.join(WIKI,f)) if x.endswith(".md"))
    print("new snapshot md:",new, "csv rows:",sum(1 for _ in open(os.path.join(WIKI,"문서 목록.csv"),encoding="utf-8-sig"))-1)
    assert new==len(docs)

if __name__=="__main__":
    main()
