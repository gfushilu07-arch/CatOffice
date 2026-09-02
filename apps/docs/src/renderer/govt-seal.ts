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
 * The placeholder raster: red ring + centered five-pointed star on
 * transparency. No org-name text yet — a real seal (asset center) replaces
 * the whole image, so the placeholder stays minimal.
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

  const levels = 16
  const raw = new Uint8Array(sizePx * (1 + sizePx))
  for (let py = 0; py < sizePx; py++) {
    const row = py * (1 + sizePx)
    raw[row] = 0 // filter: none
    for (let px = 0; px < sizePx; px++) {
      let hit = 0
      for (let sy = 0; sy < 4; sy++) {
        for (let sx = 0; sx < 4; sx++) {
          const xMm = (px + (sx + 0.5) / 4) / pxPerMm - halfMm
          const yMm = (py + (sy + 0.5) / 4) / pxPerMm - halfMm
          const d = Math.sqrt(xMm * xMm + yMm * yMm)
          if ((Math.abs(d - rMid) <= rHalf || inStar(xMm, yMm, starMm)) && d <= halfMm) hit++
        }
      }
      // 16 subsamples map onto 16 alpha levels; the full-coverage 17th value
      // clamps onto the last palette index (255)
      raw[row + 1 + px] = Math.min(levels - 1, hit)
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
