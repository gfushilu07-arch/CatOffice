/**
 * Punctuation compression model (T5 phase 1, docs/catoffice/cross-platform-plan.md).
 *
 * Word's default for CJK documents compresses runs of fullwidth closing
 * marks: within a maximal run of adjacent closing punctuation, every member
 * except the last gives up its trailing half width. This module is the single
 * source of that rule — the offline pagination model (line-metrics
 * simulateLines) and the editing canvas (PunctSqueezeExtension decorations)
 * both consume it, so page breaks and visible layout stay in lockstep.
 *
 * Phase 1 covers consecutive-mark runs only: line-edge compression (line-start
 * / line-end half-width faces) needs the break points, which the flowing
 * editing canvas does not know — that lands with the paginated render path.
 * The renderer also pins `text-spacing-trim: space-all` on the page (see
 * styles.css): Chromium's native trimming would stack with these decorations
 * and double-compress every run. Pure data, no imports.
 *
 * The model is gated by the document's settings.xml w:characterSpacingControl
 * (Word's Asian-typography punctuation compression): absent keeps this fork's
 * CJK default (compress — the value Word itself writes for zh documents), an
 * explicit doNotCompress turns every consumer off via
 * setPunctuationCompressionEnabled.
 */

/** Fullwidth closing marks that participate in compression runs. */
const COMPRESSIBLE_CLOSE = new Set([
  ...'、。，．：；！？', // ideographic + fullwidth basics
  ...'）］｝｠｣', // closing brackets/braces
  ...'〉》」』】〕', // CJK closing quotes/brackets
  ...'％', // fullwidth percent
])

/** True when `ch` is a fullwidth closing mark that can compress inside a run. */
export function isCompressibleClose(ch: string): boolean {
  return COMPRESSIBLE_CLOSE.has(ch)
}

let compressionEnabled = true

/**
 * Document-level switch (settings.xml w:characterSpacingControl): the open
 * path calls this with `parsed.characterSpacingControl !== 'doNotCompress'`.
 * Both consumers (simulateLines, PunctSqueezeExtension) read the same flag so
 * pagination prediction and the canvas never disagree.
 */
export function setPunctuationCompressionEnabled(on: boolean): void {
  compressionEnabled = on
}

export function punctuationCompressionEnabled(): boolean {
  return compressionEnabled
}

/**
 * Right-side advance adjustment (em, 0 or -0.5) per code point of `text`:
 * inside a maximal run of compressible closing marks every member except the
 * last is compressed to half width. The array is parallel to [...text].
 */
export function squeezeRightsEm(text: string): number[] {
  const chars = [...text]
  const out = new Array<number>(chars.length).fill(0)
  let i = 0
  while (i < chars.length) {
    if (!isCompressibleClose(chars[i]!)) {
      i++
      continue
    }
    let j = i + 1
    while (j < chars.length && isCompressibleClose(chars[j]!)) j++
    for (let k = i; k < j - 1; k++) out[k] = -0.5
    i = j
  }
  return out
}
