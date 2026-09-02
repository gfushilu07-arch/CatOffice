#!/usr/bin/env node
/**
 * Reduce the Windows Word line-height probe measurements (T2) into a factor
 * table and diff it against the current mac-probed values.
 *
 * Input:  measurements.json from collect.ps1 (per-sample line Y positions).
 * Output: windows-word-factors.json next to it, plus a console diff report.
 *
 * factor = median(adjacent line-position deltas) / fontSizePt — the same
 * "single-spacing line advance in em" the renderer's lineHeightFactor uses.
 * Page-break jumps (a delta far off the median) are discarded before the
 * median; the 24-line corpus should never paginate, but Word metrics quirks
 * (a taller face suddenly flowing to page 2) must not poison the estimate.
 *
 * Run: node tools/word-lineheight-probe/reduce.mjs <corpus-dir>
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

/** Current mac-probed factors (line-metrics.ts, snapshot 2026-09-02) keyed by
 * the corpus slug. Values the Windows probe measures differently become the
 * win32 dispatch-table candidates. */
const MAC_FACTORS = {
  simsun: 1.3029,
  nsimsun: 1.3029,
  simhei: 1.3029,
  'microsoft-yahei': 1.7143,
  kaiti: 1.3029,
  fangsong: 1.3029,
  dengxian: 1.36,
  pmingliu: 1.3029,
  mingliu: 1.3029,
  'dfkai-sb': 1.775,
  'ms-jhenghei': 1.775,
  meiryo: 1.9429,
  'ms-mincho': 1.3029,
  'malgun-gothic': 1.7371,
  batang: 1.3029,
  'times-new-roman': 1.15,
  cambria: 1.172,
  calibri: 1.22,
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function factorOf(sample) {
  const ys = sample.ys
  if (!Array.isArray(ys) || ys.length < 3) return null
  const deltas = []
  for (let i = 1; i < ys.length; i++) {
    const d = ys[i] - ys[i - 1]
    if (d > 0.5) deltas.push(d) // line advance is strictly positive
  }
  if (deltas.length < 3) return null
  const pitch = median(deltas)
  // discard pagination jumps: a delta far above the median is a page turn
  const kept = deltas.filter((d) => d < pitch * 3)
  const pitchClean = median(kept)
  return { pitchPt: Math.round(pitchClean * 1000) / 1000, factor: pitchClean / sample.sizePt }
}

const corpusDir = resolve(process.argv[2] ?? '.')
const raw = JSON.parse(readFileSync(join(corpusDir, 'measurements.json'), 'utf8'))
console.log(`Word ${raw.wordVersion} on ${raw.os} (${raw.samples.length} samples)\n`)

const factors = {}
const rows = []
for (const sample of raw.samples) {
  const r = factorOf(sample)
  if (!r) {
    console.log(`!! ${sample.slug} ${sample.sizePt}pt: unusable (${sample.lines} lines)`)
    continue
  }
  const f = Math.round(r.factor * 10000) / 10000
  const mac = MAC_FACTORS[sample.slug]
  factors[sample.slug] ??= {}
  factors[sample.slug][sample.sizePt] = { factor: f, pitchPt: r.pitchPt, font: sample.font }
  rows.push({ slug: sample.slug, size: sample.sizePt, factor: f, pitch: r.pitchPt, mac })
}

// consistency across the two sizes (Word factors are size-independent for
// lineRule=auto; a spread means a bad measurement, not a real difference)
const bySlug = new Map()
for (const row of rows) {
  bySlug.get(row.slug) ? bySlug.get(row.slug).push(row) : bySlug.set(row.slug, [row])
}

console.log('slug'.padEnd(18), 'size'.padStart(6), 'factor'.padStart(8), 'mac'.padStart(8), 'delta%'.padStart(8))
for (const [slug, list] of [...bySlug.entries()].sort()) {
  for (const row of list) {
    const delta = row.mac ? (((row.factor - row.mac) / row.mac) * 100).toFixed(1) : 'n/a'
    const flag = row.mac && Math.abs(row.factor - row.mac) / row.mac > 0.02 ? '  <-- differs' : ''
    console.log(
      slug.padEnd(18),
      String(row.size).padStart(6),
      row.factor.toFixed(4).padStart(8),
      String(row.mac ?? 'n/a').padStart(8),
      String(delta).padStart(8),
      flag,
    )
  }
  const sizes = list.map((r) => r.factor)
  if (sizes.length === 2 && Math.abs(sizes[0] - sizes[1]) / sizes[0] > 0.02) {
    console.log(`   !! ${slug}: the two sizes disagree by >2% — check the measurement`)
  }
}

const out = {
  wordVersion: raw.wordVersion,
  os: raw.os,
  collectedAt: raw.collectedAt,
  macSnapshot: 'line-metrics.ts 2026-09-02',
  factors,
}
const outPath = join(corpusDir, 'windows-word-factors.json')
writeFileSync(outPath, JSON.stringify(out, null, 2))
console.log(`\nwrote ${outPath}`)
console.log('next: port differing families into the win32 dispatch (font-platform/T4 seam)')
