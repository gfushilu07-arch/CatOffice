import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { pdfToText } from '@genoffice/file-parse'
import { loadGolden } from './helpers/load-golden'

const FILES = ['09-text.pdf', '10-multipage.pdf']

describe.each(FILES)('golden pdf %s', (name) => {
  const golden = loadGolden('pdf', name)

  it('reads to the committed text expectation', async () => {
    expect(await pdfToText(golden.bytes)).toBe(golden.expected.text)
  })

  it('survives a load → save round trip without text drift', async () => {
    const doc = await PDFDocument.load(golden.bytes)
    const saved = await doc.save()
    expect(await pdfToText(saved)).toBe(golden.expected.text)
  })
})
