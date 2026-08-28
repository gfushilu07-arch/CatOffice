/**
 * Materializes the golden corpus into compat/golden/ and computes the reader
 * expectations committed next to it. Run via `pnpm --filter @catoffice/compat-lab
 * run golden` whenever a corpus file's CONTENT is intentionally changed (that is
 * a compatibility-relevant decision, review the expectations diff).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  MATH_PARAGRAPH_XML,
  NESTED_TABLE_XML,
  TABLE_XML,
  buildDocx,
  buildKitchenSinkDocx,
} from '../../docx-engine/tests/helpers/build-docx'
import { docxToText, pdfToText, pptxToText, xlsxToText } from '@genoffice/file-parse'
import { parseDocx } from '@genoffice/docx-engine'
import { buildPdf } from '../src/helpers/build-pdf'
import { buildXlsx } from '../src/helpers/build-xlsx'
import { FORMULAS_XLSX_SPEC, VALUES_XLSX_SPEC } from '../src/helpers/golden-specs'
import { GOLDEN_ROOT, EXPECTATIONS_ROOT } from '../src/helpers/paths'

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PPTX_FIXTURES = join(PKG_ROOT, '..', 'pptx-engine', 'tests', 'fixtures')

interface Entry {
  kind: 'docx' | 'pptx' | 'xlsx' | 'pdf'
  name: string
  bytes: Uint8Array
}

async function docxEntries(): Promise<Entry[]> {
  const listParagraph = (text: string, numId: number) =>
    `<w:p><w:pPr><w:pStyle w:val="ListParagraph"/>` +
    `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr></w:pPr>` +
    `<w:r><w:t>${text}</w:t></w:r></w:p>`

  return [
    {
      kind: 'docx',
      name: '01-simple.docx',
      bytes: await buildDocx({
        bodyXml:
          '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>标题</w:t></w:r></w:p>' +
          '<w:p><w:r><w:t>第一段。</w:t></w:r></w:p>' +
          '<w:p><w:r><w:t>第二段。</w:t></w:r></w:p>',
      }),
    },
    {
      kind: 'docx',
      name: '02-tables.docx',
      bytes: await buildDocx({
        bodyXml:
          '<w:p><w:r><w:t>Before table.</w:t></w:r></w:p>' +
          TABLE_XML +
          '<w:p><w:r><w:t>Between tables.</w:t></w:r></w:p>' +
          NESTED_TABLE_XML,
      }),
    },
    {
      kind: 'docx',
      name: '03-rich.docx',
      bytes: await buildDocx({
        bodyXml:
          listParagraph('bullet one', 1) +
          listParagraph('bullet two', 1) +
          listParagraph('numbered item', 2) +
          MATH_PARAGRAPH_XML,
        withNumbering: true,
        withImage: true,
      }),
    },
    { kind: 'docx', name: '04-kitchen-sink.docx', bytes: await buildKitchenSinkDocx() },
  ]
}

function pptxEntries(): Entry[] {
  const copy = (fixture: string, name: string): Entry => ({
    kind: 'pptx',
    name,
    bytes: new Uint8Array(readFileSync(join(PPTX_FIXTURES, fixture))),
  })
  // python-pptx-generated decks reused from pptx-engine tests (see
  // packages/pptx-engine/tests/fixtures/LICENSE-python-pptx.txt)
  return [
    copy('01_standard_business.pptx', '05-standard-business.pptx'),
    copy('05_unicode_cjk_emoji.pptx', '06-unicode-cjk-emoji.pptx'),
  ]
}

async function xlsxEntries(): Promise<Entry[]> {
  return [
    { kind: 'xlsx', name: '07-values.xlsx', bytes: await buildXlsx(VALUES_XLSX_SPEC) },
    { kind: 'xlsx', name: '08-formulas.xlsx', bytes: await buildXlsx(FORMULAS_XLSX_SPEC) },
  ]
}

async function pdfEntries(): Promise<Entry[]> {
  return [
    {
      kind: 'pdf',
      name: '09-text.pdf',
      bytes: await buildPdf(['CatOffice golden corpus\nPage one with contact@example.com']),
    },
    {
      kind: 'pdf',
      name: '10-multipage.pdf',
      bytes: await buildPdf([
        'Multipage marker ALPHA\nfirst page',
        'Multipage marker BRAVO\nsecond page',
        'Multipage marker CHARLIE\nthird page',
      ]),
    },
  ]
}

async function expectation(entry: Entry): Promise<Record<string, unknown>> {
  const base: Record<string, unknown> = { file: `${entry.kind}/${entry.name}`, kind: entry.kind }
  if (entry.kind === 'docx') {
    const doc = await parseDocx(entry.bytes)
    const types: Record<string, number> = {}
    for (const block of doc.blocks) types[block.type] = (types[block.type] ?? 0) + 1
    return { ...base, text: await docxToText(entry.bytes), digest: { blockTypes: types } }
  }
  const reader = entry.kind === 'pptx' ? pptxToText : entry.kind === 'xlsx' ? xlsxToText : pdfToText
  return { ...base, text: await reader(entry.bytes) }
}

async function main() {
  mkdirSync(GOLDEN_ROOT, { recursive: true })
  for (const kind of ['docx', 'pptx', 'xlsx', 'pdf'] as const) {
    mkdirSync(join(GOLDEN_ROOT, kind), { recursive: true })
  }
  mkdirSync(EXPECTATIONS_ROOT, { recursive: true })

  const entries: Entry[] = [
    ...(await docxEntries()),
    ...pptxEntries(),
    ...(await xlsxEntries()),
    ...(await pdfEntries()),
  ]

  for (const entry of entries) {
    writeFileSync(join(GOLDEN_ROOT, entry.kind, entry.name), entry.bytes)
    const expectationJson = await expectation(entry)
    writeFileSync(
      join(EXPECTATIONS_ROOT, `${entry.name}.json`),
      JSON.stringify(expectationJson, null, 2) + '\n',
    )
    console.log(`golden: ${entry.kind}/${entry.name} (${entry.bytes.length} bytes)`)
  }
  console.log(`done: ${entries.length} golden files + expectations in compat/golden`)
}

void main().catch((err) => {
  console.error(err)
  process.exit(1)
})
