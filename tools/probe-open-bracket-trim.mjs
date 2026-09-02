/**
 * Probe: does Chromium's native text-spacing-trim compress a fullwidth opening
 * bracket adjacent to a fullwidth closing mark, or after a hanzi at line start?
 * Cases measured at 100px font; a half-width trim = 50px per mark.
 */
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '.')
const require = createRequire('/Users/fushilu/workspace/revocloud/CatOffice/package.json')
const { chromium } = require('playwright-core')

const FONTS_CSS = resolve(ROOT, 'apps/docs/src/renderer/fonts/fonts.css')
const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent(
  `<!doctype html><html><head><link rel="stylesheet" href="file://${FONTS_CSS}"></head><body></body></html>`,
  { waitUntil: 'load' },
)
await page.waitForFunction(() => document.fonts.status === 'loaded', null, { timeout: 15000 })

const size = 100
const cases = [
  { label: 'control 6x 一', text: '一'.repeat(6), trim: 'space-all' },
  { label: 'close( 一  (open after hanzi, space-all)', text: '一（一', trim: 'space-all' },
  { label: 'close( 一  (open after hanzi, trim-auto)', text: '一（一', trim: 'normal' },
  { label: '）。 close-then-open (space-all)', text: '一）。一', trim: 'space-all' },
  { label: '）。 close-then-open (trim-auto)', text: '一）。一', trim: 'normal' },
  { label: '（( lone open between hanzi (trim-auto)', text: '一「一', trim: 'normal' },
]
const out = []
for (const c of cases) {
  const width = await page.evaluate(
    async ({ text, trim, size }) => {
      const host = document.createElement('div')
      host.style.cssText = `font-family:'Noto Sans CJK SC';font-size:${size}px;position:absolute;white-space:nowrap;text-spacing-trim:${trim};`
      document.body.appendChild(host)
      await document.fonts.load(`${size}px 'Noto Sans CJK SC'`, '一中文字（）。')
      const div = document.createElement('div')
      div.style.cssText = 'line-height:normal;margin:0;padding:0;'
      div.textContent = text
      host.appendChild(div)
      const w = div.getBoundingClientRect().width
      host.remove()
      return w
    },
    { text: c.text, trim: c.trim, size },
  )
  out.push({ label: c.label, width })
  console.log(c.label.padEnd(46), width)
}
await browser.close()
