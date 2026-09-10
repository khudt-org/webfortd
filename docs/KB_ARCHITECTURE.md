# webfortd 지식베이스(KB) 아키텍처 — 개발 측면

## 문서 정보

| 항목 | 내용 |
|------|------|
| 작성일 | 2026-05-14 |
| 짝 문서 (사업 측면) | `자문 디렉터리/2026/260514_KB설계_사업측면.md` |
| 결정 방향 | **하이브리드 KB** — Wiki(MDX/Tiptap) + 구조화 메타데이터(Supabase) + 벡터 임베딩(pgvector) |
| 적용 범위 | webfortd 전체 콘텐츠 시스템 (기존 MDX 정적 파일 → DB 마이그레이션) |
| 외주 개발자 참고 | 이 문서가 외주 계약·구현 사양의 기준 |
| 문서 버전 | v2 (2026년 5월 16일) — 마크다운 정본 + 도구 어댑터 framing |

---

## 0. 콘텐츠 정본 원칙 (Source of Truth)

본 KB의 모든 콘텐츠는 **마크다운 파일을 단일 정본(single source of truth)으로 한다**. 이 원칙은 2025년 자문 의견서의 1순위 권고("어떤 옵션이든 콘텐츠는 Markdown 형식으로 관리")와 RFP 1번 요구사항("콘텐츠는 Markdown 원본으로 관리")의 연속이며, 작년 PHP 그누보드 사이트가 휘발성 자산으로 끝난 문제의식의 직접 대응이다.

### 0.1 정본·파생 구분

| 구분 | 위치 | 역할 |
|------|------|------|
| **정본(source of truth)** | git 저장소의 `.md` 파일 (frontmatter + 본문) | 모든 편집은 이 파일을 대상으로. 영구 콘텐츠 자산. |
| 파생 — 메타데이터 인덱스 | Supabase `documents` 테이블 | 필터·검색·관리 UI용. 빌드 시 자동 동기화. |
| 파생 — 벡터 임베딩 | Supabase `document_chunks` 테이블 | RAG용. 빌드 시 자동 재생성. |
| 파생 — 백링크 인덱스 | Supabase `wiki_backlinks` 테이블 | 페이지 간 그래프. 빌드 시 자동 추출. |
| 파생 — 정적 렌더링 | Next.js 빌드 산출물 | 사용자 노출 화면. ISR. |

§3 이하의 Document 스키마·Supabase 테이블·임베딩 파이프라인·RAG 흐름은 **모두 파생 인덱스 측 사양**이다. 정본은 항상 마크다운 파일이다.

### 0.2 편집 도구는 어댑터 (interchangeable)

마크다운 파일을 만들고 수정하는 도구는 어댑터 계층이고 갈아끼울 수 있다. 편집자별로 다른 도구를 사용해도 결과물(마크다운 + frontmatter + `[[slug]]` 위키링크)이 동일하면 시스템 정합성에 영향 없음.

| 어댑터 옵션 | 적합 사용자 | 강점 |
|-----------|----------|------|
| Claude Code | 위원장(시각장애 편집자) | 접근성 최상, AI 보조 작성, frontmatter·슬러그 매핑 자동 |
| VS Code + 마크다운 확장 | 시각장애 개발자 일반 | 스크린리더 호환 표준, 확장 풍부 |
| 옵시디언 GUI | 정책실·외부 검수자 (선호 시) | 위키링크 자동완성, 백링크 뷰, `obsidian-bases` 플러그인으로 taxonomy 검증 |
| 옵시디언 CLI | 헤드리스/스크립팅 | 셸 기반 자동화 |
| Tiptap 웹 에디터 (선택) | 외부 기고자(설치 없는 진입) | 웹 폼 → 마크다운 변환 |
| GitHub 웹 에디터 | 단발 수정자 | 별도 설치 없이 PR 가능 |

도구 선택은 **편집자별·시점별 결정**이며, 정본이 마크다운인 한 어느 도구가 선택돼도 시스템 정합성은 유지된다. webfortd 본체 개발 사양에는 **Tiptap 웹 에디터를 필수로 박지 않는다** — 옵션으로 둔다.

### 0.3 이 원칙이 가져오는 이점

1. **벤더·도구 lock-in 없음**: 어떤 CMS·에디터·플랫폼이 사라져도 콘텐츠 자산은 그대로 (.md 파일은 영구 포맷).
2. **편집자 다양성 수용**: 위원장은 Claude Code, 정책실은 옵시디언, 외부 기고자는 웹 폼 — 동일 정본에 다중 경로 가능.
3. **검수 워크플로우 단순화**: git PR 머지가 published 상태 전환과 동치. revisions는 git 커밋 히스토리로 자연 보존(별도 테이블 불필요).
4. **2025 자문 1순위 권고와 정합**: MkDocs 모델이었던 작년 권고의 자연스러운 확장. taxonomy·AI 채팅·검수 거버넌스를 그 위에 얹는 형태.
5. **외주 견적 축소 가능**: Tiptap WikiLink 확장·revisions 테이블·앱 내 status 전환 UI 등을 옵션화하면 외주 범위가 빌드 파이프라인과 RAG 통합 모듈 중심으로 좁아짐.

### 0.4 편집 협업의 시간 구조

이 KB의 협업 편집은 **비동기 워크플로우를 전제**한다(2026-05-16 위원장 확인). 권한 있는 편집자 소수가 git PR 또는 동등한 비동기 큐를 통해 작업하며, 실시간 동시 편집(Yjs 등)은 요구사항이 아니다. 이 결정은 §5 편집 도구 어댑터 선택지의 폭을 넓힌다.

---

## 1. 3계층 아키텍처

```
┌─────────────────────────────────────────────────────────┐
│ Layer 1: 구조화 메타데이터 (Supabase Postgres)            │
│   document_id, title, type, taxonomy[], region,         │
│   effective_date, source, authors, status,              │
│   reviewed_by, accessibility_meta, ...                  │
└─────────────────────────────────────────────────────────┘
                          ↕
┌─────────────────────────────────────────────────────────┐
│ Layer 2: 본문 콘텐츠 (마크다운 정본)                     │
│   .md 파일 (frontmatter + 본문, git 저장소가 정본),       │
│   wiki_links 추출, references[], embedded_media[],       │
│   revisions = git 커밋 히스토리                          │
└─────────────────────────────────────────────────────────┘
                          ↕
┌─────────────────────────────────────────────────────────┐
│ Layer 3: 벡터 임베딩 (pgvector, 자동 청킹)               │
│   chunk_id, chunk_text, embedding (1536-dim),           │
│   parent_doc_id, section, char_range, metadata_jsonb    │
└─────────────────────────────────────────────────────────┘
```

세 계층 모두 **Supabase 단일 프로젝트**에 저장. 운영 단순화·트랜잭션 일관성 확보.

---

## 2. Taxonomy 정의 (5축 다중 분류)

다축 분류는 enum 또는 reference table로 구현. 아래는 **Phase 1 v1 잠정안**(2026-05-17 확정, 운영 중 보정 가능). 시드는 기존 `src/lib/navigation.ts:22-41`의 분류와 정렬.

```ts
// 1. 장애 유형
export const DISABILITY_TYPES = [
  '시각', '청각', '지체', '뇌병변', '발달',
  '내부장애', '기타', '전체' // 전체 = 장애유형 무관 자료
] as const

// 2. 영역
export const DOMAINS = [
  '인사관리',    // 임용·배치·전보·승진
  '복무관리',    // 근무·휴가·휴직·연수
  '편의지원',    // 보조공학·근로지원인·시설
  '권리구제',    // 차별·인권침해·구제절차
  '연수교육',    // 직무연수·자격연수
  '정책법령',    // 법령·조례·지침
  '연구통계',    // 연구보고서·통계
  '인식개선',    // 카드뉴스·영상·홍보
] as const

// 3. 지역 (전국 + 17개 시도교육청)
export const REGIONS = [
  '전국', '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
  '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'
] as const

// 4. 시간 (연도 + 개정 이력은 revisions로)
// year: number

// 5. 형식
export const DOC_TYPES = [
  '법령',         // 법·법률·조례
  '지침',         // 행정 지침·매뉴얼
  '연구보고서',
  '안내서',       // 인사관리 안내서 등
  '사례',         // 실사례·판례
  '통계',         // 시각화 가능 데이터
  '카드뉴스',
  '영상',
  'FAQ',
  '뉴스',         // 언론보도
  '기타'
] as const
```

### Taxonomy의 정합성 검증

- 한 Document는 **여러 disability_types를 가질 수 있음** (예: "전체"가 아니라 ['시각', '청각'])
- **domains는 1~3개** 권장 (너무 많으면 분류 무의미)
- **regions는 1개**가 일반적, 비교 자료는 ['전국'] + 비교 대상 시도
- **year**는 필수 (개정 추적의 시작점)
- **type**은 정확히 1개 (페이지 단위 형식 단일성)

---

## 3. Document 스키마 (TypeScript 정의)

```ts
type DisabilityType = typeof DISABILITY_TYPES[number]
type Domain = typeof DOMAINS[number]
type Region = typeof REGIONS[number]
type DocType = typeof DOC_TYPES[number]
type Status = 'draft' | 'in_review' | 'published' | 'archived' | 'deprecated'

interface Reference {
  citation: string         // 정식 인용 형식 (APA/Chicago 등)
  url?: string
  type: 'paper' | 'law' | 'web' | 'book' | 'media'
}

interface AccessibilityMeta {
  alt_text_complete: boolean
  captions_available: boolean
  reading_level: 'easy' | 'standard' | 'expert'
  audio_tts_ready: boolean
}

interface Revision {
  revision_id: string
  parent_revision_id?: string
  content_diff: string     // diff or full snapshot
  edited_by: string
  edited_at: string
  change_note: string
}

interface Document {
  // === Layer 1: 구조화 메타데이터 ===
  id: string                          // UUID, 인용 가능한 영구 ID
  slug: string                        // 사람이 읽을 수 있는 URL ('/docs/visual-hr-mgmt')
  title: string
  subtitle?: string

  // Taxonomy (5축)
  type: DocType
  disability_types: DisabilityType[]
  domains: Domain[]
  regions: Region[]
  year: number
  effective_date?: string             // 법령 시행일 등 (ISO 8601)

  // 출처 정보
  source: {
    organization: string              // 발행 기관
    url?: string                      // 원문 URL
    citation: string                  // 정식 인용 형식
    document_id?: string              // 외부 식별자 (있을 경우)
  }
  references: Reference[]             // 본문 내 인용된 외부 자료

  // 거버넌스
  status: Status
  authors: string[]
  reviewed_by: string[]               // 검수자 이름·역할
  reviewed_at?: string
  reviewer_notes?: string

  // 접근성
  accessibility: AccessibilityMeta

  // 출처 문서 내 위치 (breadcrumb)
  // M3 분해 결과의 부모 헤딩 경로를 보존. UI는 KbPageLayout breadcrumb으로 렌더.
  // 수동 작성 페이지에는 빈 배열.
  parent_headings: string[]

  // === Layer 2: 본문 (마크다운 정본의 캐시) ===
  // 정본은 git 저장소의 .md 파일. 아래 필드는 빌드 파이프라인에서 동기화된 파생 캐시.
  content_md: string                  // 마크다운 본문 (frontmatter 제외)
  source_path: string                 // git 저장소 내 정본 경로 (예: content/disability-types/visual.md)
  wiki_links: string[]                // 본문에서 추출된 slug 배열
  embedded_media: { url: string; alt: string; caption?: string }[]
  // revisions는 별도 테이블 대신 git 커밋 히스토리로 대체 (정본이 git이므로)
  // Tiptap 웹 에디터를 옵션 어댑터로 활성화하는 경우에만 content_json 캐시 추가

  // === Layer 3 연결 ===
  // 임베딩은 별도 테이블 (document_id로 join)

  created_at: string
  updated_at: string
}
```

---

## 4. Supabase 테이블 설계 (SQL)

```sql
-- Extensions
create extension if not exists pgvector;
create extension if not exists pg_trgm; -- 한국어 fuzzy 검색

-- ============= 1. documents =============
create table documents (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  subtitle text,

  -- Taxonomy
  type text not null,
  disability_types text[] not null default '{}',
  domains text[] not null default '{}',
  regions text[] not null default '{}',
  year int not null,
  effective_date date,

  -- Source
  source jsonb not null,
  references_data jsonb not null default '[]'::jsonb,

  -- Governance
  status text not null default 'draft',
  authors text[] not null default '{}',
  reviewed_by text[] not null default '{}',
  reviewed_at timestamptz,
  reviewer_notes text,

  -- Accessibility
  accessibility jsonb not null default '{
    "alt_text_complete": false,
    "captions_available": false,
    "reading_level": "standard",
    "audio_tts_ready": false
  }'::jsonb,

  -- Content (마크다운 정본의 캐시. 정본은 git 저장소의 .md 파일)
  content_md text not null default '',
  source_path text not null default '',  -- 정본 경로 (예: content/disability-types/visual.md)
  wiki_links text[] not null default '{}',
  embedded_media jsonb not null default '[]'::jsonb,
  -- content_json jsonb는 Tiptap 웹 에디터 옵션 활성화 시에만 추가

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 인덱스 (필터·검색 성능)
create index idx_documents_status on documents(status);
create index idx_documents_type on documents(type);
create index idx_documents_year on documents(year);
create index idx_documents_disability_types on documents using gin(disability_types);
create index idx_documents_domains on documents using gin(domains);
create index idx_documents_regions on documents using gin(regions);
create index idx_documents_title_trgm on documents using gin(title gin_trgm_ops);

-- ============= 2. revisions (옵션 — Tiptap 웹 에디터 도입 시에만) =============
-- 정본은 git 저장소의 마크다운이고 변경 이력은 git 커밋이 권위. 본 테이블은
-- Tiptap 웹 에디터 어댑터를 활성화해 비-git 사용자가 직접 편집할 때 그 변경분의
-- 영속 저장소로만 사용한다. Phase 1 범위는 아니며 Phase 2+에서 어댑터 채택 결정 후 도입.
create table revisions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  parent_revision_id uuid references revisions(id),
  content_snapshot jsonb not null, -- Tiptap JSON snapshot
  change_note text,
  edited_by text not null,
  edited_at timestamptz default now()
);

create index idx_revisions_document on revisions(document_id, edited_at desc);

-- ============= 3. document_chunks (벡터 임베딩) =============
create table document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  chunk_text text not null,
  chunk_index int not null,           -- 문서 내 순서
  section text,                       -- 섹션 제목 (있을 경우)
  char_start int,
  char_end int,
  embedding vector(1536),             -- OpenAI text-embedding-3-small 기준
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

create index idx_chunks_document on document_chunks(document_id);
-- ivfflat 인덱스 (벡터 검색)
create index idx_chunks_embedding on document_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- ============= 4. wiki_backlinks (자동 생성) =============
-- M2/M6 JSON 인덱스의 Backlink 구조와 1:1 대응:
--   from        ↔ source_doc_id (slug → doc id 매핑은 빌드 시 수행)
--   anchor      ↔ anchor       (`[[slug#section]]`의 section 부분)
--   link_text   ↔ link_text    (`[[slug|표시명]]`의 표시명 부분)
-- 주의: 현재 PK가 (source_doc_id, target_slug)라 동일 페이지가 같은 대상을 anchor/link_text를
-- 달리해 여러 번 링크하면 한 row만 보존됨. M2 codex-rescue 이연 항목 — Phase 2 마이그레이션 시
-- `occurrences` 컬럼 또는 (source, target, line) 별 PK로 정책 결정 필요.
create table wiki_backlinks (
  source_doc_id uuid references documents(id) on delete cascade,
  target_slug text not null,
  anchor text,
  link_text text,
  primary key (source_doc_id, target_slug)
);

create index idx_backlinks_target on wiki_backlinks(target_slug);

-- ============= 5. categories (taxonomy reference, 옵션) =============
-- enum 대신 reference table로 두면 향후 다국어·설명문·아이콘 추가 가능
create table taxonomy_terms (
  id text primary key,                -- 'disability_types/visual' 같은 식
  axis text not null,                 -- 'disability_types' | 'domains' | 'regions' | 'doc_types'
  label_ko text not null,
  label_en text,
  description text,
  parent_id text references taxonomy_terms(id),
  display_order int default 0
);
```

### RLS (Row Level Security) 정책

```sql
-- 일반 사용자는 published만 조회
create policy "Public can read published documents"
  on documents for select
  using (status = 'published');

-- 인증된 편집자는 본인 작성/검수 가능
create policy "Editors can write documents"
  on documents for all
  to authenticated
  using (auth.uid() in (
    select user_id from editor_roles where role in ('editor', 'reviewer', 'admin')
  ));

-- 검수자만 status 변경 가능 (별도 함수로 구현 권장)
```

---

## 5. 편집 도구 어댑터 + 빌드 파이프라인

§0.2에서 정의한 대로 콘텐츠 편집 도구는 어댑터 계층이다. 모든 어댑터는 동일한 마크다운 정본(frontmatter + 본문 + `[[slug]]` 위키링크)을 생성·수정하며, 빌드 파이프라인이 이를 Supabase 파생 인덱스로 변환한다.

### 5.1 위키링크 문법 (모든 어댑터 공통)

마크다운 본문 내 위키링크 문법은 옵시디언·Tiptap·MkDocs 등 어느 어댑터에서도 동일하다:

```markdown
[[disability-types-visual]]                  # 슬러그로 링크
[[disability-types-visual|시각장애 페이지]]   # 표시 텍스트 커스터마이즈
[[disability-types-visual#보조공학]]          # 페이지 내 헤딩으로 링크
```

슬러그는 `documents.slug`의 외래키이고, 빌드 시 `wiki_backlinks` 테이블이 자동 갱신된다.

### 5.2 어댑터별 작성 가이드

#### Claude Code (위원장 기본 워크플로우)

자연어로 지시하면 Claude가 마크다운 파일을 생성·수정. frontmatter 스키마 검증·위키링크 슬러그 매핑·git PR 작성까지 일괄 위임 가능. **시각장애 편집자에게 가장 친화적인 경로**.

#### 옵시디언 GUI

옵시디언 네이티브 `[[]]` 문법이 슬러그 기반 위키링크와 그대로 호환. `obsidian-bases` 플러그인으로 frontmatter taxonomy enum 검증·작성 시점 보조 가능. 정책실·외부 검수자처럼 GUI 선호 편집자에게 적합.

#### 옵시디언 CLI

`obsidian create/read/append/property:set/backlinks` 등 헤드리스 운영. 옵시디언 앱이 백그라운드에 떠 있어야 하지만 셸 자동화 가능.

#### VS Code + 마크다운 확장

NVDA/VoiceOver 호환이 가장 검증된 스크린리더 친화 에디터. Foam·Markdown All in One·YAML 확장으로 frontmatter·위키링크 모두 지원.

#### Tiptap 웹 에디터 (선택)

외부 기고자가 별도 도구 설치 없이 웹에서 작성하고 싶을 때만 활성화. Tiptap → 마크다운 변환을 거쳐 동일 정본 형식으로 저장. **본 사양에서 필수가 아님 — 운영 중 외부 기고자 수요가 누적된 시점에 추가 도입 검토**.

#### GitHub 웹 에디터

단발 수정자가 별도 설치 없이 PR 생성. 검수 PR 코멘트 기능과 자연스럽게 결합.

### 5.3 빌드 파이프라인 (마크다운 → Supabase 파생 인덱스)

```
[Editor (any adapter)]
    ↓ writes/edits
[git repository: content/**/*.md]
    ↓ push / PR merge
[CI build step]
    ├─ frontmatter parse (gray-matter)
    ├─ markdown parse (remark + remark-frontmatter)
    ├─ wiki link 추출 (§5.4)
    ├─ upsert documents row (메타데이터 + content_md 캐시)
    ├─ delete/regenerate document_chunks (재임베딩)
    └─ regenerate wiki_backlinks
    ↓
[Supabase: documents, document_chunks, wiki_backlinks]
    ↓
[Next.js ISR / read-time queries]
```

CI 구현 옵션:
- GitHub Actions에서 main 브랜치 push 시 sync 스크립트 실행
- Supabase Edge Function으로 webhook 수신 후 처리
- Next.js `app/api/sync` 라우트 + Vercel cron (수동/주기 동기화)

### 5.4 위키링크 추출 (빌드 시)

마크다운 파일에서 위키링크를 추출해 `documents.wiki_links` 컬럼과 `wiki_backlinks` 테이블을 갱신:

```ts
// scripts/extract-wiki-links.ts
const WIKI_LINK_RE = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g

export function extractWikiLinks(markdown: string): string[] {
  const slugs = new Set<string>()
  for (const m of markdown.matchAll(WIKI_LINK_RE)) {
    slugs.add(m[1].trim())
  }
  return [...slugs]
}
```

빌드 시 모든 `.md` 파일을 순회하며 호출 → 각 문서의 `wiki_links` 배열과 역방향 `wiki_backlinks` 테이블을 재생성.

### 5.5 검수 워크플로우 — git PR 옵션

git을 정본 저장소로 사용하면 검수 워크플로우가 PR 머지로 단순화:

```
[제안: 작성자가 브랜치 + PR 생성]
       ↓
[검수: 리뷰어가 정책 정합성·접근성·인용 정확성 확인]
       ↓ (코멘트로 수정 요청 가능)
[승인: 검수자가 PR 승인 → main 머지]
       ↓
[CI: status=published 페이지 인덱싱 + 임베딩 재생성]
       ↓
[배포: Next.js ISR 자동 재생성]
```

`reviewed_by`는 PR 승인자 GitHub 핸들로 자동 기록 가능(GitHub Actions). revisions는 git 커밋 히스토리로 자연 보존 — 별도 테이블 불필요.

비-git 편집자(예: 옵시디언 사용자)는 같은 마크다운 파일을 직접 수정한 뒤 sync 커밋이 자동 트리거되거나, 별도 admin UI가 마크다운을 수정한 뒤 commit. 어떤 경로든 정본은 동일하게 git의 `.md` 파일.

### 5.6 Tiptap 웹 에디터 어댑터 (옵션 — 활성화 시에만 적용)

외부 기고자 진입 장벽 완화 목적으로 Tiptap 웹 에디터를 활성화하는 경우의 사양은 §부록 C를 참조. **본 사양 v2에서는 필수 어댑터가 아니므로 §부록 C로 분리한다.** 활성화 결정은 운영 데이터(외부 기고자 수, 정책실 GUI 선호도, 외주 견적)를 보고 후순위에서 진행.

---

## 6. 임베딩 파이프라인

### 6.1 청킹 전략

```ts
// src/lib/chunker.ts
import { encoding_for_model } from 'tiktoken'

export interface Chunk {
  text: string
  section?: string
  charStart: number
  charEnd: number
}

const CHUNK_SIZE_TOKENS = 500  // 한국어 기준 ~300자
const CHUNK_OVERLAP = 50

export function chunkMdx(mdx: string): Chunk[] {
  // 1. 헤딩 단위로 1차 분할
  const sections = splitByHeading(mdx)

  // 2. 너무 길면 토큰 기준 추가 분할 (오버랩 포함)
  const chunks: Chunk[] = []
  const enc = encoding_for_model('gpt-4')

  for (const section of sections) {
    const tokens = enc.encode(section.text)
    if (tokens.length <= CHUNK_SIZE_TOKENS) {
      chunks.push({ ...section })
    } else {
      // 슬라이딩 윈도우
      for (let i = 0; i < tokens.length; i += CHUNK_SIZE_TOKENS - CHUNK_OVERLAP) {
        const slice = tokens.slice(i, i + CHUNK_SIZE_TOKENS)
        const text = new TextDecoder().decode(enc.decode(slice))
        chunks.push({
          text,
          section: section.section,
          charStart: section.charStart + i, // 근사치
          charEnd: section.charStart + i + slice.length,
        })
      }
    }
  }

  enc.free()
  return chunks
}
```

### 6.2 임베딩 생성

```ts
// src/lib/embed.ts
import { embed } from 'ai'
import { openai } from '@ai-sdk/openai'

export async function embedChunks(chunks: string[]) {
  const results = await Promise.all(
    chunks.map(async (text) => {
      const { embedding } = await embed({
        model: openai.embedding('text-embedding-3-small'),
        value: text,
      })
      return embedding
    })
  )
  return results
}
```

> 임베딩 모델 선택지:
> - **OpenAI text-embedding-3-small** (1536-dim): 한국어 양호, 저렴 ($0.02 / 1M tokens)
> - **Gemini text-embedding-004** (768-dim): 무료 티어 큼, 한국어 좋음
> - **multilingual-e5-large** (오픈소스): 셀프 호스팅 가능, 비용 0

### 6.3 트리거 (저장 시 자동 임베딩)

Supabase Edge Function으로 구현. `documents.status = 'published'` 전환 시 발동:

```ts
// supabase/functions/embed-document/index.ts
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { chunkMdx } from '../../shared/chunker.ts'
import { embedChunks } from '../../shared/embed.ts'

Deno.serve(async (req) => {
  const { document_id } = await req.json()
  const supabase = createClient(/* ... */)

  // 1. document 가져오기
  const { data: doc } = await supabase
    .from('documents')
    .select('content_mdx, disability_types, domains, regions, year, type')
    .eq('id', document_id)
    .single()

  // 2. 기존 청크 삭제
  await supabase
    .from('document_chunks')
    .delete()
    .eq('document_id', document_id)

  // 3. 청킹 + 임베딩
  const chunks = chunkMdx(doc.content_mdx)
  const embeddings = await embedChunks(chunks.map((c) => c.text))

  // 4. 저장 (메타데이터를 chunks에 함께 저장 → RAG 필터링용)
  await supabase.from('document_chunks').insert(
    chunks.map((c, i) => ({
      document_id,
      chunk_text: c.text,
      chunk_index: i,
      section: c.section,
      char_start: c.charStart,
      char_end: c.charEnd,
      embedding: embeddings[i],
      metadata: {
        disability_types: doc.disability_types,
        domains: doc.domains,
        regions: doc.regions,
        year: doc.year,
        type: doc.type,
      },
    }))
  )

  return new Response('ok')
})
```

---

## 7. RAG 쿼리 흐름

### 7.1 메타데이터 사전 필터 + 벡터 검색

```ts
// src/lib/rag-search.ts
import { embed } from 'ai'
import { openai } from '@ai-sdk/openai'

export interface QueryFilter {
  disability_types?: string[]
  domains?: string[]
  regions?: string[]
  year_min?: number
  year_max?: number
  types?: string[]
}

export async function ragSearch(
  query: string,
  filter: QueryFilter = {},
  topK = 8
) {
  // 1. 쿼리 임베딩
  const { embedding } = await embed({
    model: openai.embedding('text-embedding-3-small'),
    value: query,
  })

  // 2. Supabase RPC 호출 (PostgreSQL function 내부에서 필터 + 벡터 검색)
  const { data } = await supabase.rpc('rag_search', {
    query_embedding: embedding,
    filter_disability: filter.disability_types ?? null,
    filter_domains: filter.domains ?? null,
    filter_regions: filter.regions ?? null,
    filter_year_min: filter.year_min ?? null,
    filter_year_max: filter.year_max ?? null,
    filter_types: filter.types ?? null,
    match_count: topK,
  })

  return data
}
```

### 7.2 PostgreSQL function

```sql
create or replace function rag_search(
  query_embedding vector(1536),
  filter_disability text[] default null,
  filter_domains text[] default null,
  filter_regions text[] default null,
  filter_year_min int default null,
  filter_year_max int default null,
  filter_types text[] default null,
  match_count int default 8
)
returns table (
  chunk_id uuid,
  document_id uuid,
  chunk_text text,
  section text,
  similarity float,
  doc_title text,
  doc_slug text
)
language sql stable
as $$
  select
    c.id as chunk_id,
    c.document_id,
    c.chunk_text,
    c.section,
    1 - (c.embedding <=> query_embedding) as similarity,
    d.title as doc_title,
    d.slug as doc_slug
  from document_chunks c
  join documents d on d.id = c.document_id
  where d.status = 'published'
    and (filter_disability is null or d.disability_types && filter_disability)
    and (filter_domains is null or d.domains && filter_domains)
    and (filter_regions is null or d.regions && filter_regions)
    and (filter_year_min is null or d.year >= filter_year_min)
    and (filter_year_max is null or d.year <= filter_year_max)
    and (filter_types is null or d.type = any(filter_types))
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
```

### 7.3 AI 채팅 응답 (Vercel AI SDK)

```ts
// src/app/api/chat/route.ts
import { streamText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { ragSearch, QueryFilter } from '@/lib/rag-search'
import { z } from 'zod'

export async function POST(req: Request) {
  const { messages, filter } = await req.json()

  // 1. 마지막 사용자 메시지로 RAG 검색
  const lastUser = messages.findLast((m: any) => m.role === 'user')
  const chunks = await ragSearch(lastUser.content, filter as QueryFilter, 8)

  // 2. 컨텍스트 구성
  const context = chunks
    .map((c, i) =>
      `[자료 ${i + 1}] (${c.doc_title}, 섹션: ${c.section ?? '-'})\n${c.chunk_text}`
    )
    .join('\n\n---\n\n')

  const systemPrompt = `당신은 장애인교원 정책 자료 지식베이스의 어시스턴트입니다.
사용자 질문에 답할 때 반드시 아래 [자료] 블록만 근거로 사용하고,
답변 끝에 [자료 N] 형식으로 출처를 명시하세요. 자료에 없는 내용은 추측하지 말고
"자료에서 해당 내용을 찾지 못했습니다"라고 응답하세요.

당사자(장애인교원) 관점을 존중하는 정확하고 친절한 답변을 작성하세요.
화면 낭독기 사용자가 듣기 좋은 자연스러운 문장으로 구성하세요.

[자료]
${context}`

  // Vercel AI Gateway 라우팅 사용 (OIDC 인증·provider failover·비용 추적 통합)
  // 모델 슬러그는 'provider/model' 형식 (예: 'anthropic/claude-sonnet-4.6')
  const result = streamText({
    model: 'anthropic/claude-sonnet-4.6',
    system: systemPrompt,
    messages,
  })

  return result.toUIMessageStreamResponse({
    // 출처 정보를 메시지 메타데이터에 첨부
    messageMetadata: { sources: chunks.map((c) => ({
      title: c.doc_title,
      slug: c.doc_slug,
      section: c.section,
      similarity: c.similarity,
    })) },
  })
}
```

---

## 8. UI 컴포넌트 (3-Mode)

### 8.1 Tree 모드 (탐색)

`src/components/kb/CategoryTree.tsx` — taxonomy_terms 기반 사이드바.

### 8.2 Filter 모드 (다축 검색)

`src/components/kb/FilterBar.tsx` — 5축 facet 선택 + 키워드 입력. Supabase 직접 쿼리.

### 8.3 Chat 모드 (AI 질의응답)

`src/components/kb/Chat.tsx` — Vercel AI Elements 기반:

```tsx
'use client'
import { Conversation, Message, MessageContent } from '@/components/ai-elements'
import { useChat } from 'ai/react'

export function KbChat({ initialFilter }: { initialFilter?: QueryFilter }) {
  const { messages, sendMessage, status } = useChat({
    api: '/api/chat',
    body: { filter: initialFilter },
  })

  return (
    <Conversation aria-label="장애인교원 정책 채팅">
      {messages.map((m) => (
        <Message key={m.id} from={m.role}>
          <MessageContent>{m.parts.map(renderPart)}</MessageContent>
          {m.metadata?.sources && <SourceList sources={m.metadata.sources} />}
        </Message>
      ))}
      <ChatInput onSubmit={sendMessage} disabled={status === 'streaming'} />
    </Conversation>
  )
}
```

### 8.4 접근성 필수 처리

- `<Conversation>`은 내부적으로 `aria-live="polite"` 보유 (AI Elements 표준)
- 스트리밍 응답이 화면 낭독기에 자연스럽게 전달
- 출처 링크는 화면 낭독기가 "출처: 페이지 제목" 형태로 읽도록 `aria-label` 설정
- 입력 필드는 음성 인식 호환 (`autocapitalize="off"`, `spellcheck="true"`)

---

## 9. 검수 워크플로우 (상태 머신)

```
   ┌─────┐
   │draft│
   └──┬──┘
      │ submit_for_review()
      ▼
 ┌──────────┐
 │in_review │
 └────┬─────┘
      │ approve()  ──→ published
      │ reject()   ──→ draft (with notes)
      ▼
 ┌──────────┐
 │published │ ───→ AI 답변 소스에 포함
 └────┬─────┘
      │ deprecate() (법령 개정 등)
      ▼
 ┌──────────┐
 │deprecated│ ───→ 표시는 되나 AI 답변 소스에서 제외
 └────┬─────┘
      │ archive()
      ▼
 ┌──────────┐
 │ archived │ ───→ 검색에서도 제외
 └──────────┘
```

### 자동 가드

- `status='published'` 진입 조건:
  - `reviewed_by` 비어있지 않음
  - `accessibility.alt_text_complete = true` (이미지 있을 때)
  - `source.citation` 비어있지 않음
  - `disability_types`, `domains`, `regions` 최소 1개

검수 안 된 콘텐츠는 SQL 레벨에서 RAG 검색 결과에 포함되지 않음 (`where d.status = 'published'`).

---

## 10. Phase별 개발 작업 분해

### Phase 0: 데이터 모델 확정 (1주)

- [ ] Taxonomy 초안 검수 (위원장 + 정책실)
- [ ] Document 스키마 TypeScript 정의 완성 (`src/types/kb.ts`)
- [ ] Supabase 마이그레이션 SQL 작성 (`supabase/migrations/0001_init_kb.sql`)
- [ ] taxonomy_terms 초기 데이터 시드

### Phase 1: 콘텐츠 저장소 + 빌드 파이프라인 (2주)

- [ ] git 콘텐츠 저장소 구조 확정 (`content/<axis>/<slug>.md`)
- [ ] frontmatter 스키마 v1 + 검증 스크립트 (`scripts/validate-frontmatter.ts`)
- [ ] Supabase 프로젝트 생성 (장교조 명의)
- [ ] 빌드 파이프라인 (`scripts/sync-content.ts`) — 마크다운 파싱 + Supabase upsert + 위키링크 추출
- [ ] 작년 자료 분해·마이그레이션 (`scripts/migrate-legacy.ts`)
  - 대상: 인사관리 안내서, 시도교육청 조례 비교 분석, 근무 지원 방안 등
  - monolithic 마크다운(현재 5개 파일, 약 23,000 라인) → atomic 페이지로 분해
- [ ] git PR 기반 검수 워크플로우 명세 (PR 템플릿, CODEOWNERS, 검수자 라벨)
- [ ] (옵션) 별도 admin UI 또는 옵시디언 볼트 sync 스크립트 — 외주 견적과 운영 수요 보고 결정

### Phase 2: 탐색·검색 UI (2주)

- [ ] Tree 모드 (CategoryTree 컴포넌트)
- [ ] Filter 모드 (FilterBar + 결과 목록)
- [ ] 페이지 상세 (본문 + 메타데이터 사이드바 + 백링크)
- [ ] flexsearch 통합 (텍스트 검색)
- [ ] Supabase 풀텍스트 인덱스 활용
- [ ] 다크 모드 (next-themes) 활성화

### Phase 3: 임베딩 파이프라인 (1주)

- [ ] pgvector 활성화 + 인덱스 생성
- [ ] `chunkMdx` 청킹 함수 구현
- [ ] `embedChunks` 임베딩 함수 구현
- [ ] Supabase Edge Function: 저장 시 자동 임베딩
- [ ] `rag_search` PostgreSQL function 작성
- [ ] 기존 published 콘텐츠 일괄 임베딩 스크립트

### Phase 4: AI 채팅 (2~3주)

- [ ] Vercel AI SDK 통합 (`@ai-sdk/anthropic` 또는 `@ai-sdk/google`)
- [ ] `/api/chat` 라우트 구현
- [ ] AI Elements 통합 (Conversation, Message, MessageContent)
- [ ] 출처 표시 컴포넌트 (`SourceList`)
- [ ] 필터 연동 (Chat 모드에서도 5축 필터 적용)
- [ ] 답변 캐싱 (Vercel Runtime Cache)
- [ ] 음성 입력 (Web Speech API, 옵션)
- [ ] 응답 TTS 재생 (옵션, ElevenLabs)

### Phase 5: 운영·확장 (잔여)

- [ ] 이미지 alt 자동 생성 (Gemini Vision)
- [ ] 통계 시각화 (시도별 비교 차트)
- [ ] 다국어 (영문 요약)
- [ ] 사용자 피드백 수집 (질문 답변 평점)
- [ ] 답변 품질 분석 대시보드

---

## 11. 환경 변수 (계획)

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=  # Edge Function용

# AI — Vercel AI Gateway 사용 (provider API 키 직접 노출 금지)
# 인증은 OIDC 토큰 기반으로 통일 — 환경변수 정적 관리 불필요
# - 프로덕션 (Vercel 배포): OIDC 토큰이 빌드·런타임에 자동 주입됨
# - 로컬 개발: `vercel env pull` 실행 → `.vercel/.env.development.local` 에
#   OIDC 토큰이 동기화되며 12시간 단위 자동 갱신
# 정적 API 키는 수동 로테이션 부담이 있어 비권장 (OIDC가 표준 경로)
# 모델 호출 시 'anthropic/claude-sonnet-4.6', 'openai/text-embedding-3-small',
# 'google/gemini-2.5-flash' 같은 provider/model 슬러그 사용 → AI Gateway가
# 인증·라우팅·failover·비용 추적을 통합 처리

# TTS (옵션)
ELEVENLABS_API_KEY=

# 운영
VERCEL_URL=
```

---

## 12. 의존성 추가 계획

`package.json`에 추가될 패키지:

```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.x",
    "@supabase/ssr": "^0.x",
    "gray-matter": "^4.x",
    "remark": "^15.x",
    "remark-frontmatter": "^5.x",
    "remark-gfm": "^4.x",
    "ai": "^5.x",
    "@ai-sdk/anthropic": "^1.x",
    "@ai-sdk/openai": "^1.x",
    "@ai-sdk/google": "^1.x",
    "tiktoken": "^1.x"
  },
  "devDependencies": {
    "zod": "^3.x"
  }
}
```

기존 `flexsearch`, `next-mdx-remote`, `react-hook-form`, `framer-motion`, `shadcn/ui` 등은 그대로 유지.

**Tiptap 패키지(`@tiptap/*`)는 v2 사양에서 필수 의존성이 아니다.** §5.6의 Tiptap 웹 에디터 어댑터를 활성화하는 경우에만 추가:

```json
{
  "dependencies": {
    "@tiptap/react": "^2.x",
    "@tiptap/starter-kit": "^2.x",
    "@tiptap/extension-link": "^2.x",
    "@tiptap/extension-image": "^2.x"
  }
}
```

---

## 13. 성능 고려사항

| 영역 | 목표 | 대응 |
|------|------|------|
| 초기 로드 (LCP) | < 2.5s | RSC + 정적 ISR + Vercel CDN |
| 검색 응답 | < 300ms | Supabase 인덱스 + Edge runtime |
| AI 첫 토큰 (TTFB) | < 1.5s | Vercel Edge Function + Anthropic 스트리밍 |
| 임베딩 일괄 처리 | 100 docs / 5분 | Edge Function 병렬 + 배치 |
| 벡터 검색 | < 100ms (10만 청크 기준) | ivfflat 인덱스 + 적절한 lists |

### 캐싱 전략

- 정적 페이지: `revalidate = 3600` (1시간)
- 자주 묻는 AI 질문: Vercel Runtime Cache (해시 기반 키)
- 임베딩: 동일 텍스트는 재사용 (DB에 저장)

---

## 14. 접근성 통합 (구현 수준)

이 KB는 사용자 다수가 장애인이므로 **접근성이 협상 불가**입니다. 구현 시 강제 원칙:

1. **시맨틱 HTML 우선** — `<article>`, `<section>`, `<nav>`, `<aside>` 정확히 사용
2. **모든 인터랙티브 요소 키보드 접근 가능** — Radix UI 기본 제공
3. **AI 채팅 영역 `aria-live="polite"`** — 스트리밍 응답 화면 낭독기 전달
4. **이미지·미디어 alt text 의무화** — `accessibility.alt_text_complete` 필수
5. **고대비 모드 + 글자 크기 조절** — 기존 webfortd 접근성 도구 유지
6. **Skip Link** — 메인 콘텐츠 바로가기
7. **포커스 시각 표시** — focus-visible ring 명확
8. **에디터 접근성** — Tiptap은 keyboard accessible, 메타데이터 폼은 react-hook-form + zod로 명확한 에러 표시

### 자체 검증 도구

- Phase 2 완료 시 axe-core 자동 테스트 추가
- Phase 4 완료 시 화면 낭독기(VoiceOver, NVDA)로 시나리오 테스트
- 사용자 본인이 모든 단계에서 직접 사용 검증 가능 → 가장 강력한 검증

---

## 15. 짝 문서 (사업 측면)

KB의 사업 가치·거버넌스·운영 측면은 다음 문서를 참조:

```
~/Library/CloudStorage/GoogleDrive-khudt@khudt.net/Shared drives/
  └── 장교조 공유 드라이브/17. 교육부 및 교육청 등 정책연구/2026년 교육부 정책연구/
      └── [과제 5[ 정보 지원 웹페이지 개발 및 운영/1. 자문 메모/
          └── 260514_KB설계_사업측면.md
```

해당 문서는 사업 정체성·검수 거버넌스·예산·협상 카드를 중심으로 다룸.

---

## 부록 A. 외주 개발자 OnBoarding 체크리스트

외주 개발자에게 작업을 위임할 경우 다음을 전달:

1. 이 문서 (`KB_ARCHITECTURE.md`)
2. 짝 문서 (`260514_KB설계_사업측면.md`)
3. webfortd 루트의 `CLAUDE.md` (프로젝트 정체성)
4. 자문 디렉터리의 작년 자문 의견서 (`2025/CLAUDE.md`)
5. Supabase 프로젝트 액세스 (장교조 명의 후 초대)
6. 작년 자료 PDF (마이그레이션 대상)
7. **금지 사항**: Vue 재구축 제안, webfortd 폐기, 외부 SaaS(Notion 등) 통합

## 부록 B. 변경 이력

| 일자 | 변경 내용 |
|------|----------|
| 2026-05-14 | 최초 작성 (개발 측면). 짝 문서와 동시 작성 |
| 2026-05-16 | v2 — 마크다운 정본 + 도구 어댑터 framing으로 재정렬. §0 콘텐츠 정본 원칙 신설, §5 Tiptap 단일 에디터 사양을 편집 도구 어댑터 + 빌드 파이프라인으로 교체, Document 스키마의 `content_json` 제거하고 `content_md` + `source_path`를 정본 캐시로 정의, Phase 1을 콘텐츠 저장소·빌드 파이프라인 중심으로 재정의, Tiptap 의존성을 옵션화. 2025 자문 의견서 1순위 권고(MkDocs 마크다운 정본)와의 정합성을 명시. |
| 2026-05-17 | §2 Taxonomy를 Phase 1 v1 잠정안으로 표기(운영 중 보정 가능). Phase 1 실행 계획서(`~/.claude/plans/sprightly-honking-wave.md`) 작성, Supabase는 Phase 1 보류 결정. 출처 마크다운 5개(docparse 최종본)와 원본 PDF 4개를 자문 디렉터리 `2025/data/`에서 `2026/data/`로 이관, webfortd `data/source-md/`·`data/source-pdf/`로 복사. M3 분해 입력 영역 확정. |
