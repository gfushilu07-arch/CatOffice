/**
 * Async (cloud) OCR pre-recognition (src/ocr-async.ts): the probe only
 * renders scanned pages, the engine runs outside the sync PDFium scope, and
 * the returned map feeds ConvertOptions.ocrRecognitions end to end — the
 * supplied recognition beats a local engine, per-page fallback stays intact,
 * and the same confidence gates still apply.
 */
import { parseDocx } from '@genoffice/docx-engine'
import { describe, expect, it } from 'vitest'
import { convertPdfToDocx, recognizeScannedPages } from '../src'
import type { OcrRecognition } from '../src/ocr'
import { buildScannedPdf } from './helpers/fixtures'
import { loadPdfium } from './helpers/wasm'

const CJK_RECOGNITION: OcrRecognition = {
  lines: [
    { text: '扫描件文字识别测试', confidence: 0.9, box: { x0: 0.1, y0: 0.85, x1: 0.55, y1: 0.88 } },
    {
      text: 'Recovered by cloud OCR engine',
      confidence: 0.95,
      box: { x0: 0.1, y0: 0.8, x1: 0.6, y1: 0.82 },
    },
  ],
  paperShare: 0.95,
}

describe('recognizeScannedPages', () => {
  it('renders only the scanned pages and collects the engine answers', async () => {
    const pdfium = await loadPdfium()
    const seen: Array<{ index: number; png: boolean }> = []
    const supply = await recognizeScannedPages(
      await buildScannedPdf(),
      { pdfium },
      async (png, page) => {
        seen.push({ index: page.index, png: png[0] === 0x89 })
        return CJK_RECOGNITION
      },
    )
    expect(seen).toEqual([{ index: 0, png: true }])
    expect(supply.get(0)).toEqual(CJK_RECOGNITION)
  })

  it('omits pages the engine rejects and survives engine throws', async () => {
    const pdfium = await loadPdfium()
    const supply = await recognizeScannedPages(await buildScannedPdf(), { pdfium }, async () => {
      throw new Error('cloud unavailable')
    })
    expect(supply.size).toBe(0)
    const rejected = await recognizeScannedPages(await buildScannedPdf(), { pdfium }, async () => null)
    expect(rejected.size).toBe(0)
  })
})

describe('ConvertOptions.ocrRecognitions supply path', () => {
  it('converts the scanned page from a supplied recognition (no sync engine)', async () => {
    const pdfium = await loadPdfium()
    const result = await convertPdfToDocx(await buildScannedPdf(), {
      pdfium,
      renderScale: 1,
      ocrRecognitions: new Map([[0, CJK_RECOGNITION]]),
    })
    expect(result.pageResults[0]!.status).toBe('ocr')
    expect(result.pageResults[0]!.confidence).toBeCloseTo(0.925, 3)
    const parsed = await parseDocx(result.docx)
    expect(JSON.stringify(parsed.blocks)).toContain('Recovered by cloud OCR engine')
    expect(parsed.blocks.filter((b) => b.type === 'image')).toHaveLength(0)
  })

  it('a supplied recognition failing the gates still beats the sync engine but falls back to bitmap', async () => {
    const pdfium = await loadPdfium()
    const lowConfidence: OcrRecognition = {
      lines: [{ ...CJK_RECOGNITION.lines[0]!, confidence: 0.2 }],
      paperShare: 0.95,
    }
    const result = await convertPdfToDocx(await buildScannedPdf(), {
      pdfium,
      renderScale: 1,
      ocrRecognitions: new Map([[0, lowConfidence]]),
      // a local engine must NOT override an explicit cloud answer — the
      // caller decided the cloud result is the one to use for this page
      ocr: () => CJK_RECOGNITION,
    })
    // supply present but gated out -> bitmap fallback, same as a failed engine
    expect(result.pageResults[0]!.status).toBe('scanned')
  })

  it('a page absent from the supply map still uses the sync engine', async () => {
    const pdfium = await loadPdfium()
    const result = await convertPdfToDocx(await buildScannedPdf(), {
      pdfium,
      renderScale: 1,
      ocrRecognitions: new Map(), // nothing supplied
      ocr: () => CJK_RECOGNITION,
    })
    expect(result.pageResults[0]!.status).toBe('ocr')
  })
})
