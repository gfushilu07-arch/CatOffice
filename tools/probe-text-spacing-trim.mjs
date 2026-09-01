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

const cases = [
  { text: '一'.repeat(6), label: 'control 6x 一' },
  { text: '一。。。一', label: 'consecutive 。。。' },
  { text: '一、，、一', label: 'mixed close marks' },
  { text: 'x。一', label: 'line-start scenario (post-break head)' },
]
const langs = [null, 'zh-CN']
const trims = ['normal', 'space-all', 'trim-all']

async function measure(lang, trimStyle) {
  return page.evaluate(async ({ cases, lang, trimStyle, size }) => {
    const host = document.createElement('div')
    if (lang) host.lang = lang
    host.style.cssText = `font-family:'Noto Sans CJK SC';font-size:${size}px;position:absolute;white-space:nowrap;`
    if (trimStyle) host.style.textSpacingTrim = trimStyle
    document.body.appendChild(host)
    await document.fonts.load(`${size}px 'Noto Sans CJK SC'`, '一中文字，。')
    const out = []
    for (const c of cases) {
      const div = document.createElement('div')
      div.style.cssText = 'line-height:normal;margin:0;padding:0;'
      div.textContent = c.text
      host.appendChild(div)
      out.push({ label: c.label, width: div.getBoundingClientRect().width })
      host.removeChild(div)
    }
    host.remove()
    return out
  }, { cases, lang, trimStyle, size: 100 })
}

for (const lang of langs) {
  for (const trim of trims) {
    const rows = await measure(lang, trim)
    console.log(`lang=${lang ?? '(none)'} trim=${trim}: ` + rows.map((r) => `${r.label}=${r.width.toFixed(0)}`).join(' | '))
  }
}
await browser.close()
