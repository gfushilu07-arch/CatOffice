/**
 * Kinsoku (line-prohibition) behavior of the offline line-break simulation.
 * Widths are stubbed to 10px/char so every scenario is hand-traceable:
 * with a 70px line, exactly seven 10px chars fit.
 *
 * Rule parity with the pptx text layout (packages/pptx-render/src/kinsoku.ts):
 * a closing mark never starts a line, an opening bracket never ends one, and
 * the break moves EARLIER by pulling CJK predecessors down (no hanging into
 * the margin unless no interior break exists).
 */

import { describe, expect, it } from 'vitest'
import { simulateLines, type FontMetricsProvider } from '../src/renderer/line-metrics'

const stubMetrics: FontMetricsProvider = {
  metrics: () => ({ ascent: 8, descent: 4, lineHeight: 12 }),
  measure: (text: string) => [...text].length * 10,
}

const LINES = (text: string, availWidthPx = 70) =>
  simulateLines([{ text }], availWidthPx, stubMetrics, 12, 'SimSun').map((l) => l.text)

describe('simulateLines kinsoku', () => {
  it('never starts a line with a closing mark', () => {
    expect(LINES('一二三四五六七。')).toEqual(['一二三四五六', '七。'])
  })

  it('never ends a line with an opening bracket', () => {
    expect(LINES('一二三四五六（七')).toEqual(['一二三四五六', '（七'])
  })

  it('pulls a run of predecessors for consecutive closing marks', () => {
    // The ideographic comma would start the new line; pulling the preceding
    // closing mark still leaves a forbidden head, so one more char comes down.
    expect(LINES('一二三四五六）」')).toEqual(['一二三四五', '六）」'])
  })

  it('pulls across fullwidth commas and ideographic full stops alike', () => {
    expect(LINES('一二三四五六七，')).toEqual(['一二三四五六', '七，'])
  })

  it('does not pull out of a Latin word (documented approximation)', () => {
    // The last char is Latin — word-level re-flow is a follow-up; the closing
    // mark starts the next line as before the kinsoku change.
    expect(LINES('ab六c。', 40)).toEqual(['ab六c', '。'])
  })

  it('hangs when a single CJK char plus a closing mark cannot be split', () => {
    // Pulling the only CJK char would empty the line — the run stays overfull
    // on one line instead of emitting an empty first line.
    expect(LINES('一。', 10)).toEqual(['一。'])
  })

  it('keeps a closing mark at the paragraph start (no kinsoku before any content)', () => {
    expect(LINES('。一二三四五六七', 70)).toEqual(['。一二三四五六', '七'])
  })

  it('leaves the keep-all (Korean) path untouched when the line fits', () => {
    expect(LINES('가나다라마바。', 70)).toEqual(['가나다라마바。'])
  })

  it('hard-breaks an over-wide keep-all run width-only (documented follow-up)', () => {
    // The hard-break fragmenter does not apply kinsoku yet; the closing mark
    // lands at the start of the second line.
    expect(LINES('가나다라마바사。', 70)).toEqual(['가나다라마바사', '。'])
  })

  it('keeps plain CJK wrapping unchanged', () => {
    expect(LINES('一二三四五六七八九十', 70)).toEqual(['一二三四五六七', '八九十'])
  })
})
