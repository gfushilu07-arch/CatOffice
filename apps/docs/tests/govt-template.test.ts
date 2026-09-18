/**
 * GB/T 9704 scaffold: the template blocks must survive a full engine round
 * trip (generateParagraphXml → buildDocx → parseDocx) with every governing
 * semantic intact — red banner, char-unit first-line indents, the red rule
 * border, and the right-aligned signature block. This is what makes the
 * template trustworthy before any UI wiring exists.
 */

import { describe, expect, it } from 'vitest'
import {
  applySectionSettings,
  generateParagraphXml,
  parseDocx,
  sectionSettingsFromXml,
  type Block,
  type GeneratedBlock,
  type GenerateContext,
} from '@genoffice/docx-engine'
import { buildDocx } from '../../../packages/docx-engine/tests/helpers/build-docx'
import { GB_A4, GB_MARGINS, govtDocBlocks, govtDocSection } from '../src/renderer/govt-template'

const GEN_CTX: GenerateContext = {
  headingStyleIds: new Map([[1, 'Heading1']]),
  allocateHyperlinkRel: () => 'rId999',
}

/** Block satisfies GeneratedBlock structurally; the projection drops editor bookkeeping. */
function toGenerated(b: Block): GeneratedBlock {
  return {
    type: b.type as GeneratedBlock['type'],
    level: b.level,
    styleId: b.styleId,
    list: b.list,
    format: b.format,
    runs: b.runs ?? [],
  }
}

async function roundTrip(blocks: Block[]) {
  const bodyXml = blocks.map((b) => generateParagraphXml(toGenerated(b), GEN_CTX)).join('')
  const bytes = await buildDocx({ bodyXml })
  const doc = await parseDocx(bytes)
  return doc.blocks
}

describe('GB/T 9704 template', () => {
  it('lays out the scaffold in document order', () => {
    const blocks = govtDocBlocks()
    const texts = blocks.map((b) => (b.runs ?? []).map((r) => r.text).join(''))
    expect(texts[0]).toContain('文件')
    expect(texts[1]).toContain('〔2026〕')
    expect(texts[3]).toContain('通知')
    expect(texts[4]).toContain('：')
  })

  it('renders the banner red in 小标宋, centered', async () => {
    const [banner] = await roundTrip(govtDocBlocks().slice(0, 1))
    expect(banner.format?.align).toBe('center')
    expect(banner.runs![0]!.color).toBe('FF0000')
    expect(banner.runs![0]!.font).toBe('方正小标宋简体')
    expect(banner.runs![0]!.sizeHalfPoints).toBe(72)
  })

  it('draws the red separator rule as a red bottom border', async () => {
    const [rule] = await roundTrip(govtDocBlocks().slice(2, 3))
    expect(rule.format?.borderLines?.b?.color).toBe('FF0000')
    expect(rule.format?.borderLines?.b?.szPt).toBe(1)
  })

  it('indents body paragraphs two chars via the char-unit form (with twips fallback)', async () => {
    const blocks = govtDocBlocks()
    const bodyStart = blocks.findIndex((b) => b.runs?.[0]?.text.startsWith('一、'))
    const [reparsed] = await roundTrip(blocks.slice(bodyStart, bodyStart + 1))
    // the engine keeps the raw char-unit record; the renderer derives the signed
    // pair from it (formatAttrs → indentFirstLineChars), which is what the
    // editor's text-indent in em and the ribbon state read
    expect(reparsed.format?.charIndents?.firstLine).toBe(200)
    expect(reparsed.format?.indentFirstLine).toBe(640)
    expect(reparsed.runs![0]!.font).toBe('仿宋_GB2312')
    expect(reparsed.runs![0]!.sizeHalfPoints).toBe(32)
  })

  it('right-aligns the signature two/four chars from the margin', async () => {
    const blocks = govtDocBlocks()
    const tail = blocks.slice(-2)
    const [signer, date] = await roundTrip(tail)
    expect(signer.format?.align).toBe('right')
    expect(signer.format?.indentRight).toBe(1280)
    expect(signer.runs![0]!.text).toContain('加盖印章')
    expect(date.format?.align).toBe('right')
    expect(date.format?.indentRight).toBe(640)
  })

  it('honors caller overrides for every field', () => {
    const blocks = govtDocBlocks({
      banner: '猫办公室文件',
      docNumber: '猫办发〔2026〕9号',
      title: '关于养猫的通知',
      recipients: '各部门：',
      paragraphs: ['正文一。'],
      attachments: [],
      signer: '猫办公室署名',
      date: '2026年9月2日',
    })
    const texts = blocks.map((b) => (b.runs ?? []).map((r) => r.text).join(''))
    expect(texts).toContain('猫办公室文件')
    expect(texts).toContain('猫办发〔2026〕9号')
    expect(texts.join('')).not.toContain('附件：')
    const signer = blocks.find((b) => b.runs?.[0]?.text.startsWith('猫办公室署名'))
    expect(signer!.format?.align).toBe('right')
  })
})

describe('GB/T 9704 page frame', () => {
  it('uses the GB margins on A4', () => {
    const s = govtDocSection()
    expect(s.pageWidth).toBe(GB_A4.width)
    expect(s.pageHeight).toBe(GB_A4.height)
    expect(s.marginTop).toBe(GB_MARGINS.top)
    expect(s.marginBottom).toBe(GB_MARGINS.bottom)
    expect(s.marginLeft).toBe(GB_MARGINS.left)
    expect(s.marginRight).toBe(GB_MARGINS.right)
    // GB/T 9704 §5: 210x297mm page; top 37 / bottom 35 / left 28 / right 26 mm
    expect(s.pageWidth).toBe(11906)
    expect(s.pageHeight).toBe(16838)
    expect(s.marginTop).toBe(2098)
    expect(s.marginBottom).toBe(1984)
    expect(s.marginLeft).toBe(1587)
    expect(s.marginRight).toBe(1474)
  })

  it('round-trips the section settings through the engine', () => {
    // applySectionSettings patches a paired sectPr (the shape the engine and
    // Word both write); patching a US-Letter base must overwrite every value,
    // and sectionSettingsFromXml must read the GB page frame back — proving
    // the settings survive a save/reopen cycle.
    const base =
      '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/>' +
      '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>'
    const settings = govtDocSection()
    const patched = applySectionSettings(base, settings)
    const readBack = sectionSettingsFromXml(patched)
    expect(readBack.pageWidth).toBe(settings.pageWidth)
    expect(readBack.pageHeight).toBe(settings.pageHeight)
    expect(readBack.marginTop).toBe(settings.marginTop)
    expect(readBack.marginBottom).toBe(settings.marginBottom)
    expect(readBack.marginLeft).toBe(settings.marginLeft)
    expect(readBack.marginRight).toBe(settings.marginRight)
    expect(readBack.headerDist).toBe(settings.headerDist)
    expect(readBack.footerDist).toBe(settings.footerDist)
  })
})

describe('GB/T 9704 tail blocks (P2)', () => {
  const roundTripTail = async (options: Parameters<typeof govtDocBlocks>[0]) => {
    const blocks = govtDocBlocks(options)
    const bodyXml = blocks.map((b) => generateParagraphXml(toGenerated(b), GEN_CTX)).join('')
    const bytes = await buildDocx({ bodyXml })
    return parseDocx(bytes)
  }

  it('round-trips subject keywords as bold heiti', async () => {
    const doc = await roundTripTail({ keywords: ['植树', '造林', '通知'] })
    const texts = doc.blocks.map((b) => (b.runs ?? []).map((r) => r.text).join(''))
    const kw = texts.find((t) => t.includes('关键词：'))
    expect(kw).toContain('关键词：植树　造林　通知')
    const kwBlock = doc.blocks.find((b) => (b.runs ?? []).some((r) => r.text.includes('关键词：')))
    expect(kwBlock?.runs?.[0]?.bold).toBe(true)
    expect(kwBlock?.runs?.[0]?.font).toBe('黑体')
  })

  it('omits keywords/colophon when unset', async () => {
    const doc = await roundTripTail({})
    const texts = doc.blocks.map((b) => (b.runs ?? []).map((r) => r.text).join(''))
    expect(texts.join('')).not.toContain('关键词：')
    expect(texts.join('')).not.toContain('抄送：')
  })

  it('round-trips the colophon between full-width rules', async () => {
    const doc = await roundTripTail({
      colophon: { cc: '各区县人民政府。', print: '猫办公室 2026年9月3日印发' },
    })
    const texts = doc.blocks.map((b) => (b.runs ?? []).map((r) => r.text).join(''))
    expect(texts).toContain('抄送：各区县人民政府。')
    expect(texts).toContain('猫办公室 2026年9月3日印发')
    // both rule lines carry the tb borders
    const ccBlock = doc.blocks.find((b) => (b.runs ?? []).some((r) => r.text.startsWith('抄送：')))
    expect(ccBlock?.format?.borders).toBe('b')
    const printBlock = doc.blocks.find((b) =>
      (b.runs ?? []).some((r) => r.text.includes('印发')),
    )
    expect(printBlock?.format?.borders).toBe('tb')
  })
})
