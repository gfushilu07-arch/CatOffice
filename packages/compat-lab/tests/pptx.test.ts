import { describe, expect, it } from 'vitest'
import { openPptx, savePptx } from '@genoffice/pptx-engine'
import { pptxToText } from '@genoffice/file-parse'
import { loadGolden } from './helpers/load-golden'

const FILES = ['05-standard-business.pptx', '06-unicode-cjk-emoji.pptx']

describe.each(FILES)('golden pptx %s', (name) => {
  const golden = loadGolden('pptx', name)

  it('reads to the committed text expectation', async () => {
    expect(await pptxToText(golden.bytes)).toBe(golden.expected.text)
  })

  it('survives a save → reopen round trip without text drift', async () => {
    const opened = await openPptx(golden.bytes)
    const saved = await savePptx(opened)
    expect(await pptxToText(saved)).toBe(golden.expected.text)
  })
})
