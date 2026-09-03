/**
 * GB/T 9704-2012 official-document scaffold as docx-engine
 * Blocks — the same canonical model the editor consumes through convert.ts and
 * the OOXML writer emits through generateParagraphXml, so one array feeds both
 * the editing canvas and a direct save.
 *
 * Implemented here: the red banner, the document number, the
 * red separator rule, the title, recipients, body
 * paragraphs (2-char first-line indent via w:firstLineChars), and the
 * signature/date block. The page frame (GB_A4/GB_MARGINS/govtDocSection)
 * lives at the bottom of this file; the seal placeholder is govt-seal.ts
 * (govtSealImage -> NewImage save path). Still open: the UI entry point
 * (asset center A1) and the P2 record footer block are still open.
 *
 * Placeholder text uses fullwidth ×× so every field is obviously fill-in;
 * fonts are the GB faces (FZXiaoBiaoSong for the banner/title, FangSong_GB2312
 * for the body — both resolve through the renderer's substitution chains).
 */

import type { Block, ParaBorderLine, Run, SectionSettings } from '@genoffice/docx-engine'

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
  /**
   * subject keywords (GB/T 9704 P2): 3-5 phrases, rendered bold
   * size-3 heiti flush left under the date. Empty/omitted = omitted.
   */
  keywords?: string[]
  /**
   * the colophon block (ban-ji, GB/T 9704 P2): cc line + print line between
   * full-width rules at the very end. Empty/omitted = omitted.
   */
  colophon?: { cc?: string; print?: string }
}

const BANNER_FONT = '方正小标宋简体'
const BODY_FONT = '仿宋_GB2312'
const HEITI_FONT = '黑体'
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
    keywords = [],
    colophon,
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

  // subject keywords (zhuti-ci): bold size-3 heiti flush left
  if (keywords.length > 0) {
    blocks.push(block({ type: 'paragraph', runs: [] }))
    const kwLine = `关键词：${keywords.join('　')}`
    blocks.push(
      block({
        type: 'paragraph',
        runs: [run(kwLine, { font: HEITI_FONT, sizeHalfPoints: BODY_HALF_POINTS, bold: true })],
      }),
    )
  }

  // colophon (the GB record block): cc line + print line between full-width rules — an empty
  // paragraph carrying top+bottom borders draws the box lines
  if (colophon && (colophon.cc || colophon.print)) {
    blocks.push(block({ type: 'paragraph', runs: [] }))
    const rule: ParaBorderLine = { color: '000000', szPt: 1 }
    const ruleLine = (text: string, borders: 'b' | 'tb') =>
      block({
        type: 'paragraph',
        runs: [bodyRun(text)],
        format: { borders, borderLines: { t: rule, b: rule } },
      })
    if (colophon.cc) blocks.push(ruleLine(`抄送：${colophon.cc}`, 'b'))
    if (colophon.print) {
      blocks.push(
        block({
          type: 'paragraph',
          runs: [bodyRun(colophon.print)],
          format: { borders: 'tb', borderLines: { t: rule, b: rule } },
        }),
      )
    }
  }
  return blocks
}

// ─── Page frame (GB/T 9704 §5 text area) ─────────────────────────────────────
// A4 with 37mm top / 35mm bottom / 28mm left / 26mm right margins; millimetres
// converted at 1440 twips / 25.4 mm and rounded (Word's own values: 11906 x
// 16838 A4, top 2098, bottom 1984, left 1587, right 1474).

/** A4 page 210 x 297 mm in twips */
export const GB_A4 = { width: 11906, height: 16838 } as const
/** the four GB margins in twips: top 37 / bottom 35 / left 28 / right 26 mm */
export const GB_MARGINS = { top: 2098, bottom: 1984, left: 1587, right: 1474 } as const

/** Section settings for a GB/T 9704 document (A4, the mandated margins, 1 inch header/footer distance). */
export function govtDocSection(): SectionSettings {
  return {
    pageWidth: GB_A4.width,
    pageHeight: GB_A4.height,
    orientation: 'portrait',
    marginTop: GB_MARGINS.top,
    marginRight: GB_MARGINS.right,
    marginBottom: GB_MARGINS.bottom,
    marginLeft: GB_MARGINS.left,
    pageBorder: false,
    columns: 1,
    headerDist: 1440,
    footerDist: 1440,
  }
}
