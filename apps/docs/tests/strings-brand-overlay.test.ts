/**
 * Brand copy override layer (upstream-sync principle 3): the rebrand lives in
 * strings-brand.ts and merges LAST in strings-merged.ts, while the upstream
 * strings files stay byte-identical to the GenOffice snapshot. These tests
 * lock all three sides: the merged view rebrands the three keys in every
 * language, passes every other key through untouched, and the upstream files
 * carry no brand edits (a regression here would reintroduce upstream sync
 * conflicts — the whole point of the layer).
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { strings } from '../src/renderer/i18n/strings-merged'
import { brandStrings } from '../src/renderer/i18n/strings-brand'
import type { Lang } from '@genoffice/i18n'

const HERE = dirname(fileURLToPath(import.meta.url))
const LANGS = [
  'zh', 'en', 'ja', 'ko', 'fr', 'de', 'es', 'th', 'id', 'ru', 'ar', 'pt', 'it', 'pl', 'nl', 'ms',
  'he', 'hi', 'zh-TW',
] as const
const BRAND_KEYS = [
  'appGensparkAccount',
  'appNotLoggedIn',
  'appLoginGenspark',
  'aiGskLoginBtn',
  'aiPanelTitle',
  'ribbonAiAssistant',
] as const
/** this key rebrands wherever the upstream snapshot carries it (its value was
 *  written multi-line in the shard, so every locale still rebrands) */
const PARTIAL_KEYS = ['aiCreditsExhausted'] as const

describe('brand override layer', () => {
  it('rebrands the brand keys in every language, never mentioning Genspark', () => {
    for (const lang of LANGS) {
      const dict = strings[lang as Lang]
      for (const key of BRAND_KEYS) {
        expect(dict[key], `${lang}/${key}`).toContain('Catspark')
        expect(dict[key], `${lang}/${key}`).not.toContain('Genspark')
      }
      for (const key of PARTIAL_KEYS) {
        if (dict[key] === undefined) continue
        expect(dict[key], `${lang}/${key}`).toContain('Catspark')
        expect(dict[key], `${lang}/${key}`).not.toContain('Genspark')
      }
    }
  })

  it('every language still covers the full key set (createI18n contract)', () => {
    const zhKeys = Object.keys(strings.zh).sort()
    for (const lang of LANGS) {
      expect(Object.keys(strings[lang as Lang]).sort(), lang).toEqual(zhKeys)
    }
  })

  it('passes non-brand keys through untouched (spot check)', () => {
    expect(strings.zh.appClose).toBe('关闭')
    expect(strings.en.appClose).toBe('Close')
    // a fork-ADDED key rides the appStrings shard, unaffected by the overlay
    expect(strings.zh.appProtectEncryptAlgo).toContain('加密算法')
  })

  it('the override pack covers exactly the brand key set', () => {
    for (const lang of LANGS) {
      const keys = Object.keys(brandStrings[lang as Lang]).sort()
      expect(keys.length, lang).toBeGreaterThanOrEqual(BRAND_KEYS.length)
      for (const key of keys) {
        expect(
          ([...BRAND_KEYS, ...PARTIAL_KEYS] as readonly string[]).includes(key),
          `${lang}/${key} is not a brand key`,
        ).toBe(true)
      }
    }
    expect(Object.keys(brandStrings.zh).sort()).toEqual(
      [...BRAND_KEYS, ...PARTIAL_KEYS].sort(),
    )
  })

  it('upstream strings files carry no fork brand edits (sync-conflict guard)', () => {
    const dir = join(HERE, '../src/renderer/i18n')
    for (const file of ['strings.ts', 'strings-app.ts', 'strings-ribbon.ts', 'strings-editor.ts', 'strings-table.ts', 'strings-ai.ts', 'locale.tsx']) {
      const text = readFileSync(join(dir, file), 'utf8')
      expect(text.includes('Catspark'), `${file} must stay free of brand values`).toBe(false)
    }
  })
})
