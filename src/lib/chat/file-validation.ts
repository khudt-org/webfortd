/**
 * Phase 3 M7.2 — 첨부 파일 검증.
 *
 * spec §D3: 파일당 ≤10MB, 동시 1개.
 *
 * MIME 화이트리스트 (Q1=C):
 *   - PDF: application/pdf
 *   - HWP: application/x-hwp 또는 application/vnd.hancom.hwp
 *   - HWPX: application/vnd.hancom.hwpx (구버전은 application/zip 흡수)
 *   - 이미지: image/png · image/jpeg · image/webp
 *
 * HEIC는 첫 버전 X (Safari iOS 자동 변환 의존).
 */

export const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB (spec §D3)

export const ALLOWED_MIMES: readonly string[] = [
  'application/pdf',
  'application/x-hwp',
  'application/vnd.hancom.hwp',
  'application/vnd.hancom.hwpx',
  'image/png',
  'image/jpeg',
  'image/webp',
]

export type ValidationResult =
  | { ok: true }
  | { ok: false; reason: string }

/** 시그니처 판정에 필요한 앞부분 바이트 수(PDF 헤더 탐색 범위 1024 + 여유). */
export const SIGNATURE_PROBE_BYTES = 1032

const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] // HWP 5.x(OLE 복합 문서)
const ZIP = [0x50, 0x4b, 0x03, 0x04] // HWPX
const HWP3 = Array.from('HWP Document File', (c) => c.charCodeAt(0))
const PDF = Array.from('%PDF-', (c) => c.charCodeAt(0))

function startsWith(buf: Uint8Array, sig: number[], offset = 0): boolean {
  if (buf.length < offset + sig.length) return false
  return sig.every((b, i) => buf[offset + i] === b)
}

/**
 * 선언 MIME과 파일 앞부분 바이트(magic bytes)가 맞는지. 화이트리스트 밖 MIME은 false.
 * PDF는 명세상 헤더 앞 잡음이 허용돼 첫 1024바이트 안에서 `%PDF-`를 찾는다.
 */
export function matchesFileSignature(mime: string, buf: Uint8Array): boolean {
  switch (mime) {
    case 'application/pdf':
      for (let i = 0; i <= Math.min(1024, buf.length - PDF.length); i++) {
        if (startsWith(buf, PDF, i)) return true
      }
      return false
    case 'image/png':
      return startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    case 'image/jpeg':
      return startsWith(buf, [0xff, 0xd8, 0xff])
    case 'image/webp':
      return startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8)
    case 'application/x-hwp':
    case 'application/vnd.hancom.hwp':
      return startsWith(buf, OLE) || startsWith(buf, HWP3)
    case 'application/vnd.hancom.hwpx':
    case 'application/zip':
      return startsWith(buf, ZIP)
    default:
      return false
  }
}

export function validateAttachment(file: File): ValidationResult {
  if (file.size > MAX_FILE_SIZE) {
    return { ok: false, reason: '파일이 너무 커요. 10MB 이하만 가능해요.' }
  }
  // application/zip은 HWPX 구버전 흡수 — 위원장 실 사용 패턴 누적 후 strict 검토 carry
  const isAllowed = ALLOWED_MIMES.includes(file.type) || file.type === 'application/zip'
  if (!isAllowed) {
    return {
      ok: false,
      reason: `지원하지 않는 파일 형식이에요. PDF · HWP · HWPX · 이미지(PNG/JPEG/WEBP)만 첨부해 주세요. (현재: ${file.type || '알 수 없음'})`,
    }
  }
  return { ok: true }
}
