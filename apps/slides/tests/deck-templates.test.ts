/**
 * Deck template presets (asset center S2): the work-report skeleton must
 * round-trip through the real pptx-engine — save, reopen, and find every
 * page's text on the slides.
 */
import { describe, expect, it } from 'vitest'
import { DECK_TEMPLATES, deckTemplateById, deckTemplatePptx } from '../src/main/deck-templates'
import { openPptx } from '@genoffice/pptx-engine'

interface SlideLike {
  elements: Array<{
    type: string
    text?: { paragraphs?: Array<{ runs?: Array<{ text?: string }> }> }
  }>
}

const slideTexts = (deck: { slides: SlideLike[] }): string[] =>
  deck.slides.map((slide) =>
    slide.elements
      .map((el) =>
        el.type === 'text'
          ? (el.text?.paragraphs ?? [])
              .flatMap((p) => (p.runs ?? []).map((r) => r.text ?? ''))
              .join('')
          : '',
      )
      .join('\n'),
  )

describe('deck template presets', () => {
  it('ships the work-report and proposal skeletons with stable ids', () => {
    expect(DECK_TEMPLATES.map((t) => t.id)).toEqual([
      'deck-weekly-report',
      'deck-proposal',
      'deck-training',
    ])
    expect(deckTemplateById('deck-weekly-report')?.label).toBe('工作汇报')
    expect(deckTemplateById('deck-proposal')?.label).toBe('项目提案')
    expect(DECK_TEMPLATES[0]!.pages.sections).toHaveLength(3)
    expect(DECK_TEMPLATES[1]!.pages.sections).toHaveLength(3)
  })

  it('renders six slides whose text survives save/reopen', async () => {
    const bytes = await deckTemplatePptx(DECK_TEMPLATES[0]!)
    const opened = await openPptx(bytes)
    expect(opened.deck.slides).toHaveLength(6) // cover + agenda + 3 sections + closing

    const texts = slideTexts(opened.deck as never)
    expect(texts[0]).toContain('××××××工作汇报')
    expect(texts[0]).toContain('汇报人：××')
    expect(texts[1]).toContain('目录')
    expect(texts[1]).toContain('一、工作进展')
    expect(texts[2]).toContain('一、工作进展')
    expect(texts[5]).toContain('谢谢观看')
  })
})
