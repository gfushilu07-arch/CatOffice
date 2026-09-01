#!/usr/bin/env node
/**
 * Measure the real line box Chromium computes for the bundled web fonts
 * (T3, docs/catoffice/cross-platform-plan.md).
 *
 * Why: on Linux the declared document faces are absent, so rendering lands on
 * the bundled @font-face families (Noto CJK SC subsets / Liberation / Carlito).
 * Chromium's normal line height follows THAT face's metrics — the macOS-probed
 * factors in line-metrics.ts describe faces that do not exist on Linux and do
 * not model the bundled subsets. This tool measures ground truth and emits:
 *
 *   1. tests fixture  apps/docs/tests/fixtures/font-linebox/<platform>.json
 *   2. generated table apps/docs/src/renderer/font-linebox-linux.generated.ts
 *
 * A page loads fonts.css over file:// (relative font URLs resolve), waits for
 * every family to load, then reads the block height of a single-line probe
 * div at font-size:100px with line-height:normal — the ratio height/100 is
 * exactly the factor the CSS --doc-line-factor machinery must use to make the
 * editing canvas match the paginated model on that platform.
 *
 * Run from the repo root (needs a Playwright Chromium: PLAYWRIGHT_BROWSERS_PATH
 * per README when the cache lives off the default path):
 *   PLAYWRIGHT_BROWSERS_PATH=… node tools/measure-font-linebox.mjs
 *
 * Samples stay inside the subsets' coverage (GB2312-range Han for the CJK
 * faces, plain ASCII for Latin): a missing glyph would silently measure the
 * per-glyph fallback instead of the family.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const FONTS_CSS = join(ROOT, 'apps/docs/src/renderer/fonts/fonts.css')
const FIXTURE_DIR = join(ROOT, 'apps/docs/tests/fixtures/font-linebox')
const GENERATED_TS = join(ROOT, 'apps/docs/src/renderer/font-linebox-linux.generated.ts')

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_CORE_PATH ?? 'playwright-core')

/** file-backed families only — local()-only aliases never render on Linux. */
const FAMILIES = [
  { name: 'Noto Sans CJK SC', sample: '中文字体测试', cjk: true },
  { name: 'Noto Serif CJK SC', sample: '中文字体测试', cjk: true },
  { name: 'GenOffice Sans KR', sample: '한글', cjk: true },
  { name: 'GenOffice Serif KR', sample: '한글', cjk: true },
  { name: 'GenOffice Gothic KR', sample: '한글', cjk: true },
  { name: 'GenOffice Fullwidth TC', sample: '，', cjk: true },
  { name: 'GenOffice Che Latin KR', sample: 'abcxyzhk', cjk: false },
  { name: 'Latin Sans GO', sample: 'abcxyzhk', cjk: false },
  { name: 'Latin Serif GO', sample: 'abcxyzhk', cjk: false },
  { name: 'KR Theme Latin GO', sample: 'abcxyzhk', cjk: false },
  { name: 'Carlito GO', sample: 'abcxyzhk', cjk: false },
  { name: 'Liberation Serif', sample: 'abcxyzhk', cjk: false },
  { name: 'Liberation Sans', sample: 'abcxyzhk', cjk: false },
  { name: 'Liberation Mono', sample: 'abcxyzhk', cjk: false },
  { name: 'Caladea', sample: 'abcxyzhk', cjk: false },
]

const FONT_SIZE = 100

async function main() {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    const cssUrl = `file://${FONTS_CSS}`
    await page.setContent(
      `<!doctype html><html><head><link rel="stylesheet" href="${cssUrl}"></head>` +
        '<body>probe</body></html>',
      { waitUntil: 'load' },
    )
    await page.waitForFunction(() => document.fonts.status === 'loaded', null, { timeout: 15_000 })

    const results = await page.evaluate(
      async ({ families, fontSize }) => {
        const out = []
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        for (const fam of families) {
          const quoted = `"${fam.name}"`
          try {
            await document.fonts.load(`${fontSize}px ${quoted}`, fam.sample)
            const loaded = document.fonts.check(`${fontSize}px ${quoted}`, fam.sample)
            // DOM line box: a single-character div with line-height normal
            const div = document.createElement('div')
            div.style.cssText =
              `font-family:${quoted};font-size:${fontSize}px;line-height:normal;` +
              'position:absolute;white-space:nowrap;margin:0;padding:0;'
            div.textContent = fam.sample[0]
            document.body.appendChild(div)
            const height = div.getBoundingClientRect().height
            document.body.removeChild(div)
            // Canvas cross-check: font bounding box of the same face
            ctx.font = `${fontSize}px ${quoted}`
            const m = ctx.measureText(fam.sample)
            out.push({
              name: fam.name,
              cjk: fam.cjk,
              loaded,
              domRatio: height / fontSize,
              bboxRatio: (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent) / fontSize,
              ascentRatio: m.fontBoundingBoxAscent / fontSize,
            })
          } catch (err) {
            out.push({ name: fam.name, cjk: fam.cjk, loaded: false, error: String(err) })
          }
        }
        return out
      },
      { families: FAMILIES, fontSize: FONT_SIZE },
    )

    const platform = process.platform
    const loaded = results.filter((r) => r.loaded && Number.isFinite(r.domRatio))
    const failed = results.filter((r) => !r.loaded || !Number.isFinite(r.domRatio))
    for (const f of failed) console.warn(`[linebox] not loadable: ${f.name} (${f.error ?? 'no load'})`)
    if (loaded.length === 0) throw new Error('no family loaded — fonts.css unreachable?')

    const doc = {
      _meta: {
        tool: 'tools/measure-font-linebox.mjs',
        method: 'single-line div, line-height:normal, font-size 100px; canvas fontBoundingBox cross-check',
        chromium: browser.version(),
        measuredOn: platform,
        note:
          'Ratios are properties of the bundled font files as laid out by Blink. ' +
          'The linux table is generated from the file-backed families that a bare ' +
          'Linux host reaches; regenerate after touching fonts.css.',
      },
      families: loaded,
    }
    mkdirSync(FIXTURE_DIR, { recursive: true })
    writeFileSync(join(FIXTURE_DIR, `${platform}.json`), `${JSON.stringify(doc, null, 2)}\n`)

    // Generated runtime table: the Linux effective faces are the bundled
    // file-backed families; keep CJK and Latin entries for chain resolution.
    const table = Object.fromEntries(loaded.map((r) => [r.name, Math.round(r.domRatio * 10000) / 10000]))
    const header =
      `/** GENERATED by tools/measure-font-linebox.mjs — do not edit by hand.\n` +
      ` * Normal line box / font size as laid out by Chromium (${doc._meta.chromium})\n` +
      ` * for the bundled file-backed families. Consumed by line-metrics.ts\n` +
      ` * under the linux platform profile; regenerate after fonts.css changes.\n */\n\n` +
      `export const LINUX_LINE_FACTORS: Record<string, number> = ${JSON.stringify(table, null, 2)}\n`
    writeFileSync(GENERATED_TS, header)
    console.log(`[linebox] measured ${loaded.length} families on ${platform}`)
    for (const r of loaded) console.log(`  ${r.name.padEnd(20)} dom=${r.domRatio.toFixed(4)} bbox=${r.bboxRatio.toFixed(4)}`)
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
