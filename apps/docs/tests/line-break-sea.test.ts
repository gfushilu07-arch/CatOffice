/**
 * Southeast-Asian word segmentation in the offline line-break simulation.
 * Widths are stubbed to 10px/char so every scenario is hand-traceable:
 * with a 70px line, exactly seven 10px chars fit.
 *
 * Thai/Lao/Burmese/Khmer have no spaces between words. Before Intl.Segmenter
 * the whole SEA run buffered as ONE "word" (flushWord) and hard-broke every
 * N chars — mid-word, nothing like what the browser renders. Now the buffer
 * splits into dictionary words (Intl.Segmenter, word granularity — the same
 * WORD_SEG/SEA_RE scheme as the pptx text layout) and each word re-enters
 * the normal flush path, so breaks land on word boundaries.
 */

import { describe, expect, it } from 'vitest'
import {
  SEA_RE,
  segmentSeaWords,
  simulateLines,
  type FontMetricsProvider,
} from '../src/renderer/line-metrics'

const stubMetrics: FontMetricsProvider = {
  metrics: () => ({ ascent: 8, descent: 4, lineHeight: 12 }),
  measure: (text: string) => [...text].length * 10,
}

const LINES = (text: string, availWidthPx = 70) =>
  simulateLines([{ text }], availWidthPx, stubMetrics, 12, 'SimSun').map((l) => l.text)

describe('simulateLines SEA word segmentation', () => {
  it('splits Thai into dictionary words and round-trips exactly', () => {
    const text = 'การเบิกจ่าย'
    const words = segmentSeaWords(text)
    expect(words.length).toBeGreaterThan(1)
    expect(words.join('')).toBe(text)
  })

  it('breaks Thai at word boundaries, not mid-word', () => {
    // การ(30) + เบิก(40) fit 70px exactly; จ่าย(40) wraps. The old unsplit
    // buffer hard-broke at 7 code points instead: การเบิกจ / ่าย.
    expect(LINES('การเบิกจ่าย')).toEqual(['การเบิก', 'จ่าย'])
  })

  it('never splits a word across a line break (segmentation parity)', () => {
    // Property form (robust against dictionary updates): segmenting the lines
    // individually must yield the same word stream as segmenting the whole
    // paragraph — a mid-word break would split one segment into two.
    const text = 'การรายงานผลการดำเนินงาน'
    expect(LINES(text).flatMap(segmentSeaWords).join('|')).toBe(
      segmentSeaWords(text).join('|'),
    )
    expect(LINES(text).join('')).toBe(text)
  })

  it('hard-breaks an overlong single word (unbreakable-word fallback)', () => {
    // ดำเนิน is one 6-code-point dictionary word (60px) on a 50px line: no
    // interior break exists, so it fragments like an overlong Latin word.
    expect(LINES('ดำเนิน', 50)).toEqual(['ดำเนิ', 'น'])
  })

  it('keeps SEA words whole when wrapping next to CJK flow chars', () => {
    // The hanzi flows through the per-char CJK path; the Thai tail buffers
    // and flushes at run end as whole words: 10+30 fits, then 40 alone
    // (เบิก+จ่าย = 80px could never share a 70px line).
    expect(LINES('一การเบิกจ่าย')).toEqual(['一การ', 'เบิก', 'จ่าย'])
    // And leading: the Thai buffer flushes when the CJK char arrives
    // (flushWord before the CJK path), so the break never lands inside เบิก.
    expect(LINES('การเบิก一')).toEqual(['การเบิก', '一'])
  })

  it('treats a Thai-Latin mix as one segment (Segmenter semantics)', () => {
    // Intl.Segmenter keeps การA together; the model must not invent a break
    // the browser wouldn't take. การA = 40px wraps whole after 3 chars fit.
    expect(LINES('一การA', 40)).toEqual(['一', 'การA'])
  })

  it('SEA detection regex matches the four no-space scripts', () => {
    expect(SEA_RE.test('ก')).toBe(true) // Thai
    expect(SEA_RE.test('ກ')).toBe(true) // Lao
    expect(SEA_RE.test('က')).toBe(true) // Burmese
    expect(SEA_RE.test('ក')).toBe(true) // Khmer
    expect(SEA_RE.test('一A9')).toBe(false)
  })
})
