/**
 * Seal edge detection (asset center SA1, compliance-plan sibling): given a
 * scanned page or photo containing a stamp, find the stamp — the classic
 * vermillion-to-violet ink color range — and report its bounding box, shape
 * verdict (circle / ellipse / rect) and physical size hints.
 *
 * Pure-JS pipeline over RGBA pixels (canvas getImageData in the renderer, no
 * OpenCV):
 *   1. HSV filter: seal ink is a saturated warm red (H 330°–20°, S above a
 *      threshold) — black/blue text and white paper drop out naturally.
 *   2. Largest connected component (4-neighborhood BFS over the mask) —
 *      rejects stray red text spans elsewhere on the page.
 *   3. Bounding box of the component.
 *   4. Shape verdict: ink coverage of the box's inscribed ellipse vs the
 *      expectation for circle (aspect≈1) / ellipse / rect.
 *
 * Test fixtures: sealPlaceholderPng generates seals with known geometry on
 * transparent/white backgrounds.
 */

export interface SealDetection {
  /** bounding box in source pixels */
  x: number
  y: number
  width: number
  height: number
  /** verdict from aspect ratio + coverage */
  shape: 'circle' | 'ellipse' | 'rect'
  /** share of the bounding box covered by detected ink (0–1) */
  coverage: number
}

export interface SealDetectOptions {
  /** saturation floor 0–1 (default 0.35 — pale watermarks stay out) */
  minSaturation?: number
  /** hue window: center 0 = red, half-width in degrees (default 25 → 335°–25°) */
  hueHalfWidthDeg?: number
  /** minimum component size in px (noise floor, default 400) */
  minPixels?: number
}

/** RGB → HSV; h in degrees 0–360, s/v 0–1 */
function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r) h = (60 * ((g - b) / d) + 360) % 360
    else if (max === g) h = 60 * ((b - r) / d) + 120
    else h = 60 * ((r - g) / d) + 240
  }
  return { h, s: max === 0 ? 0 : d / max, v: max }
}

function isSealInk(
  r: number,
  g: number,
  b: number,
  minSat: number,
  hueHalf: number,
): boolean {
  const { h, s, v } = rgbToHsv(r, g, b)
  if (v < 0.15) return false // near-black text
  if (s < minSat) return false // grays / pale watermarks
  // warm red band wrapping around 0° (330°–360° and 0°–hueHalf)
  return h >= 360 - hueHalf || h <= hueHalf
}

/**
 * Detect the largest seal-shaped ink component in an RGBA pixel buffer.
 * Returns null when nothing seal-like is found.
 */
export function detectSeal(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  options: SealDetectOptions = {},
): SealDetection | null {
  const minSat = options.minSaturation ?? 0.35
  const hueHalf = options.hueHalfWidthDeg ?? 25
  const minPixels = options.minPixels ?? 400

  const total = width * height
  const mask = new Uint8Array(total)
  let inkCount = 0
  for (let i = 0; i < total; i++) {
    const o = i * 4
    if (rgba[o + 3] === 0) continue // fully transparent
    if (isSealInk(rgba[o]!, rgba[o + 1]!, rgba[o + 2]!, minSat, hueHalf)) {
      mask[i] = 1
      inkCount++
    }
  }
  if (inkCount < minPixels) return null

  // largest 4-neighborhood component via iterative BFS (no recursion)
  const visited = new Uint8Array(total)
  let best: { count: number; x0: number; y0: number; x1: number; y1: number } | null = null
  const queue = new Int32Array(total)
  for (let start = 0; start < total; start++) {
    if (!mask[start] || visited[start]) continue
    let head = 0
    let tail = 0
    queue[tail++] = start
    visited[start] = 1
    let count = 0
    let x0 = width
    let y0 = height
    let x1 = 0
    let y1 = 0
    while (head < tail) {
      const idx = queue[head++]!
      count++
      const x = idx % width
      const y = (idx / width) | 0
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
      if (x > 0 && mask[idx - 1] && !visited[idx - 1]) {
        visited[idx - 1] = 1
        queue[tail++] = idx - 1
      }
      if (x < width - 1 && mask[idx + 1] && !visited[idx + 1]) {
        visited[idx + 1] = 1
        queue[tail++] = idx + 1
      }
      if (y > 0 && mask[idx - width] && !visited[idx - width]) {
        visited[idx - width] = 1
        queue[tail++] = idx - width
      }
      if (y < height - 1 && mask[idx + width] && !visited[idx + width]) {
        visited[idx + width] = 1
        queue[tail++] = idx + width
      }
    }
    if (!best || count > best.count) best = { count, x0, y0, x1, y1 }
  }
  if (!best || best.count < minPixels) return null

  const width2 = best.x1 - best.x0 + 1
  const height2 = best.y1 - best.y0 + 1
  // ink coverage of the bounding box decides rect vs round: a circle fills
  // π/4 ≈ 78.5% of its box; a filled rect ≈ 100%. Our ring+star placeholder
  // measures lower (hollow), so the boundary sits between.
  let boxInk = 0
  for (let y = best.y0; y <= best.y1; y++) {
    for (let x = best.x0; x <= best.x1; x++) {
      if (mask[y * width + x]) boxInk++
    }
  }
  const coverage = boxInk / (width2 * height2)
  const aspect = width2 / height2
  let shape: SealDetection['shape']
  if (coverage >= 0.9) shape = 'rect'
  else if (Math.abs(aspect - 1) <= 0.12) shape = 'circle'
  else shape = 'ellipse'
  return { x: best.x0, y: best.y0, width: width2, height: height2, shape, coverage }
}

/**
 * Convert a detected pixel size into physical mm given the scan DPI
 * (missing DPI = assume 300, the common scan default).
 */
export function detectedSizeMm(pixels: number, dpi = 300): number {
  return Math.round((pixels / dpi) * 25.4 * 10) / 10
}

/**
 * Wrap a detected seal crop into the placeholder-quality RGBA the asset
 * pipeline consumes (extracted from the page, cropped to the bounding box).
 * Returning a copy keeps the source page buffer untouched.
 */
export function cropRgba(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  box: { x: number; y: number; width: number; height: number },
): { rgba: Uint8Array; width: number; height: number } {
  const out = new Uint8Array(box.width * box.height * 4)
  for (let y = 0; y < box.height; y++) {
    for (let x = 0; x < box.width; x++) {
      const src = ((box.y + y) * width + (box.x + x)) * 4
      const dst = (y * box.width + x) * 4
      out[dst] = rgba[src]!
      out[dst + 1] = rgba[src + 1]!
      out[dst + 2] = rgba[src + 2]!
      out[dst + 3] = rgba[src + 3]!
    }
  }
  return { rgba: out, width: box.width, height: box.height }
}
