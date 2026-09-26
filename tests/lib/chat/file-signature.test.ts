/**
 * E6 — 첨부 파일 magic bytes 검사. 선언 MIME과 실제 파일 시그니처가 맞아야 통과한다.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { matchesFileSignature } from '@/lib/chat/file-validation'

const bytes = (...xs: number[]) => new Uint8Array(xs)
const ascii = (s: string) => new TextEncoder().encode(s)

const PDF = ascii('%PDF-1.7\n')
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0)
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10)
const WEBP = ascii('RIFF\x00\x00\x00\x00WEBPVP8 ')
const OLE = bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0)
const ZIP = bytes(0x50, 0x4b, 0x03, 0x04, 0x14, 0)

describe('matchesFileSignature', () => {
  it('형식별 올바른 시그니처는 통과', () => {
    assert.equal(matchesFileSignature('application/pdf', PDF), true)
    assert.equal(matchesFileSignature('image/png', PNG), true)
    assert.equal(matchesFileSignature('image/jpeg', JPEG), true)
    assert.equal(matchesFileSignature('image/webp', WEBP), true)
    assert.equal(matchesFileSignature('application/x-hwp', OLE), true)
    assert.equal(matchesFileSignature('application/vnd.hancom.hwp', OLE), true)
    assert.equal(matchesFileSignature('application/vnd.hancom.hwpx', ZIP), true)
    assert.equal(matchesFileSignature('application/zip', ZIP), true)
  })

  it('HWP 3.x 텍스트 헤더도 HWP로 인정', () => {
    assert.equal(matchesFileSignature('application/x-hwp', ascii('HWP Document File V3.00 ')), true)
  })

  it('PDF 헤더가 오프셋 0이 아니면 거부(실행 파일 뒤에 %PDF-만 심은 폴리글랏)', () => {
    const buf = new Uint8Array(500 + PDF.length)
    buf.set([0x4d, 0x5a, 0x90, 0x00], 0)
    buf.set(PDF, 500)
    assert.equal(matchesFileSignature('application/pdf', buf), false)
  })

  it('선언과 내용이 다르면 거부', () => {
    assert.equal(matchesFileSignature('image/png', JPEG), false)
    assert.equal(matchesFileSignature('application/pdf', ZIP), false)
    assert.equal(matchesFileSignature('application/vnd.hancom.hwpx', OLE), false)
    assert.equal(matchesFileSignature('application/x-hwp', ZIP), false)
    assert.equal(matchesFileSignature('image/webp', ascii('RIFF\x00\x00\x00\x00WAVEfmt ')), false)
  })

  it('비어 있거나 잘린 내용은 거부', () => {
    assert.equal(matchesFileSignature('image/png', bytes()), false)
    assert.equal(matchesFileSignature('image/png', bytes(0x89, 0x50)), false)
  })

  it('화이트리스트 밖 MIME은 거부', () => {
    assert.equal(matchesFileSignature('text/plain', ascii('hello')), false)
  })
})
