/**
 * CatSpark cloud OCR requester (L3): one page PNG in, an OcrRecognition-shaped
 * JSON out (the pdf2docx OcrRecognition contract, structurally duplicated here
 * so this package stays decoupled from the engine). The endpoint route mirrors
 * the embedded mock server's /api/ocr/recognize; the real CatSpark backend
 * serves the same contract.
 */

/** one recognized text line (0-1 normalized box, origin bottom-left, y up) */
export interface CloudOcrLine {
  text: string
  confidence: number
  box: { x0: number; y0: number; x1: number; y1: number }
  chars?: Array<{ text: string; box: CloudOcrLine['box'] }>
}

/** one page's cloud recognition */
export interface CloudOcrRecognition {
  lines: CloudOcrLine[]
  paperShare?: number
}

/** Endpoint base: the CatSpark cloud by default, overridable for tests. */
export function cloudOcrBase(): string {
  return env('CATSPARK_OCR_BASE') ?? apiUrl('/api/ocr')
}

import { apiUrl, attributionHeaders } from './index'

function env(name: string): string | undefined {
  const v = process.env[name]
  return v && v.trim() !== '' ? v.trim() : undefined
}

/**
 * Recognize one page render through the cloud. Resolves null on any failure
 * (network, non-200, malformed body) — the caller's per-page fallback treats
 * that exactly like an unavailable engine. `page` carries the point size the
 * pipeline hands its sync engines (the current contract ignores it; kept for
 * wire-protocol symmetry).
 */
export async function recognizeCloudOcr(
  png: Uint8Array,
  page: { widthPt: number; heightPt: number; index: number },
): Promise<CloudOcrRecognition | null> {
  let res: Response
  try {
    res = await fetch(`${cloudOcrBase()}/recognize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'image/png',
        ...attributionHeaders(cloudOcrBase()),
      },
      body: Uint8Array.from(png),
    })
  } catch {
    return null
  }
  if (!res.ok) return null
  try {
    const parsed: unknown = await res.json()
    if (!parsed || typeof parsed !== 'object') return null
    const lines = (parsed as { lines?: unknown }).lines
    if (!Array.isArray(lines)) return null
    const clean: CloudOcrLine[] = []
    for (const line of lines) {
      if (!line || typeof line !== 'object') continue
      const l = line as Record<string, unknown>
      const box = l.box as CloudOcrLine['box'] | undefined
      if (typeof l.text !== 'string' || typeof l.confidence !== 'number' || !box) continue
      clean.push({
        text: l.text,
        confidence: l.confidence,
        box: { x0: box.x0, y0: box.y0, x1: box.x1, y1: box.y1 },
      })
    }
    const paperShare = (parsed as { paperShare?: unknown }).paperShare
    return {
      lines: clean,
      ...(typeof paperShare === 'number' ? { paperShare } : {}),
    }
  } catch {
    return null
  }
}
