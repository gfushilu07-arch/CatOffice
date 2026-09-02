/**
 * GB/T 9704-2012 official-document scaffold as docx-engine
 * Blocks — the same canonical model the editor consumes through convert.ts and
 * the OOXML writer emits through generateParagraphXml, so one array feeds both
 * the editing canvas and a direct save.
 *
 * Implemented here (first slice): the red banner, the document number, the
 * red separator rule, the title, recipients, body
 * paragraphs (2-char first-line indent via w:firstLineChars), the attachment
 * list, and the signature/date block. The page frame (A4 + 37/35/28/26mm
 * margins as sectPr) and the seal placeholder belong to the section plumbing
 * and are follow-ups.
 *
 * Placeholder text uses fullwidth ×× so every field is obviously fill-in;
 * fonts are the GB faces (FZXiaoBiaoSong for the banner/title, FangSong_GB2312
 * for the body — both resolve through the renderer's substitution chains).
 */

import type { Block, ParaBorderLine, Run } from '@genoffice/docx-engine'

export interface GovtTemplateOptions {
  /** banner text (the red letterhead), e.g. a city government file header */
  banner?: string
  /** document number, e.g. a city-2026-1 issue number */
  docNumber?: string
  /** document title */
  title?: string
  /** recipients line (flush left, ends with a colon) */
  recipients?: string
  /** body paragraphs (the 2-char first-line indent is applied automatically) */
  paragraphs?: string[]
  /** attachment names (without the leading label) */
  attachments?: string[]
  /** issuing-agency signature */
  signer?: string
  /** issue date (indented two chars from the right margin) */
  date?: string
}

const BANNER_FONT = '方正小标宋简体'
const BODY_FONT = '仿宋_GB2312'
const RED = 'FF0000'
/** body text: size-3 = 16pt = 32 half-points */
const BODY_HALF_POINTS = 32
/** title: size-2 = 22pt = 44 half-points */
const TITLE_HALF_POINTS = 44
/** banner: xiao-chu ≈ 36pt = 72 half-points */
const BANNER_HALF_POINTS = 72
/** one body char at size-3 = 320 twips; 2-char first-line indent = 640 twips */
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

/** body/attachment paragraphs: size-3 FangSong, first line indented 2 chars (char-unit + twips fallback) */
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
    // red banner: red XiaoBiaoSong, centered
    block({
      type: 'paragraph',
      runs: [run(banner, { font: BANNER_FONT, sizeHalfPoints: BANNER_HALF_POINTS, color: RED })],
      format: { align: 'center' },
    }),
    // document number: size-3 FangSong, centered
    block({
      type: 'paragraph',
      runs: [bodyRun(docNumber)],
      format: { align: 'center' },
    }),
    // red separator rule (text-frame wide)
    redRuleBlock(),
    // title: size-2 XiaoBiaoSong, centered, one blank line above
    block({
      type: 'paragraph',
      runs: [run(title, { font: BANNER_FONT, sizeHalfPoints: TITLE_HALF_POINTS })],
      format: { align: 'center', spaceBefore: 480, spaceAfter: 240 },
    }),
    // recipients: flush left
    block({ type: 'paragraph', runs: [bodyRun(recipients)] }),
    // body
    ...paragraphs.map(bodyBlock),
  ]

  if (attachments.length > 0) {
    // attachment list: one blank line below the body, two chars in from the left
    blocks.push(block({ type: 'paragraph', runs: [] }))
    attachments.forEach((name, i) => {
      blocks.push(bodyBlock(`${i === 0 ? '附件：' : '　　　　'}${i + 1}. ${name}`))
    })
  }

  // signature and issue date: right-aligned, four/two chars from the margin (twips approximation; char-unit right indent is a follow-up)
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
