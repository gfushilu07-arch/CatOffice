/**
 * GB/T 9704 scaffold: the template blocks must survive a full engine round
 * trip (generateParagraphXml → buildDocx → parseDocx) with every governing
 * semantic intact — red banner, char-unit first-line indents, the red rule
 * border, and the right-aligned signature block. This is what makes the
 * template trustworthy before any UI wiring exists.
 */

import { describe, expect, it } from 'vitest'
import {
  generateParagraphXml,
  parseDocx,
  type Block,
  type GeneratedBlock,
  type GenerateContext,
} from '@genoffice/docx-engine'
import { buildDocx } from '../../../packages/docx-engine/tests/helpers/build-docx'
import { govtDocBlocks } from '../src/renderer/govt-template'

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
    expect(reparsed.format?.indentFirstLineChars).toBe(200)
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
