/**
 * GB/T 9704-2012 official-document scaffold (党政机关公文格式) as docx-engine
 * Blocks — the same canonical model the editor consumes through convert.ts and
 * the OOXML writer emits through generateParagraphXml, so one array feeds both
 * the editing canvas and a direct save.
 *
 * Implemented here (first slice): 发文机关标志（红头）、发文字号、红色分隔线、
 * 标题、主送机关、正文（首行缩进 2 字 via w:firstLineChars）、附件说明、发文
 * 机关署名与成文日期。版心（A4 + 上37/下35/左28/右26mm 的 sectPr）与印章图形
 * 占位 belong to the section plumbing and are follow-ups.
 *
 * Placeholder text uses ×× so every field is obviously fill-in; fonts are the
 * GB/T faces (方正小标宋简体 for the banner/title, 仿宋_GB2312 for the body —
 * both resolve through the renderer's substitution chains).
 */

import type { Block, ParaBorderLine, Run } from '@genoffice/docx-engine'

export interface GovtTemplateOptions {
  /** 发文机关标志 banner text (the "红头"), e.g. ××市人民政府文件 */
  banner?: string
  /** 发文字号, e.g. ×政发〔2026〕1号 */
  docNumber?: string
  /** 公文标题 */
  title?: string
  /** 主送机关（顶格，冒号结尾） */
  recipients?: string
  /** 正文段落（首行缩进 2 字自动加） */
  paragraphs?: string[]
  /** 附件说明条目（不带「附件：」前缀） */
  attachments?: string[]
  /** 发文机关署名 */
  signer?: string
  /** 成文日期（右空二字） */
  date?: string
}

const BANNER_FONT = '方正小标宋简体'
const BODY_FONT = '仿宋_GB2312'
const RED = 'FF0000'
/** GB/T 9704 body text: 3号 = 16pt = 32 half-points */
const BODY_HALF_POINTS = 32
/** 标题: 2号 = 22pt = 44 half-points */
const TITLE_HALF_POINTS = 44
/** banner: 小初 ≈ 36pt = 72 half-points */
const BANNER_HALF_POINTS = 72
/** one body char at 3号 = 320 twips; 2-char first-line indent = 640 twips */
const TWO_CHAR_TWIPS = 640

let seq = 0
function block(partial: Omit<Block, 'id' | 'docxIndex' | 'originalXml'>): Block {
  seq += 1
  return { id: `govt-${seq}`, docxIndex: null, originalXml: null, ...partial }
}

const run = (text: string, extra: Partial<Run> = {}): Run => ({ text, ...extra })

const bodyRun = (text: string): Run => run(text, { font: BODY_FONT, sizeHalfPoints: BODY_HALF_POINTS })

/** the red separator line under the banner: an empty paragraph with a red bottom border */
function redRuleBlock(): Block {
  const bottom: ParaBorderLine = { color: RED, szPt: 1 }
  return block({
    type: 'paragraph',
    runs: [],
    // borders declares the sides; borderLines overrides each side's color/width
    format: { borders: 'b', borderLines: { b: bottom }, spaceAfter: 240 },
  })
}

/** 正文/附件 paragraphs: 3号仿宋, first line indented 2 chars (char-unit + twips fallback) */
function bodyBlock(text: string): Block {
  return block({
    type: 'paragraph',
    runs: [bodyRun(text)],
    format: {
      indentFirstLineChars: 200,
      indentFirstLine: TWO_CHAR_TWIPS,
    },
  })
}

export function govtDocBlocks(options: GovtTemplateOptions = {}): Block[] {
  seq = 0
  const {
    banner = '××××文件',
    docNumber = '××发〔2026〕1号',
    title = '关于××××××的通知',
    recipients = '××××××××：',
    paragraphs = [
      '××××××××××××××××××××。现将有关事项通知如下：',
      '一、××××××××××××××××××××××××××××××。',
      '二、××××××××××××××××××××××××××××××。',
    ],
    attachments = ['××××××××××××'],
    signer = '××××××××',
    date = '2026年9月1日',
  } = options

  const blocks: Block[] = [
    // 发文机关标志（红头）：红色小标宋，居中
    block({
      type: 'paragraph',
      runs: [run(banner, { font: BANNER_FONT, sizeHalfPoints: BANNER_HALF_POINTS, color: RED })],
      format: { align: 'center' },
    }),
    // 发文字号：3号仿宋居中
    block({
      type: 'paragraph',
      runs: [bodyRun(docNumber)],
      format: { align: 'center' },
    }),
    // 红色分隔线（与版心同宽）
    redRuleBlock(),
    // 标题：2号小标宋居中，段前空一行量
    block({
      type: 'paragraph',
      runs: [run(title, { font: BANNER_FONT, sizeHalfPoints: TITLE_HALF_POINTS })],
      format: { align: 'center', spaceBefore: 480, spaceAfter: 240 },
    }),
    // 主送机关：顶格
    block({ type: 'paragraph', runs: [bodyRun(recipients)] }),
    // 正文
    ...paragraphs.map(bodyBlock),
  ]

  if (attachments.length > 0) {
    // 附件说明：正文下空一行，左空二字
    blocks.push(block({ type: 'paragraph', runs: [] }))
    attachments.forEach((name, i) => {
      blocks.push(bodyBlock(`${i === 0 ? '附件：' : '　　　　'}${i + 1}. ${name}`))
    })
  }

  // 发文机关署名与成文日期：右空四字/二字（twips 近似，char-unit 右缩进待续）
  blocks.push(block({ type: 'paragraph', runs: [] }))
  blocks.push(
    block({
      type: 'paragraph',
      runs: [bodyRun(`${signer}（加盖印章）`)],
      format: { align: 'right', indentRight: 1280 },
    }),
  )
  blocks.push(
    block({
      type: 'paragraph',
      runs: [bodyRun(date)],
      format: { align: 'right', indentRight: 640 },
    }),
  )
  return blocks
}
