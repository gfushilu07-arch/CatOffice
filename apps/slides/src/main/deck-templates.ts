/**
 * Deck template presets (asset center S2): a work-report skeleton built
 * programmatically on createBlankPptx — cover, agenda, three content pages,
 * closing — using the pptx-engine's element insertion (textboxes only;
 * shapes/charts belong to the AI generation line, not static templates).
 * 16:9 at 12192000x6858000 EMU; every text carries ×× placeholders like the
 * docs/sheets template lines.
 */

import {
  addElement,
  insertSlideWithLayout,
  listSlideLayouts,
  openPptx,
  savePptx,
  type Paragraph,
  type TextRun,
} from '@genoffice/pptx-engine'

/** 16:9 canvas in EMU (matches createBlankPptx) */
const W = 12192000
const H = 6858000

interface TextBoxSpec {
  x: number
  y: number
  cx: number
  cy: number
  paragraphs: Paragraph[]
}

const run = (text: string, size: number, bold = false): TextRun => ({
  text,
  fontSize: size,
  bold,
})

/** title + optional body textbox pair for a content page */
function contentSlide(title: string, body: string[]): TextBoxSpec[] {
  return [
    {
      x: W / 12,
      y: H / 9,
      cx: (W * 10) / 12,
      cy: H / 7,
      paragraphs: [{ runs: [run(title, 30, true)] }],
    },
    {
      x: W / 8,
      y: H / 4,
      cx: (W * 6) / 8,
      cy: (H * 5) / 8,
      paragraphs: body.map((line, i) => ({
        runs: [run(line, 18)],
        level: 0,
        ...(i > 0 ? {} : {}),
      })),
    },
  ]
}

/** build one slide's textboxes onto `slide` via addElement */
function fillSlide(slide: Parameters<typeof addElement>[0], specs: TextBoxSpec[]): void {
  for (const spec of specs) {
    addElement(slide, {
      kind: 'textbox',
      offset: { x: spec.x, y: spec.y, cx: spec.cx, cy: spec.cy },
      paragraphs: spec.paragraphs,
    })
  }
}

export interface DeckTemplateEntry {
  id: string
  label: string
  description: string
  fileName: string
  /** title + agenda + content sections + closing note */
  pages: {
    coverTitle: string
    coverSubtitle: string
    agenda: string[]
    sections: Array<{ title: string; body: string[] }>
    closing: string
  }
}

export function deckTemplateById(id: string): DeckTemplateEntry | undefined {
  return DECK_TEMPLATES.find((entry) => entry.id === id)
}

export const PROPOSAL_TEMPLATE: DeckTemplateEntry = {
  id: 'deck-proposal',
  label: '项目提案',
  description: '封面 / 目录 / 背景目标 / 方案 / 排期资源 / 结尾',
  fileName: '项目提案',
  pages: {
    coverTitle: '××××项目提案',
    coverSubtitle: '提案人：××　·　××××年××月',
    agenda: ['一、背景与目标', '二、方案概述', '三、排期与资源'],
    sections: [
      { title: '一、背景与目标', body: ['1. ××××××××；', '2. 目标：××××××××。'] },
      { title: '二、方案概述', body: ['1. ××××××××；', '2. ××××××××。'] },
      {
        title: '三、排期与资源',
        body: ['1. 排期：××××年××月—××月；', '2. 资源：××××××××。'],
      },
    ],
    closing: '谢谢观看',
  },
}

/** labels for the shell's native picker menu (independent bundle rule) */
export const WEEKLY_REPORT_TEMPLATE: DeckTemplateEntry = {
  id: 'deck-weekly-report',
  label: '工作汇报',
  description: '封面 / 目录 / 三节内容 / 结尾',
  fileName: '工作汇报',
  pages: {
    coverTitle: '××××××工作汇报',
    coverSubtitle: '汇报人：××　·　××××年××月',
    agenda: ['一、工作进展', '二、问题与风险', '三、下一步计划'],
    sections: [
      { title: '一、工作进展', body: ['1. ××××××××；', '2. ××××××××；', '3. ××××××××。'] },
      { title: '二、问题与风险', body: ['1. ××××××××；', '2. 需××××支持。'] },
      { title: '三、下一步计划', body: ['1. ××××××××；', '2. ××××××××。'] },
    ],
    closing: '谢谢观看',
  },
}

/** labels for the shell's native picker menu (independent bundle rule) */
export const TRAINING_TEMPLATE: DeckTemplateEntry = {
  id: 'deck-training',
  label: '培训课件',
  description: '封面 / 目录 / 课程介绍 / 内容大纲 / 练习答疑 / 结尾',
  fileName: '培训课件',
  pages: {
    coverTitle: '××××××培训课件',
    coverSubtitle: '讲师：××　·　××××年××月',
    agenda: ['一、课程介绍', '二、内容大纲', '三、练习与答疑'],
    sections: [
      {
        title: '一、课程介绍',
        body: ['1. 培训目标：××××××××；', '2. 适用对象：××××××××。'],
      },
      {
        title: '二、内容大纲',
        body: ['1. ××××××××；', '2. ××××××××；', '3. ××××××××。'],
      },
      {
        title: '三、练习与答疑',
        body: ['1. 练习：××××××××；', '2. 答疑：××××××××。'],
      },
    ],
    closing: '谢谢参与',
  },
}

export const DECK_TEMPLATES: DeckTemplateEntry[] = [
  WEEKLY_REPORT_TEMPLATE,
  PROPOSAL_TEMPLATE,
  TRAINING_TEMPLATE,
]

export const DECK_TEMPLATE_MENU = DECK_TEMPLATES.map((entry) => ({
  id: entry.id,
  label: entry.label,
  description: entry.description,
}))

/**
 * Render the template skeleton into real pptx bytes: the blank deck's slide
 * becomes the cover, then one inserted slide per agenda item + the closing.
 * Inserted slides reuse the blank deck's own layout (the only one it ships).
 */
export async function deckTemplatePptx(template: DeckTemplateEntry): Promise<Uint8Array> {
  const { createBlankPptx } = await import('@genoffice/pptx-engine')
  const opened = await openPptx(await createBlankPptx())
  const layouts = listSlideLayouts(opened.archive)
  const layoutPath = layouts[0]?.path ?? 'ppt/slideLayouts/slideLayout1.xml'

  const cover = opened.deck.slides[0]
  if (!cover) throw new Error('blank deck has no slide')
  fillSlide(cover, [
    {
      x: W / 8,
      y: (H * 3) / 10,
      cx: (W * 6) / 8,
      cy: H / 6,
      paragraphs: [{ runs: [run(template.pages.coverTitle, 40, true)], align: 'center' }],
    },
    {
      x: W / 8,
      y: (H * 5) / 10,
      cx: (W * 6) / 8,
      cy: H / 10,
      paragraphs: [{ runs: [run(template.pages.coverSubtitle, 18)], align: 'center' }],
    },
  ])

  const agendaSlide = insertSlideWithLayout(opened, 0, layoutPath)
  if (!agendaSlide) throw new Error('failed to insert the agenda slide')
  fillSlide(
    agendaSlide,
    contentSlide('目录', template.pages.agenda),
  )

  for (const section of template.pages.sections) {
    const slide = insertSlideWithLayout(opened, opened.deck.slides.length - 1, layoutPath)
    if (!slide) throw new Error('failed to insert a content slide')
    fillSlide(slide, contentSlide(section.title, section.body))
  }

  const closing = insertSlideWithLayout(opened, opened.deck.slides.length - 1, layoutPath)
  if (!closing) throw new Error('failed to insert the closing slide')
  fillSlide(closing, [
    {
      x: W / 8,
      y: (H * 2) / 5,
      cx: (W * 6) / 8,
      cy: H / 5,
      paragraphs: [{ runs: [run(template.pages.closing, 36, true)], align: 'center' }],
    },
  ])

  return savePptx(opened)
}
