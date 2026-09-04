/**
 * Seal edge detection (SA1): fixtures come from sealPlaceholderPng itself —
 * known geometry, known ink color. The detector must find the placeholder
 * seal's bounding box on transparent and white backgrounds, classify its
 * shape, reject text/noise pages, and convert pixels to mm at scan DPI.
 */
import { describe, expect, it } from 'vitest'
import { detectSeal, detectedSizeMm } from '../src/renderer/seal-detect'
import { sealPlaceholderPng } from '../src/renderer/govt-seal'

/** decode a palette PNG produced by sealPlaceholderPng into RGBA + dimensions */
function sealToRgba(png: Uint8Array): { rgba: Uint8Array; width: number; height: number } {
  // walk chunks
  let width = 0
  let height = 0
  let palette: Uint8Array = new Uint8Array()
  let alpha: Uint8Array = new Uint8Array()
  let zlib: Uint8Array | null = null
  let at = 8
  while (at < png.length) {
    const len = (png[at]! << 24) | (png[at + 1]! << 16) | (png[at + 2]! << 8) | png[at + 3]!
    const type = String.fromCharCode(png[at + 4]!, png[at + 5]!, png[at + 6]!, png[at + 7]!)
    const data = png.subarray(at + 8, at + 8 + len)
    if (type === 'IHDR') {
      width = (data[0]! << 24) | (data[1]! << 16) | (data[2]! << 8) | data[3]!
      height = (data[4]! << 24) | (data[5]! << 16) | (data[6]! << 8) | data[7]!
    } else if (type === 'PLTE') palette = data
    else if (type === 'tRNS') alpha = data
    else if (type === 'IDAT') zlib = zlib ? concat(zlib, data) : data
    at += 12 + len
  }
  function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
    const out = new Uint8Array(a.length + b.length)
    out.set(a)
    out.set(b, a.length)
    return out
  }
  // stored-deflate decode (matching the encoder)
  const raw = storedInflate(zlib!)
  const rgba = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = raw[y * (width + 1) + 1 + x]!
      const o = (y * width + x) * 4
      rgba[o] = palette[idx * 3]!
      rgba[o + 1] = palette[idx * 3 + 1]!
      rgba[o + 2] = palette[idx * 3 + 2]!
      rgba[o + 3] = alpha[idx] ?? 255
    }
  }
  return { rgba, width, height }
}

function storedInflate(z: Uint8Array): Uint8Array {
  let p = 2
  const chunks: Uint8Array[] = []
  for (;;) {
    const final = z[p]!
    const len = z[p + 1]! | (z[p + 2]! << 8)
    chunks.push(z.subarray(p + 5, p + 5 + len))
    p += 5 + len
    if (final) break
  }
  const total = chunks.reduce((n, c) => n + c.length, 0)
  const out = new Uint8Array(total)
  let at = 0
  for (const c of chunks) {
    out.set(c, at)
    at += c.length
  }
  return out
}

/** white-background page with the seal centered at (ox, oy) */
function pageWithSeal(seal: Uint8Array, pageW: number, pageH: number, ox: number, oy: number): {
  rgba: Uint8Array
  width: number
  height: number
} {
  const { rgba: sealRgba, width: sw, height: sh } = sealToRgba(seal)
  const rgba = new Uint8Array(pageW * pageH * 4)
  for (let i = 0; i < pageW * pageH; i++) {
    rgba[i * 4] = 255
    rgba[i * 4 + 1] = 255
    rgba[i * 4 + 2] = 255
    rgba[i * 4 + 3] = 255
  }
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const so = (y * sw + x) * 4
      if (sealRgba[so + 3] === 0) continue
      const px = ox + x
      const py = oy + y
      if (px < 0 || py < 0 || px >= pageW || py >= pageH) continue
      const o = (py * pageW + px) * 4
      rgba[o] = sealRgba[so]!
      rgba[o + 1] = sealRgba[so + 1]!
      rgba[o + 2] = sealRgba[so + 2]!
      rgba[o + 3] = 255
    }
  }
  return { rgba, width: pageW, height: pageH }
}

describe('detectSeal', () => {
  it('finds the placeholder seal on a white page (circle, correct bounds)', () => {
    // the default placeholder raster is 96dpi: 40mm → 151px; page 300×450
    const seal = sealPlaceholderPng({ diameterMm: 40 })
    const page = pageWithSeal(seal, 300, 450, 70, 140)
    const hit = detectSeal(page.rgba, page.width, page.height)
    expect(hit).not.toBeNull()
    expect(hit!.shape).toBe('circle')
    expect(hit!.width).toBeGreaterThan(140)
    expect(hit!.height).toBeGreaterThan(140)
    expect(hit!.x).toBeGreaterThanOrEqual(65)
    expect(hit!.x + hit!.width).toBeLessThanOrEqual(230)
    expect(hit!.coverage).toBeGreaterThan(0.1)
  })

  it('returns null on a text-only page', () => {
    // black "text" strokes on white
    const rgba = new Uint8Array(300 * 200 * 4).fill(255)
    for (let y = 50; y < 60; y++)
      for (let x = 40; x < 260; x++) {
        const o = (y * 300 + x) * 4
        rgba[o] = 0
        rgba[o + 1] = 0
        rgba[o + 2] = 0
      }
    expect(detectSeal(rgba, 300, 200)).toBeNull()
  })

  it('rejects noise below the component floor', () => {
    const rgba = new Uint8Array(200 * 200 * 4).fill(255)
    // sparse single red pixels scattered (no component above the floor)
    for (let i = 0; i < 50; i++) {
      const idx = (i * 7919) % (200 * 200)
      const o = idx * 4
      rgba[o] = 200
      rgba[o + 3] = 255
    }
    expect(detectSeal(rgba, 200, 200, { minPixels: 400 })).toBeNull()
  })

  it('separates the seal from red text elsewhere (largest component wins)', () => {
    const seal = sealPlaceholderPng({ diameterMm: 40 })
    const page = pageWithSeal(seal, 400, 600, 80, 180)
    // add a red word top-left: a 60×10 bar (600 px < seal component)
    for (let y = 20; y < 30; y++)
      for (let x = 20; x < 80; x++) {
        const o = (y * 400 + x) * 4
        page.rgba[o] = 200
      }
    const hit = detectSeal(page.rgba, page.width, page.height)!
    // the reported box is the seal's, not the bar's
    expect(hit!.y).toBeGreaterThan(150)
  })

  it('detects a hollow ring as circle even at low fill (placeholder coverage)', () => {
    const seal = sealPlaceholderPng({ diameterMm: 40 })
    const { rgba, width, height } = sealToRgba(seal)
    const hit = detectSeal(rgba, width, height)!
    expect(hit!.shape).toBe('circle')
    // hollow ring + star fills well under a filled rect
    expect(hit!.coverage).toBeLessThan(0.9)
  })

  it('converts pixels to mm at scan DPI', () => {
    expect(detectedSizeMm(236, 150)).toBeCloseTo(40.0, 0)
    expect(detectedSizeMm(472, 300)).toBeCloseTo(39.9, 0)
    expect(detectedSizeMm(236)).toBeCloseTo(20.0, 0) // default 300dpi
  })
})
