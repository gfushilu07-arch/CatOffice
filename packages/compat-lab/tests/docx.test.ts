import { describe, expect, it } from 'vitest'
import { parseDocx } from '@genoffice/docx-engine'
import { docxToText } from '@genoffice/file-parse'
import { loadGolden } from './helpers/load-golden'

const FILES = ['01-simple.docx', '02-tables.docx', '03-rich.docx', '04-kitchen-sink.docx']

describe.each(FILES)('golden docx %s', (name) => {
  const golden = loadGolden('docx', name)

  it('reads to the committed text expectation', async () => {
    expect(await docxToText(golden.bytes)).toBe(golden.expected.text)
  })

  it('parses with the committed block-type digest', async () => {
    const doc = await parseDocx(golden.bytes)
    const types: Record<string, number> = {}
    for (const block of doc.blocks) types[block.type] = (types[block.type] ?? 0) + 1
    expect(types).toEqual(
      (golden.expected.digest as { blockTypes: Record<string, number> }).blockTypes,
    )
  })
})
