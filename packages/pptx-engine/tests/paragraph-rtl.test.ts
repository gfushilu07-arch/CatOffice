/**
 * Explicit paragraph base direction (a:pPr rtl="1") across the pptx pipeline:
 * parse reads it into Paragraph.rtl (with pPrExplicit so surgical rebuilds keep
 * it), generate writes it back, and a pPr without rtl stays untouched. Arabic
 * decks write rtl="1" on every paragraph — dropping it handed the base
 * direction to the render-side first-strong inference, which loses paragraphs
 * whose text starts with Latin/digits inside an RTL document.
 */
import { describe, it, expect } from 'vitest'
import { parseSlide } from '../src/parse'
import { generateParagraphXml, patchedElementXml } from '../src/index'
import type { TextElement } from '../src/types'

const slideWith = (sp: string) =>
  '<?xml version="1.0"?><p:sld xmlns:p="p" xmlns:a="a"><p:cSld>' +
  `<p:spTree><p:nvGrpSpPr/><p:grpSpPr/>${sp}</p:spTree></p:cSld></p:sld>`
const spWith = (txBodyInner: string) =>
  '<p:sp><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="100" cy="100"/></a:xfrm></p:spPr>' +
  `<p:txBody>${txBodyInner}</p:txBody></p:sp>`

const parseOne = (txBodyInner: string) => {
  const slide = parseSlide({
    path: 'ppt/slides/slide1.xml',
    slideXml: slideWith(spWith(txBodyInner)),
    ctx: {},
  })
  return { slide, el: slide.elements[0] as TextElement }
}

describe('a:pPr rtl="1" parse', () => {
  it('reads rtl="1" into Paragraph.rtl (explicit RTL base)', () => {
    const { el } = parseOne(
      '<a:bodyPr/><a:p><a:pPr rtl="1" algn="r"/><a:r><a:t>سلام</a:t></a:r></a:p>',
    )
    const p = el.text!.paragraphs[0]!
    expect(p.rtl).toBe(true)
    expect(p.align).toBe('right')
  })

  it('rtl="true" counts as explicit too', () => {
    const { el } = parseOne('<a:bodyPr/><a:p><a:pPr rtl="true"/><a:r><a:t>x</a:t></a:r></a:p>')
    expect(el.text!.paragraphs[0]!.rtl).toBe(true)
  })

  it('a paragraph without rtl stays rtl-less (inference stays render-side)', () => {
    const { el } = parseOne('<a:bodyPr/><a:p><a:r><a:t>سلام</a:t></a:r></a:p>')
    const p = el.text!.paragraphs[0]!
    expect(p.rtl).toBeUndefined()
  })
})

describe('a:pPr rtl="1" write-back', () => {
  it('generateParagraphXml re-emits rtl="1" when explicit', () => {
    const { el } = parseOne('<a:bodyPr/><a:p><a:pPr rtl="1"/><a:r><a:t>سلام</a:t></a:r></a:p>')
    const xml = generateParagraphXml(el.text!.paragraphs[0]!)
    expect(xml).toContain('rtl="1"')
  })

  it('surgical element patch preserves the rtl attribute (run bytes untouched)', () => {
    const RUN = '<a:r><a:t>سلام</a:t></a:r>'
    const { el } = parseOne(`<a:bodyPr/><a:p><a:pPr rtl="1"/>${RUN}</a:p>`)
    const out = patchedElementXml(el)
    expect(out).toContain('rtl="1"')
    expect(out).toContain(RUN)
  })

  it('an inferred (absent) rtl writes no rtl attribute', () => {
    const { el } = parseOne('<a:bodyPr/><a:p><a:r><a:t>x</a:t></a:r></a:p>')
    const xml = generateParagraphXml(el.text!.paragraphs[0]!)
    expect(xml).not.toContain('rtl=')
  })

  it('explicit rtl="0" round-trips as an explicit LTR base (upstream three-state model)', () => {
    const { el } = parseOne('<a:bodyPr/><a:p><a:pPr rtl="0"/><a:r><a:t>x</a:t></a:r></a:p>')
    expect(el.text!.paragraphs[0]!.rtl).toBe(false)
    expect(generateParagraphXml(el.text!.paragraphs[0]!)).toContain('rtl="0"')
  })
})
