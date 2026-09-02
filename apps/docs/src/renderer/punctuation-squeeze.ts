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

/** Fullwidth opening brackets/quotes (the symmetric compression class). */
const COMPRESSIBLE_OPEN = new Set([
  ...'（［｛｟｢', // opening brackets/braces
  ...'〈《「『【〔〝', // CJK opening quotes/brackets
])

/** True when `ch` is a fullwidth closing mark that can compress inside a run. */
export function isCompressibleClose(ch: string): boolean {
  return COMPRESSIBLE_CLOSE.has(ch)
}

/** True when `ch` is a fullwidth opening bracket that can compress inside a run. */
export function isCompressibleOpen(ch: string): boolean {
  return COMPRESSIBLE_OPEN.has(ch)
}

/**
 * Per-code-point compression (em) of one maximal punctuation run: closing
 * marks compress on the right (all but the run's last), opening brackets on
 * the left (all but the run's first) — so a closed pair like an open bracket
 * adjacent to a closing mark (no blank between the glyphs) keeps its natural
 * spacing while runs of same-side marks halve the duplicated whitespace.
 * The result is addressed by flat run position.
 */
function runAdjustments(run: string[]): Array<{ right: number; left: number }> {
  const n = run.length
  return run.map((ch, i) => {
    if (isCompressibleClose(ch)) return { right: i === n - 1 ? 0 : -0.5, left: 0 }
    return { right: 0, left: i === 0 ? 0 : -0.5 } // opening bracket
  })
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
  return squeezeAcrossEm([text])[0]!.right
}

/** Per-side compression (em) parallel to a piece's code points. */
export interface SqueezeSide {
  /** trailing-blank compression (closing marks inside a run) */
  right: number[]
  /** leading-blank compression (opening brackets inside a run) */
  left: number[]
}

/**
 * The compression rule across a sequence of adjacent text pieces (a
 * paragraph's runs / text nodes): a punctuation run may span piece
 * boundaries, and closing marks compress on the right / opening brackets on
 * the left per runAdjustments. Returns one result per piece, each parallel to
 * that piece's code points. Empty pieces yield empty arrays.
 */
export function squeezeAcrossEm(pieces: string[]): SqueezeSide[] {
  const chars = pieces.map((p) => [...p])
  const right = chars.map((c) => new Array<number>(c.length).fill(0))
  const left = chars.map((c) => new Array<number>(c.length).fill(0))
  // walk the flat sequence with (piece, index) coordinates
  let pi = 0
  let ci = 0
  const at = (p: number, c: number): string => chars[p]![c]!
  const isMember = (ch: string): boolean => isCompressibleClose(ch) || isCompressibleOpen(ch)
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
    if (chars[pi]!.length === 0 || !isMember(at(pi, ci))) {
      const n = next()
      if (!n) break
      ;[pi, ci] = n
      continue
    }
    // collect the maximal mixed run of closing marks / opening brackets
    const run: Array<[number, number]> = [[pi, ci]]
    for (;;) {
      const n = next()
      if (!n || !isMember(at(n[0], n[1]))) break
      run.push(n)
      ;[pi, ci] = n
    }
    const adjustments = runAdjustments(run.map(([p, c]) => at(p, c)))
    run.forEach(([p, c], k) => {
      right[p]![c] = adjustments[k]!.right
      left[p]![c] = adjustments[k]!.left
    })
    const n = next()
    if (!n) break
    ;[pi, ci] = n
  }
  return right.map((r, p) => ({ right: r, left: left[p]! }))
}
