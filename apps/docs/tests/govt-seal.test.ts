/**
 * GB/T 9704 seal placeholder: the raster must decode (palette PNG with stored
 * deflate blocks — the renderer-safe codec) and the NewImage spec must ride
 * the real save path (kind:'image' -> media part + wp:anchor) with the
 * riding-the-date offsets intact.
 */

import { describe, expect, it } from 'vitest'
import { parseDocx, saveDocx } from '@genoffice/docx-engine'
import JSZip from 'jszip'
import { buildDocx } from '../../../packages/docx-engine/tests/helpers/build-docx'
import { govtSealImage, sealPlaceholderPng } from '../src/renderer/govt-seal'

interface DecodedPng {
  width: number
  height: number
  bitDepth: number
  colorType: number
  palette: Uint8Array
  alpha: Uint8Array
  indexed: Uint8Array
}

/** Walk chunks and manually decode the stored-block zlib stream (filter 0). */
function decodePlaceholderPng(bytes: Uint8Array): DecodedPng {
  expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  let palette: Uint8Array = new Uint8Array(0)
  let alpha: Uint8Array = new Uint8Array(0)
  let zlib: Uint8Array | null = null
  let at = 8
  while (at < bytes.length) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + at)
    const len = view.getUint32(0)
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8))
    const data = bytes.subarray(at + 8, at + 8 + len)
    if (type === 'IHDR') {
      const v = new DataView(data.buffer, data.byteOffset)
      width = v.getUint32(0)
      height = v.getUint32(4)
      bitDepth = data[8]!
      colorType = data[9]!
    } else if (type === 'PLTE') palette = data
    else if (type === 'tRNS') alpha = data
    else if (type === 'IDAT') zlib = data
    at += 12 + len
    if (type === 'IEND') break
  }
  expect(zlib).not.toBeNull()
  const z = zlib!
  expect(z[0]).toBe(0x78)
  expect(((z[0]! << 8) | z[1]!) % 31).toBe(0) // valid zlib check bits
  let out = new Uint8Array(0)
  let p = 2
  for (;;) {
    const final = z[p]!
    const len = z[p + 1]! | (z[p + 2]! << 8)
    const nlen = z[p + 3]! | (z[p + 4]! << 8)
    expect(len).toBe(~nlen & 0xffff) // stored block: NLEN is the one's complement
    const grown = new Uint8Array(out.length + len)
    grown.set(out)
    grown.set(z.subarray(p + 5, p + 5 + len), out.length)
    out = grown
    p += 5 + len
    if (final) break
  }
  // adler32 over the decoded stream
  let a = 1
  let b = 0
  for (const x of out) {
    a = (a + x) % 65521
    b = (b + a) % 65521
  }
  expect(((b << 16) | a) >>> 0).toBe(
    ((z[p]! << 24) | (z[p + 1]! << 16) | (z[p + 2]! << 8) | z[p + 3]!) >>> 0,
  )
  expect(out.length).toBe(height * (1 + width))
  const indexed = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    expect(out[y * (1 + width)]).toBe(0) // filter: none
    indexed.set(out.subarray(y * (1 + width) + 1, y * (1 + width) + 1 + width), y * width)
  }
  return { width, height, bitDepth, colorType, palette, alpha, indexed }
}

const pixel = (png: DecodedPng, x: number, y: number) => {
  const i = png.indexed[y * png.width + x]!
  return { rgb: [...png.palette.subarray(i * 3, i * 3 + 3)], a: png.alpha[i]! }
}

describe('seal placeholder raster', () => {
  it('decodes as a square palette PNG with the ring/star alpha pattern', () => {
    const png = decodePlaceholderPng(sealPlaceholderPng())
    expect(png.colorType).toBe(3)
    expect(png.bitDepth).toBe(8)
    expect(png.width).toBe(png.height)
    const c = Math.floor(png.width / 2)
    // centre: inside the star, fully opaque seal red
    const center = pixel(png, c, c)
    expect(center.a).toBe(255)
    expect(center.rgb).toEqual([0xff, 0x00, 0x00])
    // top ring band: opaque
    expect(pixel(png, c, 2).a).toBe(255)
    // inside the circle between star and ring: transparent
    expect(pixel(png, c + Math.round(c * 0.4), c).a).toBe(0)
    // corner outside the circle: transparent
    expect(pixel(png, 2, 2).a).toBe(0)
  })

  it('honours custom geometry and color', () => {
    const png = decodePlaceholderPng(sealPlaceholderPng({ diameterMm: 30, color: 'C00000' }))
    expect(png.width).toBe(Math.round(30 * (96 / 25.4)))
    const c = Math.floor(png.width / 2)
    expect(pixel(png, c, c).rgb).toEqual([0xc0, 0x00, 0x00])
  })
})

describe('govtSealImage spec', () => {
  it('floats in front of the text, centred on the date line', () => {
    const seal = govtSealImage()
    expect(seal.mime).toBe('image/png')
    expect(seal.wrap).toBe('front')
    expect(seal.widthPx).toBe(seal.heightPx)
    const sealEmu = Math.round(40 * (914400 / 25.4))
    // rides the issue date: half the seal rises above the anchor paragraph
    expect(seal.posOffsetEmu!.y).toBe(-sealEmu / 2)
    // horizontal centre lands on the date text zone (2-char inset + ~6 chars)
    const columnTwips = 11906 - 1587 - 1474
    const centerTwips = columnTwips - 640 - (6 * 320) / 2
    expect(Math.abs((seal.posOffsetEmu!.x + sealEmu / 2) / 635 - centerTwips)).toBeLessThanOrEqual(1)
  })
})

describe('seal save path', () => {
  it('embeds the media part and reopens as a front-anchored drawing', async () => {
    const bytes = await buildDocx({
      bodyXml: '<w:p><w:r><w:t>2026年9月1日</w:t></w:r></w:p>',
    })
    const doc = await parseDocx(bytes)
    const seal = govtSealImage()
    const saved = await saveDocx(doc, [{ kind: 'image', image: seal }])
    const zip = await JSZip.loadAsync(saved)
    const media = Object.keys(zip.files).filter(
      (n) => n.startsWith('word/media/') && !n.endsWith('/'),
    )
    expect(media).toHaveLength(1)
    const mediaBytes = await zip.file(media[0]!)!.async('uint8array')
    expect([...mediaBytes.subarray(0, 4)]).toEqual([137, 80, 78, 71])
    const reparsed = await parseDocx(saved)
    const img = reparsed.blocks.filter((b) => !b.hidden).at(-1)!
    expect(img.type).toBe('image')
    expect(img.imageWrap).toBe('front')
    expect(img.imageOffsetXEmu).toBe(seal.posOffsetEmu!.x)
    expect(img.imageOffsetYEmu).toBe(seal.posOffsetEmu!.y)
  })
})
