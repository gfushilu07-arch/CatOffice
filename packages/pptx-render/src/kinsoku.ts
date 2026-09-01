/**
 * East-Asian kinsoku (line-prohibition) character sets.
 *
 * Closing marks / small kana must not BEGIN a line; opening brackets must not
 * END one. Shared by the pptx text layout (PowerPoint default rules) and the
 * docs offline pagination model (line-metrics simulateLines) so both predict
 * the same break points; both engines break earlier and carry the forbidden
 * characters to the other line rather than hanging them into the margin.
 *
 * Pure data — no imports — safe for any bundle.
 */

/** Closing marks, fullwidth punctuation, small kana: must not start a line. */
export const KINSOKU_NO_START: ReadonlySet<string> = new Set(
  '、。々,.!?:;)]}%，．！？：；）］｝％〉》」』】〕〟｡｣､･ｰﾞﾟ・ーぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶ゛゜ゝゞヽヾ',
)

/** Opening brackets / currency prefixes: must not end a line. */
export const KINSOKU_NO_END: ReadonlySet<string> = new Set('([{$（［｛＄〈《「『【〔〝｢£¥￡￥')

/** True when `ch` is forbidden at a line start (a single grapheme). */
export function isKinsokuNoStart(ch: string): boolean {
  return KINSOKU_NO_START.has(ch)
}

/** True when `ch` is forbidden at a line end (a single grapheme). */
export function isKinsokuNoEnd(ch: string): boolean {
  return KINSOKU_NO_END.has(ch)
}
