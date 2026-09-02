/**
 * Cloud OCR end to end (L3): with mock mode on and no local engine
 * (the Linux situation), convertPdfFileToDocxLocal pre-recognizes the
 * scanned page through the embedded CatSpark mock (startMockCloud) and the
 * rebuilt docx carries the mock's recognized text — the full
 * recognizeScannedPages → mock /api/ocr/recognize → ocrRecognitions supply
 * → pipeline gates → docx path.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseDocx } from '@genoffice/docx-engine'
import { startMockCloud, type MockCloudHandle } from '@catoffice/catspark/mock'
import { isMockMode } from '@catoffice/catspark'
import { buildScannedPdf } from '../../../packages/pdf2docx/tests/helpers/fixtures'
import { convertPdfFileToDocxLocal } from '../src/main/pdf2docx-local'

// this suite exercises the mock cloud; vitest keeps mock mode off by default
process.env.CATSPARK_MOCK = '1'
// darwin/win have a local Vision engine which would take priority; force the
// cloud pre-recognition so the mock path is what runs here (Linux needs no
// flag — no local engine exists there)
process.env.CATSPARK_CLOUD_OCR = '1'

let mock: MockCloudHandle
let dir: string

beforeAll(async () => {
  mock = (await startMockCloud({ port: 0 }))!
  if (!mock) throw new Error('mock server did not start (is mock mode on?)')
  // the requester derives the endpoint from CATSPARK_MOCK_PORT via mockCloudOrigin()
  process.env.CATSPARK_MOCK_PORT = new URL(mock.origin).port
  dir = mkdtempSync(join(tmpdir(), 'cloud-ocr-'))
})

afterAll(async () => {
  await mock?.stop()
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('cloud OCR through the embedded mock', () => {
  it('recovers a scanned PDF as editable text with no local engine', async () => {
    expect(isMockMode()).toBe(true)
    const pdfPath = join(dir, 'scan.pdf')
    writeFileSync(pdfPath, await buildScannedPdf())
    const result = await convertPdfFileToDocxLocal(pdfPath)
    expect(result.pageResults[0]!.status).toBe('ocr')
    const parsed = await parseDocx(result.docx)
    const text = JSON.stringify(parsed.blocks)
    expect(text).toContain('扫描件文字识别测试')
    expect(text).toContain('CatSpark mock OCR')
    expect(parsed.blocks.filter((b) => b.type === 'image')).toHaveLength(0)
  })
})
