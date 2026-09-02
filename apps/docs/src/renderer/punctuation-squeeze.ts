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
  return squeezeRightsAcrossEm([text])[0]!
}

/**
 * Same rule applied across a sequence of adjacent text pieces (a paragraph's
 * runs / text nodes): a closing mark at the end of one piece compresses when
 * the next piece starts with another closing mark, and runs never merge
 * across a non-compressible character. Returns one array per piece, each
 * parallel to that piece's code points. Empty pieces yield empty arrays.
 */
export function squeezeRightsAcrossEm(pieces: string[]): number[][] {
  const chars = pieces.map((p) => [...p])
  const out = chars.map((c) => new Array<number>(c.length).fill(0))
  // walk the flat sequence with (piece, index) coordinates
  let pi = 0
  let ci = 0
  const next = (): [number, number] | null => {
    let p = pi
    let c = ci
    for (;;) {
      c++
      if (c < chars[p]!.length) return [p, c]
      p++
      c = 0
      if (p >= chars.length) return null
      if (chars[p]!.length === 0) continue
      return [p, c]
    }
  }
  while (pi < chars.length) {
    if (chars[pi]!.length === 0 || !isCompressibleClose(chars[pi]![ci]!)) {
      const n = next()
      if (!n) break
      ;[pi, ci] = n
      continue
    }
    // collect the maximal run of adjacent closing marks across pieces
    const run: Array<[number, number]> = [[pi, ci]]
    for (;;) {
      const n = next()
      if (!n || !isCompressibleClose(chars[n[0]]![n[1]]!)) break
      run.push(n)
      ;[pi, ci] = n
    }
    for (const [p, c] of run.slice(0, -1)) out[p]![c] = -0.5
    const n = next()
    if (!n) break
    ;[pi, ci] = n
  }
  return out
}
