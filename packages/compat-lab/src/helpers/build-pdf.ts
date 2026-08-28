import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

/**
 * Deterministic PDF builder for the golden corpus: standard Helvetica only (no
 * font embedding), fixed creation/modification dates, one text block per line.
 */
export async function buildPdf(pages: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle('CatOffice compat golden')
  doc.setProducer('compat-lab')
  const epoch = new Date('2026-01-01T00:00:00Z')
  doc.setCreationDate(epoch)
  doc.setModificationDate(epoch)
  const font = await doc.embedFont(StandardFonts.Helvetica)

  for (const pageText of pages) {
    const page = doc.addPage([595.28, 841.89]) // A4
    const lines = pageText.split('\n')
    lines.forEach((line, i) => {
      page.drawText(line, {
        x: 56,
        y: page.getHeight() - 72 - i * 24,
        size: 12,
        font,
        color: rgb(0.1, 0.1, 0.1),
      })
    })
  }

  return doc.save()
}
