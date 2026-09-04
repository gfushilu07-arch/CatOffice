/**
 * Seal library (SA2): CRUD round-trips over a temp root, persistence across
 * instances, stamp removal cleaning the image file, detection→library
 * integration (cropRgba output goes straight into addStamp), and defensive
 * parsing of hand-edited registry files.
 */
import { mkdtempSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  addStamp,
  entryExists,
  readLibrary,
  readStampImage,
  removeStamp,
  renameStamp,
} from '../src/renderer/seal-library'
import { cropRgba, detectSeal } from '../src/renderer/seal-detect'
import { sealPlaceholderPng } from '../src/renderer/govt-seal'

const dirs: string[] = []
afterEach(() => (dirs.length = 0))

const newRoot = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'seal-lib-'))
  dirs.push(dir)
  return dir
}

describe('seal library CRUD', () => {
  it('adds, lists, renames and reads a stamp image back', async () => {
    const root = newRoot()
    const png = sealPlaceholderPng()
    const entry = await addStamp(root, { name: '公章占位', shape: 'circle', png })
    expect(entry.mode).toBe('stamp')
    expect(await entryExists(root, entry.id)).toBe(true)
    expect((await readLibrary(root)).entries).toHaveLength(1)

    expect((await renameStamp(root, entry.id, '公司章'))).toBe(true)
    const lib = await readLibrary(root)
    expect(lib.entries[0]!.name).toBe('公司章')

    const img = await readStampImage(root, entry.id)
    expect(img).not.toBeNull()
    expect([...img!.png]).toEqual([...png])
  })

  it('persists across instances and parses defensively', async () => {
    const root = newRoot()
    await addStamp(root, { name: 'A', png: sealPlaceholderPng() })
    const lib = await readLibrary(root)
    expect(lib.entries).toHaveLength(1)

    // hand-edited garbage entries are dropped, good ones survive
    const path = join(root, 'library.json')
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { entries: unknown[] }
    parsed.entries.unshift({ id: 'bad', label: 42 })
    await import('node:fs/promises').then((fs) => fs.writeFile(path, JSON.stringify(parsed)))
    const after = await readLibrary(root)
    expect(after.entries).toHaveLength(1)
    expect(after.entries[0]!.name).toBe('A')
  })

  it('remove deletes metadata and the image file', async () => {
    const root = newRoot()
    const entry = await addStamp(root, { name: 'X', png: sealPlaceholderPng() })
    const imagePath = join(root, entry.image)
    expect(existsSync(imagePath)).toBe(true)
    expect(await removeStamp(root, entry.id)).toBe(true)
    expect(existsSync(imagePath)).toBe(false)
    expect((await readLibrary(root)).entries).toHaveLength(0)
    expect(await removeStamp(root, entry.id)).toBe(false)
  })
})

describe('detection → library integration (SA1 → SA2)', () => {
  it('detects a seal on a page, crops it, and libraries the crop', async () => {
    // page: white background, seal at a known offset
    const seal = sealPlaceholderPng({ diameterMm: 40 })
    const pageW = 300
    const pageH = 450
    const sealW = 151
    const ox = 70
    const oy = 140
    // decode the seal to RGBA via the stored-deflate palette layout
    const { rgba: sealRgba } = decodeSeal(seal)
    const rgba = new Uint8Array(pageW * pageH * 4).fill(255)
    for (let y = 0; y < sealW && y < 151; y++) {
      for (let x = 0; x < sealW && x < 151; x++) {
        const so = (y * 151 + x) * 4
        if (sealRgba[so + 3] === 0) continue
        const o = ((oy + y) * pageW + (ox + x)) * 4
        rgba[o] = sealRgba[so]!
        rgba[o + 1] = sealRgba[so + 1]!
        rgba[o + 2] = sealRgba[so + 2]!
        rgba[o + 3] = 255
      }
    }
    const hit = detectSeal(rgba, pageW, pageH)
    expect(hit).not.toBeNull()
    const crop = cropRgba(rgba, pageW, hit!)
    expect(crop.width).toBe(hit!.width)

    const root = newRoot()
    const entry = await addStamp(root, {
      name: '检测章',
      shape: hit!.shape,
      sizeMm: { width: 40, height: 40 },
      png: crop.rgba,
    })
    expect(entry.shape).toBe('circle')
    const img = await readStampImage(root, entry.id)
    expect(img!.png.length).toBe(crop.rgba.length)
  })
})

/** decode helper reused from the detection fixture (kept local to avoid export churn) */
function decodeSeal(png: Uint8Array): { rgba: Uint8Array } {
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
  return { rgba }
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
