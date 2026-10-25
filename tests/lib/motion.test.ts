/**
 * src/lib/motion.ts — JS 모션 reduced-motion 게이트 단위 테스트.
 *
 * window/document를 globalThis에 주입해 4가지 분기(SSR·OS 설정·앱 설정·기본)를 검증한다.
 */
import { test, describe, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { prefersReducedMotion, motionScrollBehavior } from '../../src/lib/motion.ts'

type GlobalWithDom = Omit<typeof globalThis, 'window' | 'document'> & {
  window?: unknown
  document?: unknown
}

const g = globalThis as GlobalWithDom

function stubDom({ mediaMatches, hasClass }: { mediaMatches: boolean; hasClass: boolean }) {
  g.window = {
    matchMedia: (query: string) => ({ media: query, matches: mediaMatches }),
  }
  g.document = {
    documentElement: {
      classList: { contains: (cls: string) => hasClass && cls === 'reduce-motion' },
    },
  }
}

afterEach(() => {
  delete g.window
  delete g.document
})

describe('prefersReducedMotion', () => {
  test('window 부재(SSR)면 false', () => {
    delete g.window
    assert.strictEqual(prefersReducedMotion(), false)
  })

  test('OS prefers-reduced-motion이면 true', () => {
    stubDom({ mediaMatches: true, hasClass: false })
    assert.strictEqual(prefersReducedMotion(), true)
  })

  test('앱 내 reduce-motion 클래스면 true', () => {
    stubDom({ mediaMatches: false, hasClass: true })
    assert.strictEqual(prefersReducedMotion(), true)
  })

  test('둘 다 아니면 false', () => {
    stubDom({ mediaMatches: false, hasClass: false })
    assert.strictEqual(prefersReducedMotion(), false)
  })
})

describe('motionScrollBehavior', () => {
  test('reduced-motion이면 instant', () => {
    stubDom({ mediaMatches: true, hasClass: false })
    assert.strictEqual(motionScrollBehavior(), 'instant')
  })

  test('기본은 smooth', () => {
    stubDom({ mediaMatches: false, hasClass: false })
    assert.strictEqual(motionScrollBehavior(), 'smooth')
  })
})
