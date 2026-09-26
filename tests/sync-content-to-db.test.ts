/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase JS client mock 17건은 의도된 any.
   PostgrestQueryBuilder<...> 등 정밀 타입 모사는 mock 단위 테스트 의도에 비해 비용 과다.
   test 파일이라 production 런타임 영향 0. */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  transformDocumentRow,
  upsertDocuments,
  syncWikiBacklinks,
  invertBacklinksToSourcePerspective,
  assertIdRowsComplete,
  planOrphanCleanup,
  fetchAllDocumentSlugs,
  deleteOrphanDocuments,
} from '../scripts/sync-content-to-db.ts'

describe('transformDocumentRow', () => {
  test('frontmatter.references → references_data 컬럼 매핑', () => {
    const doc = {
      slug: 'test-doc',
      axis: 'agreements' as const,
      filePath: 'content/agreements/test-doc.md',
      frontmatter: {
        title: '테스트',
        type: '지침' as const,
        disability_types: ['전체' as const],
        domains: ['정책법령' as const],
        regions: ['전국' as const],
        year: 2026,
        status: 'draft' as const,
        source: { organization: 'test', citation: 'test' },
        source_origin: 'test-doc',
        references: [{ citation: 'ref1', type: 'web' as const }],
        accessibility: {
          alt_text_complete: true,
          captions_available: false,
          reading_level: 'standard' as const,
          audio_tts_ready: false,
        },
        authors: [],
        reviewed_by: [],
        parent_headings: [],
      },
      body_excerpt: '본문 발췌',
    }
    const row = transformDocumentRow(doc, '본문 전체 마크다운', [])
    assert.equal(row.slug, 'test-doc')
    assert.equal(row.axis, 'agreements')
    assert.equal(row.source_path, 'content/agreements/test-doc.md')
    assert.equal(row.content_md, '본문 전체 마크다운')
    assert.deepEqual(row.references_data, [{ citation: 'ref1', type: 'web' }])
    // references 컬럼은 *없어야* 함 (SQL reserved word 회피)
    assert.equal('references' in row, false)
    // status는 draft (D1)
    assert.equal(row.status, 'draft')
  })

  test('frontmatter에 references 없을 때 references_data 빈 배열', () => {
    const doc = {
      slug: 'test-2',
      axis: 'policies' as const,
      filePath: 'content/policies/test-2.md',
      frontmatter: {
        title: '제목',
        type: '지침' as const,
        disability_types: ['시각' as const],
        domains: ['편의지원' as const],
        regions: ['전국' as const],
        year: 2025,
        status: 'draft' as const,
        source: { organization: 'org', citation: 'cite' },
        source_origin: 'test-2',
        references: [],
        accessibility: {
          alt_text_complete: true,
          captions_available: false,
          reading_level: 'standard' as const,
          audio_tts_ready: false,
        },
        authors: [],
        reviewed_by: [],
        parent_headings: [],
      },
      body_excerpt: '',
    }
    const row = transformDocumentRow(doc, '', [])
    assert.deepEqual(row.references_data, [])
  })

  test('disability_types가 단일 문자열이 아닌 배열', () => {
    const doc = {
      slug: 'multi-type',
      axis: 'disability-types' as const,
      filePath: 'content/disability-types/multi.md',
      frontmatter: {
        title: '복합',
        type: '안내서' as const,
        disability_types: ['시각' as const, '청각' as const],
        domains: ['인사관리' as const],
        regions: ['서울' as const],
        year: 2024,
        status: 'draft' as const,
        source: { organization: 'o', citation: 'c' },
        source_origin: 'multi',
        references: [],
        accessibility: {
          alt_text_complete: true,
          captions_available: false,
          reading_level: 'standard' as const,
          audio_tts_ready: false,
        },
        authors: [],
        reviewed_by: [],
        parent_headings: [],
      },
      body_excerpt: '',
    }
    const row = transformDocumentRow(doc, '본문', [])
    assert.deepEqual(row.disability_types, ['시각', '청각'])
  })

  test('B2: frontmatter.status=published → row.status=published 반영 (마크다운 정본)', () => {
    const doc = {
      slug: 'b2-parity',
      axis: 'policies' as const,
      filePath: 'content/policies/b2-parity.md',
      frontmatter: {
        title: '이미 published 상태인 문서',
        type: '지침' as const,
        disability_types: ['전체' as const],
        domains: ['정책법령' as const],
        regions: ['전국' as const],
        year: 2026,
        // B2: frontmatter status가 그대로 row.status로 반영됨 (마크다운이 정본).
        status: 'published' as const,
        source: { organization: 'o', citation: 'c' },
        source_origin: 'b2-parity-fixture',
        references: [],
        accessibility: {
          alt_text_complete: true,
          captions_available: false,
          reading_level: 'standard' as const,
          audio_tts_ready: false,
        },
        authors: [],
        reviewed_by: ['reviewer1'],
        parent_headings: [],
      },
      body_excerpt: '',
    }
    const row = transformDocumentRow(doc, '본문', [])
    assert.equal(row.status, 'published', 'B2 위반: frontmatter.status가 row.status로 반영 안 됨')
  })

  test('B2: frontmatter.status 누락 → row.status=draft fallback', () => {
    const doc = {
      slug: 'b2-fallback',
      axis: 'policies' as const,
      filePath: 'content/policies/b2-fallback.md',
      frontmatter: {
        title: 'status 없는 문서',
        type: '지침' as const,
        disability_types: ['전체' as const],
        domains: ['정책법령' as const],
        regions: ['전국' as const],
        year: 2026,
        source: { organization: 'o', citation: 'c' },
        source_origin: 'b2-fallback-fixture',
        references: [],
        accessibility: {
          alt_text_complete: true,
          captions_available: false,
          reading_level: 'standard' as const,
          audio_tts_ready: false,
        },
        authors: [],
        reviewed_by: [],
        parent_headings: [],
      },
      body_excerpt: '',
    } as never
    const row = transformDocumentRow(doc, '본문', [])
    assert.equal(row.status, 'draft', 'status 누락 시 draft fallback 안 됨')
  })

  test('wiki_links는 wikilink_adjacency를 source로 사용 (raw 추출 대신)', () => {
    const doc = {
      slug: 'test-wiki-links',
      axis: 'agreements' as const,
      filePath: 'content/agreements/test-wiki-links.md',
      frontmatter: {
        title: '테스트',
        type: '지침' as const,
        disability_types: ['전체' as const],
        domains: ['정책법령' as const],
        regions: ['전국' as const],
        year: 2026,
        status: 'draft' as const,
        source: { organization: 'o', citation: 'c' },
        source_origin: 'test-wiki-links',
        references: [],
        accessibility: {
          alt_text_complete: true,
          captions_available: false,
          reading_level: 'standard' as const,
          audio_tts_ready: false,
        },
        authors: [],
        reviewed_by: [],
        parent_headings: [],
      },
      body_excerpt: '',
    }
    // 본문에 [[fake-link]]가 코드블록 안에 있지만, adjacency는 'real-link'만 포함
    const contentMd = '본문 [[fake-link-in-code-block]] ```js\n[[ignored]]\n```'
    const adjacency = ['real-link'] // sync-content.ts가 마스킹 후 emit
    const row = transformDocumentRow(doc, contentMd, adjacency)
    // 코드블록 안 fake-link는 *없어야* 함, adjacency 그대로 사용
    assert.deepEqual(row.wiki_links, ['real-link'])
  })
})

describe('upsertDocuments (mocked client)', () => {
  test('빈 배열 → 0 batches', async () => {
    const upserted: any[] = []
    const mockClient = {
      from: () => ({
        upsert: async (rows: any[]) => {
          upserted.push(...rows)
          return { error: null }
        },
      }),
    } as any
    const result = await upsertDocuments(mockClient, [], { batchSize: 50 })
    assert.equal(result.totalUpserted, 0)
    assert.equal(upserted.length, 0)
  })

  test('150건 → 50 batch 3회', async () => {
    const upserted: any[] = []
    let batchCount = 0
    const mockClient = {
      from: () => ({
        upsert: async (rows: any[]) => {
          batchCount++
          upserted.push(...rows)
          return { error: null }
        },
      }),
    } as any
    const rows = Array.from({ length: 150 }, (_, i) => ({
      slug: `s-${i}`,
      title: `t-${i}`,
    })) as any
    const result = await upsertDocuments(mockClient, rows, { batchSize: 50 })
    assert.equal(result.totalUpserted, 150)
    assert.equal(batchCount, 3)
  })

  test('upsert 실패 → throw with row context', async () => {
    const mockClient = {
      from: () => ({
        upsert: async () => ({
          error: { code: 'PGRST', message: 'unique violation' },
        }),
      }),
    } as any
    await assert.rejects(
      () => upsertDocuments(mockClient, [{ slug: 'x' } as any], { batchSize: 50 }),
      /unique violation/,
    )
  })
})

describe('syncWikiBacklinks (mocked client)', () => {
  test('빈 인덱스 → 0 inserts', async () => {
    const ops: string[] = []
    const mockClient = {
      from: (table: string) => ({
        delete: () => ({
          in: async (_col: string, vals: string[]) => {
            ops.push(`delete:${table}:${vals.length}`)
            return { error: null }
          },
        }),
        insert: async (rows: any[]) => {
          ops.push(`insert:${table}:${rows.length}`)
          return { error: null }
        },
      }),
    } as any
    const result = await syncWikiBacklinks(mockClient, {}, {})
    assert.equal(result.totalInserted, 0)
    assert.equal(ops.length, 0)
  })

  test('3개 source × 평균 2 backlinks → delete + insert', async () => {
    const ops: any[] = []
    const mockClient = {
      from: (table: string) => ({
        delete: () => ({
          in: async (_col: string, vals: string[]) => {
            ops.push({ op: 'delete', table, n: vals.length })
            return { error: null }
          },
        }),
        insert: async (rows: any[]) => {
          ops.push({ op: 'insert', table, n: rows.length })
          return { error: null }
        },
      }),
    } as any
    const slugToId: Record<string, string> = {
      'a': 'id-a',
      'b': 'id-b',
      'c': 'id-c',
    }
    const backlinks: Record<string, { to: string; anchor?: string; link_text?: string }[]> = {
      'a': [{ to: 'b' }, { to: 'c', anchor: 'sec1' }],
      'b': [{ to: 'a' }],
      'c': [{ to: 'a' }, { to: 'b' }],
    }
    const result = await syncWikiBacklinks(mockClient, backlinks, slugToId)
    assert.equal(result.totalInserted, 5)
    // delete는 source_doc_id 배열로 한 번
    const deletes = ops.filter((o) => o.op === 'delete')
    assert.equal(deletes.length, 1)
    assert.equal(deletes[0].n, 3) // 3 source ids
  })

  test('slugToId에 없는 source → skip + warn (반환 미카운트)', async () => {
    const ops: any[] = []
    const mockClient = {
      from: (_table: string) => ({
        delete: () => ({
          in: async () => {
            ops.push('del')
            return { error: null }
          },
        }),
        insert: async (rows: any[]) => {
          ops.push(rows)
          return { error: null }
        },
      }),
    } as any
    const slugToId = { 'a': 'id-a' }
    const backlinks = {
      'a': [{ to: 'b' }], // a는 매핑됨
      'missing-slug': [{ to: 'a' }], // missing은 X
    }
    const result = await syncWikiBacklinks(mockClient, backlinks, slugToId)
    // missing-slug는 skip, 'a'만 inserted
    assert.equal(result.totalInserted, 1)
    assert.equal(result.skippedSources.length, 1)
    assert.equal(result.skippedSources[0], 'missing-slug')
  })
})

describe('invertBacklinksToSourcePerspective', () => {
  test('invertBacklinksToSourcePerspective: target perspective → source (with anchor pass-through)', () => {
    const byTarget = {
      'page-a': [{ from: 'page-b' }, { from: 'page-c', anchor: 'sec' }],
      'page-c': [{ from: 'page-a' }],
    }
    const bySource = invertBacklinksToSourcePerspective(byTarget)
    // page-b는 page-a를 가리킴 (anchor 없음)
    assert.deepEqual(bySource['page-b'], [{ to: 'page-a', anchor: undefined, link_text: undefined }])
    // page-c는 page-a를 가리킴 + page-a section 'sec' anchor 보존 (forward-compat)
    assert.deepEqual(bySource['page-c'], [{ to: 'page-a', anchor: 'sec', link_text: undefined }])
    // page-a는 page-c를 가리킴 (anchor 없음)
    assert.deepEqual(bySource['page-a'], [{ to: 'page-c', anchor: undefined, link_text: undefined }])
  })
})

describe('assertIdRowsComplete (paging guard)', () => {
  test('idRows.length < expectedCount → throw with 진단 메시지', () => {
    const idRows = Array.from({ length: 1000 }, (_, i) => ({
      id: `id-${i}`,
      slug: `s-${i}`,
    }))
    assert.throws(
      () => assertIdRowsComplete(idRows, 1500),
      /slug→id fetch 누락/,
    )
  })

  test('idRows.length === expectedCount → no throw', () => {
    const idRows = Array.from({ length: 535 }, (_, i) => ({
      id: `id-${i}`,
      slug: `s-${i}`,
    }))
    assert.doesNotThrow(() => assertIdRowsComplete(idRows, 535))
  })
})

describe('planOrphanCleanup (C9 ② 구 주소 행 정리)', () => {
  test('content에 없는 slug만 고아, 정렬해서 반환', () => {
    const plan = planOrphanCleanup(['c', 'a', 'b', 'old'], ['a', 'b', 'c', 'new'], { allowMassDelete: false })
    assert.deepEqual(plan.orphans, ['old'])
    assert.equal(plan.blocked, false)
  })

  test('고아가 DB의 과반이면 플래그 없이는 중단', () => {
    const plan = planOrphanCleanup(['o1', 'o2', 'k'], ['k'], { allowMassDelete: false })
    assert.equal(plan.blocked, true)
    assert.match(plan.reason!, /--allow-mass-delete/)
    assert.deepEqual(plan.orphans, ['o1', 'o2'])
  })

  test('정확히 절반은 과반이 아님', () => {
    assert.equal(planOrphanCleanup(['o', 'k'], ['k'], { allowMassDelete: false }).blocked, false)
  })

  test('--allow-mass-delete면 과반도 진행', () => {
    const plan = planOrphanCleanup(['o1', 'o2', 'k'], ['k'], { allowMassDelete: true })
    assert.equal(plan.blocked, false)
    assert.equal(plan.orphans.length, 2)
  })

  test('content 0건이면 플래그와 무관하게 중단', () => {
    const plan = planOrphanCleanup(['a'], [], { allowMassDelete: true })
    assert.equal(plan.blocked, true)
    assert.deepEqual(plan.orphans, [])
  })
})

describe('fetchAllDocumentSlugs / deleteOrphanDocuments (mocked client)', () => {
  test('페이지 크기만큼 차면 다음 페이지를 읽는다', async () => {
    const all = ['a', 'b', 'c', 'd', 'e']
    const ranges: string[] = []
    const mockClient = {
      from: () => ({
        select: () => ({
          order: () => ({
            range: async (from: number, to: number) => {
              ranges.push(`${from}-${to}`)
              return { data: all.slice(from, to + 1).map((slug) => ({ slug })), error: null, count: all.length }
            },
          }),
        }),
      }),
    } as any
    assert.deepEqual(await fetchAllDocumentSlugs(mockClient, 2), all)
    assert.deepEqual(ranges, ['0-1', '2-3', '4-5'])
  })

  test('서버가 pageSize보다 적게 잘라 주면(max_rows 불일치) 조기 종료 대신 throw', async () => {
    const all = ['a', 'b', 'c', 'd', 'e']
    const mockClient = {
      from: () => ({
        select: () => ({
          order: () => ({
            range: async (from: number) => ({
              data: all.slice(from, from + 1).map((slug) => ({ slug })),
              error: null,
              count: all.length,
            }),
          }),
        }),
      }),
    } as any
    await assert.rejects(fetchAllDocumentSlugs(mockClient, 2), /조회 누락/)
  })

  test('배치로 나눠 slug 기준 삭제, 오류는 throw', async () => {
    const calls: string[][] = []
    const mockClient = {
      from: (table: string) => ({
        delete: () => ({
          in: async (col: string, vals: string[]) => {
            assert.equal(table, 'documents')
            assert.equal(col, 'slug')
            calls.push(vals)
            return { error: null }
          },
        }),
      }),
    } as any
    assert.equal(await deleteOrphanDocuments(mockClient, ['a', 'b', 'c'], 2), 3)
    assert.deepEqual(calls, [['a', 'b'], ['c']])

    const failing = {
      from: () => ({ delete: () => ({ in: async () => ({ error: { message: 'boom' } }) }) }),
    } as any
    await assert.rejects(deleteOrphanDocuments(failing, ['x']), /boom/)
  })
})
