/**
 * Async (cloud) OCR pre-recognition for scanned pages (L3, CatSpark OCR):
 * the conversion pipeline runs inside a synchronous PDFium scope, so an HTTP
 * engine cannot be called from it. The caller instead runs this helper FIRST
 * — it opens the document once, finds the scanned pages, renders each at the
 * same ~216 dpi the local path uses, and awaits the async engine outside any
 * wasm scope — then passes the returned map as ConvertOptions.ocrRecognitions.
 *
 * Pure orchestration: every recognition gate (paper share, confidence,
 * coverage) stays in src/ocr.ts and runs later on the supplied entries, so a
 * cloud answer is held to exactly the same bar as a local one.
 */
import type { ExtractedPage, PdfiumModule } from './extract'
import type { PageRender } from './ir'
import { extractPage, renderPageByIndexPng, withPdfDocument } from './extract'
import type { OcrRecognition } from './ocr'

/**
 * The async counterpart of OcrEngine: one page render in, recognition out.
 * null / a throw means "this page has no cloud answer" — the convert pass
 * then falls back to the local engine or the bitmap, exactly like a failed
 * sync engine.
 */
export type AsyncOcrEngine = (
  png: Uint8Array,
  page: { widthPt: number; heightPt: number; index: number },
) => Promise<OcrRecognition | null>

/** the sync scope side: which pages need recognition, and their renders */
interface ScanProbe {
  indexes: number[]
  renders: Map<number, PageRender>
  /** page sizes in points, for the engine's page hint (OcrEngine contract) */
  sizes: Map<number, { widthPt: number; heightPt: number }>
}

/** Open the document synchronously, probe scanned pages, render each at `dpi scale`. */
function probeScannedPages(
  m: PdfiumModule,
  pdf: Uint8Array,
  renderScale: number,
  password?: string,
): ScanProbe {
  return withPdfDocument(
    m,
    pdf,
    (doc) => {
      const probe: ScanProbe = { indexes: [], renders: new Map(), sizes: new Map() }
      const total = m._FPDF_GetPageCount(doc)
      for (let i = 0; i < total; i++) {
        const extracted: ExtractedPage = extractPage(m, doc, i, { renderScale })
        if (!extracted.scanned) continue
        // >=3 px/pt (~216 dpi): the same recognition render the local path uses
        const render = renderPageByIndexPng(m, doc, i, Math.max(renderScale, 3))
        if (!render) continue
        probe.indexes.push(i)
        probe.renders.set(i, render)
        probe.sizes.set(i, { widthPt: extracted.widthPt, heightPt: extracted.heightPt })
      }
      return probe
    },
    password,
  )
}

export interface RecognizeScannedPagesOptions {
  pdfium: PdfiumModule
  /** fallback raster scale for page renders (pixels per point), default 2 */
  renderScale?: number
  /** user password for encrypted PDFs (same semantics as ConvertOptions) */
  password?: string
}

/**
 * Pre-recognize every scanned page of `pdf` through `engine` (concurrent).
 * Resolves a map ready for ConvertOptions.ocrRecognitions; pages whose cloud
 * call failed or returned null are simply absent from the map (the convert
 * pass falls back per page). Resolves an EMPTY map when the document has no
 * scanned pages — cheap no-op for digital documents.
 */
export async function recognizeScannedPages(
  pdf: Uint8Array,
  opts: RecognizeScannedPagesOptions,
  engine: AsyncOcrEngine,
): Promise<Map<number, OcrRecognition>> {
  const probe = probeScannedPages(opts.pdfium, pdf, opts.renderScale ?? 2, opts.password)
  const out = new Map<number, OcrRecognition>()
  await Promise.all(
    probe.indexes.map(async (index) => {
      const render = probe.renders.get(index)!
      try {
        const recognition = await engine(render.data, {
          widthPt: probe.sizes.get(index)!.widthPt,
          heightPt: probe.sizes.get(index)!.heightPt,
          index,
        })
        if (recognition) out.set(index, recognition)
      } catch {
        // no cloud answer for this page: per-page fallback at convert time
      }
    }),
  )
  return out
}
