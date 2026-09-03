/**
 * GB/T 9704 official-seal placeholder: a red ring + five-pointed star raster
 * plus its NewImage spec for the standard save path (genImage attrs ->
 * kind:'image' -> media part + anchored drawing), so a future UI only drops
 * the returned spec onto the date paragraph and the engine does the rest.
 *
 * The raster is built without an imaging dependency: palette PNG (color type
 * 3) with stored (uncompressed) deflate blocks — node:zlib does not exist in
 * the renderer, and stored blocks are ~10 lines of code. Antialiasing comes
 * from 4x4 supersampling whose coverage maps 1:1 onto the 16 palette alpha
 * levels.
 */

import type { NewImage } from '@genoffice/docx-engine'
import { GB_A4, GB_MARGINS } from './govt-template'

export interface SealPlaceholderOptions {
  /** seal diameter in mm (a standard round official seal is 40 mm) */
  diameterMm?: number
  /** ring thickness in mm */
  ringMm?: number
  /** five-pointed star outer radius in mm */
  starMm?: number
  /** seal red as hex without # (defaults to the same red as the banner) */
  color?: string
  /**
   * organization name set in an arc along the upper ring band (the classic
   * round-seal layout). Glyphs are rendered from a built-in 5x7 stroke
   * bitmap for ASCII; CJK chars render as solid boxes (stroke fonts for han
   * are out of scope for a placeholder) so the arc layout stays legible.
   * Omit = no text, the minimal placeholder.
   */
  orgName?: string
  /** glyph height of the arc text in mm (default 3.2) */
  textMm?: number
}

const MM_PER_INCH = 25.4
/** raster density at 96 dpi — matches the px -> EMU conversion at save time */
const PX_PER_MM = 96 / MM_PER_INCH
const EMU_PER_MM = 914400 / MM_PER_INCH
/** 1 twip = 635 EMU */
const EMU_PER_TWIP = 635
/** the date sits two body chars from the right margin (signature block) */
const DATE_INSET_TWIPS = 640
/** the default date (2026-9-1 style) spans ~6 fullwidth chars at size-3 (320 twips) */
const DATE_FULLWIDTH_CHARS = 6
const DATE_CHAR_TWIPS = 320

/** four-point star of a five-pointed one: R_in = R_out * sin(18deg) / sin(54deg) */
const STAR_INNER_RATIO = Math.sin(Math.PI / 10) / Math.sin(Math.PI * 3 / 10)

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (const b of bytes) {
    c ^= b
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  return (c ^ 0xffffffff) >>> 0
}

function adler32(bytes: Uint8Array): number {
  let a = 1
  let b = 0
  for (const x of bytes) {
    a = (a + x) % 65521
    b = (b + a) % 65521
  }
  return ((b << 16) | a) >>> 0
}

function putU32(out: Uint8Array, at: number, v: number): void {
  out[at] = (v >>> 24) & 0xff
  out[at + 1] = (v >>> 16) & 0xff
  out[at + 2] = (v >>> 8) & 0xff
  out[at + 3] = v & 0xff
}

function putU16(out: Uint8Array, at: number, v: number): void {
  out[at] = v & 0xff
  out[at + 1] = (v >>> 8) & 0xff
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  putU32(out, 0, data.length)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(data, 8)
  putU32(out, 8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

/** zlib stream of stored (BTYPE=00) deflate blocks — no compression, valid PNG */
function zlibStored(raw: Uint8Array): Uint8Array {
  const blocks = Math.ceil(raw.length / 65535) || 1
  const out = new Uint8Array(2 + raw.length + blocks * 5 + 4)
  out[0] = 0x78
  out[1] = 0x01
  let at = 2
  for (let i = 0; i < blocks; i++) {
    const len = Math.min(65535, raw.length - i * 65535)
    out[at] = i === blocks - 1 ? 1 : 0
    putU16(out, at + 1, len)
    putU16(out, at + 3, ~len & 0xffff)
    out.set(raw.subarray(i * 65535, i * 65535 + len), at + 5)
    at += 5 + len
  }
  putU32(out, at, adler32(raw))
  return out
}

function base64Of(bytes: Uint8Array): string {
  let bin = ''
  const step = 0x8000
  for (let i = 0; i < bytes.length; i += step) {
    bin += String.fromCharCode(...bytes.subarray(i, i + step))
  }
  return btoa(bin)
}

/** point inside the five-pointed star polygon (ray-crossing test) */
function inStar(dxMm: number, dyMm: number, outerMm: number): boolean {
  const innerMm = outerMm * STAR_INNER_RATIO
  let inside = false
  // k=0 vertex: outer point, straight up (same formula as the loop below)
  let prevX = 0
  let prevY = -outerMm
  for (let k = 1; k <= 10; k++) {
    const angle = (k * Math.PI) / 5
    const r = k % 2 === 0 ? outerMm : innerMm
    const x = r * Math.sin(angle)
    const y = -r * Math.cos(angle)
    if (y > dyMm !== prevY > dyMm && dxMm < ((prevX - x) * (dyMm - y)) / (prevY - y) + x) {
      inside = !inside
    }
    prevX = x
    prevY = y
  }
  return inside
}

/**
 * 5x7 stroke bitmaps for the ASCII letters/digits the placeholder needs
 * (covers latin organization names); each row is a 5-bit mask, MSB left.
 * CJK glyphs would need a stroke font — out of scope for a placeholder, so
 * han chars render as full boxes sized like the ASCII glyphs (the arc
 * layout and counts stay legible; a real seal replaces the whole image).
 */
const GLYPHS: Record<string, number[]> = {
  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  B: [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  D: [0b11100, 0b10010, 0b10001, 0b10001, 0b10001, 0b10010, 0b11100],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  I: [0b01110, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  J: [0b00111, 0b00010, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  M: [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  Q: [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  X: [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  Z: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  ' ': [0, 0, 0, 0, 0, 0, 0],
}

/**
 * Paint one glyph bitmap into `coverage` (sizePx^2), centred at (cx,cy) px
 * and rotated by `rot` radians (0 = upright; the arc layout rotates each
 * glyph so its baseline is tangent to the text circle, reading clockwise).
 * Inverse-mapping: every pixel in the glyph's rotated bounding box samples
 * the bitmap, supersampling 2x2 for clean rotated edges.
 */
function paintGlyph(
  coverage: Float32Array,
  sizePx: number,
  cx: number,
  cy: number,
  wPx: number,
  hPx: number,
  rows: number[] | null,
  rot: number,
): void {
  const gw = rows ? 5 : 4
  const gh = rows ? 7 : 5
  const cos = Math.cos(-rot)
  const sin = Math.sin(-rot)
  const halfW = wPx / 2
  const halfH = hPx / 2
  const bound = Math.ceil(Math.hypot(halfW, halfH))
  for (let dy = -bound; dy <= bound; dy++) {
    for (let dx = -bound; dx <= bound; dx++) {
      // 2x2 supersampling inside each target pixel
      for (let sy = 0; sy < 2; sy++) {
        for (let sx = 0; sx < 2; sx++) {
          const px = dx + (sx + 0.5) / 2
          const py = dy + (sy + 0.5) / 2
          // rotate the sample point into glyph-local space
          const lx = halfW + px * cos - py * sin
          const ly = halfH + px * sin + py * cos
          if (lx < 0 || ly < 0 || lx >= wPx || ly >= hPx) continue
          const gx = Math.min(gw - 1, Math.floor((lx / wPx) * gw))
          const gy = Math.min(gh - 1, Math.floor((ly / hPx) * gh))
          const on = rows ? (rows[gy]! & (1 << (4 - gx))) !== 0 : true
          if (!on) continue
          const x = Math.round(cx + px)
          const y = Math.round(cy + py)
          if (x < 0 || y < 0 || x >= sizePx || y >= sizePx) continue
          // glyph pixels count as fully covered (16 = the ring/star
          // supersample ceiling); a stroke bitmap has no partial coverage
          coverage[y * sizePx + x] += 4
        }
      }
    }
  }
}

/**
 * The placeholder raster: red ring + centered five-pointed star, optionally
 * with the organization name set in an arc along the upper ring band (the
 * classic round-seal layout — glyphs radiate outward, reading clockwise).
 */
export function sealPlaceholderPng(options: SealPlaceholderOptions = {}): Uint8Array {
  const diameterMm = options.diameterMm ?? 40
  const ringMm = options.ringMm ?? 1.5
  const starMm = options.starMm ?? 8
  const color = options.color ?? 'FF0000'
  const sizePx = Math.round(diameterMm * PX_PER_MM)
  const pxPerMm = sizePx / diameterMm
  const halfMm = diameterMm / 2
  const rMid = halfMm - ringMm / 2
  const rHalf = ringMm / 2

  const r = parseInt(color.slice(0, 2), 16)
  const g = parseInt(color.slice(2, 4), 16)
  const b = parseInt(color.slice(4, 6), 16)

  // per-pixel coverage accumulator (supersample hits); clamped to 16 alpha levels
  const coverage = new Float32Array(sizePx * sizePx)
  const SUB = 4
  for (let py = 0; py < sizePx; py++) {
    for (let px = 0; px < sizePx; px++) {
      let hit = 0
      for (let sy = 0; sy < SUB; sy++) {
        for (let sx = 0; sx < SUB; sx++) {
          const xMm = (px + (sx + 0.5) / SUB) / pxPerMm - halfMm
          const yMm = (py + (sy + 0.5) / SUB) / pxPerMm - halfMm
          const d = Math.sqrt(xMm * xMm + yMm * yMm)
          if ((Math.abs(d - rMid) <= rHalf || inStar(xMm, yMm, starMm)) && d <= halfMm) hit++
        }
      }
      if (hit > 0) coverage[py * sizePx + px] += hit
    }
  }

  // arc org-name along the upper ring band, centered at 12 o'clock, glyphs
  // radiating outward. Text radius sits mid-band; step angle derives from the
  // glyph advance so names of any length spread symmetrically.
  const orgName = options.orgName
  if (orgName && orgName.trim() !== '') {
    const textMm = options.textMm ?? 3.2
    const hPx = Math.max(4, Math.round(textMm * pxPerMm))
    const chars = [...orgName.trim()]
    const textRadiusMm = halfMm - ringMm - textMm / 2 - 0.2
    const charWmm = textMm * 0.8
    const totalArcMm = chars.length * charWmm
    const totalAngle = Math.min(Math.PI, totalArcMm / textRadiusMm)
    let angle = Math.PI / 2 + totalAngle / 2 // start at the left end of the arc
    for (const ch of chars) {
      const cxMm = textRadiusMm * Math.cos(angle)
      const cyMm = textRadiusMm * Math.sin(angle)
      const cxPx = halfMm * pxPerMm + cxMm * pxPerMm
      const cyPx = halfMm * pxPerMm - cyMm * pxPerMm
      const wPx = Math.max(3, Math.round(charWmm * pxPerMm))
      const rows = /[A-Z0-9 ]/.test(ch)
        ? (GLYPHS[ch === ' ' ? ' ' : ch] ?? GLYPHS[ch.toUpperCase()] ?? null)
        : /[a-z]/.test(ch)
          ? (GLYPHS[ch.toUpperCase()] ?? null)
          : null // CJK/fullwidth: solid box
      // baseline tangent to the circle, glyph top outward: screen-y is
      // flipped, so the rotation is the mirror of the polar angle
      paintGlyph(coverage, sizePx, cxPx, cyPx, wPx, hPx, rows, Math.PI / 2 - angle)
      angle -= charWmm / textRadiusMm
    }
  }

  const levels = 16
  const raw = new Uint8Array(sizePx * (1 + sizePx))
  for (let py = 0; py < sizePx; py++) {
    const row = py * (1 + sizePx)
    raw[row] = 0 // filter: none
    for (let px = 0; px < sizePx; px++) {
      // ring/star supersample hits + glyph pixel coverage (each glyph pixel is
      // one full hit), clamped to the 16-level alpha ramp
      raw[row + 1 + px] = Math.min(levels - 1, Math.round(coverage[py * sizePx + px]))
    }
  }

  const ihdr = new Uint8Array(13)
  putU32(ihdr, 0, sizePx)
  putU32(ihdr, 4, sizePx)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 3 // color type: indexed
  const plte = new Uint8Array(levels * 3)
  for (let i = 0; i < levels; i++) {
    plte[i * 3] = r
    plte[i * 3 + 1] = g
    plte[i * 3 + 2] = b
  }
  const trns = new Uint8Array(levels)
  for (let i = 0; i < levels; i++) trns[i] = Math.min(255, i * 17)

  const ihdrChunk = chunk('IHDR', ihdr)
  const plteChunk = chunk('PLTE', plte)
  const trnsChunk = chunk('tRNS', trns)
  const idatChunk = chunk('IDAT', zlibStored(raw))
  const iendChunk = chunk('IEND', new Uint8Array(0))
  const total =
    8 + ihdrChunk.length + plteChunk.length + trnsChunk.length + idatChunk.length + iendChunk.length
  const png = new Uint8Array(total)
  png.set([137, 80, 78, 71, 13, 10, 26, 10], 0)
  let at = 8
  for (const c of [ihdrChunk, plteChunk, trnsChunk, idatChunk, iendChunk]) {
    png.set(c, at)
    at += c.length
  }
  return png
}

/**
 * The seal spec for the save path, positioned per the riding convention
 * (the seal presses over the issue date, centred on the date text and half
 * rising above the anchor line). Anchor it to the date paragraph; the offsets
 * are estimates of the date text box — the editor allows a drag fix-up.
 */
export function govtSealImage(options: SealPlaceholderOptions = {}): NewImage {
  const diameterMm = options.diameterMm ?? 40
  const sealTwips = (diameterMm / MM_PER_INCH) * 1440
  const sealEmu = Math.round(diameterMm * EMU_PER_MM)
  const columnTwips = GB_A4.width - GB_MARGINS.left - GB_MARGINS.right
  const centerTwips =
    columnTwips - DATE_INSET_TWIPS - (DATE_FULLWIDTH_CHARS * DATE_CHAR_TWIPS) / 2
  const px = Math.round((diameterMm / MM_PER_INCH) * 96)
  return {
    base64: base64Of(sealPlaceholderPng(options)),
    mime: 'image/png',
    widthPx: px,
    heightPx: px,
    wrap: 'front',
    posOffsetEmu: {
      x: Math.round((centerTwips - sealTwips / 2) * EMU_PER_TWIP),
      // half the seal rises above the anchor paragraph's top edge
      y: Math.round(-sealEmu / 2),
    },
  }
}
