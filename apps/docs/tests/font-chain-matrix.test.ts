/**
 * Cross-platform font-chain matrix (T1 + T4, docs/catoffice/cross-platform-plan.md).
 *
 * Locks the font-substitution logic (cssFontFamily and the line-height factors)
 * over a corpus covering the three-platform font matrix: Windows-native classics
 * (SimSun/YaHei/…), macOS substitutes, Japanese/Korean/Traditional faces,
 * open-source Noto/Source Han families, vendor faces that fall into the
 * name-guess path, and Western anchors.
 *
 * One run computes the corpus under ALL THREE platform profiles (setFontPlatform
 * override — the dispatch itself is what T4 introduced), so the committed
 * per-platform snapshots (tests/fixtures/font-chains/<darwin|win32|linux>.json)
 * are fully deterministic from any host; each CI platform additionally verifies
 * its own file against its own profile.
 *
 * Structural invariants per profile (on top of the snapshots):
 *  - win32:  Windows-native corpus fonts keep the literal chain head (the
 *            literal-hit contract — a declared native face is never substituted away)
 *  - linux:  every CJK chain reaches a bundled face (GenOffice aliases / Noto
 *            CJK subsets — the bundled-fallback contract on a host with no
 *            system CJK fonts)
 *  - darwin: frozen by snapshot equality alone (substitution platform, probed
 *            against Word for Mac)
 *
 * Regenerate (from apps/docs; writes all three platform files):
 *   UPDATE_FONT_SNAPSHOTS=1 pnpm vitest run tests/font-chain-matrix.test.ts
 *
 * Determinism: under vitest/jsdom the canvas probe reports every system family
 * as missing, so the snapshots exercise exactly the substitution paths and do
 * not depend on the machine running the test.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  cjkDeclaredLineFactor,
  cssDualFontFamily,
  cssEaOnlyFontFamily,
  cssFontFamily,
  lineHeightFactor,
  setDocFontTable,
} from '../src/renderer/line-metrics'
import {
  WINDOWS_NATIVE_FONTS,
  fontPlatform,
  setFontPlatform,
  type FontPlatform,
} from '../src/renderer/font-platform'

const HERE = dirname(fileURLToPath(import.meta.url))
const SNAPSHOT_DIR = join(HERE, 'fixtures', 'font-chains')
const PLATFORMS: readonly FontPlatform[] = ['darwin', 'win32', 'linux']
const HOST_PLATFORM = PLATFORMS.find((p) => p === fontPlatform()) ?? 'linux'

/** Corpus grouped by role in the three-platform matrix; `cjk` drives the linux bundled-tail invariant. */
const CORPUS_GROUPS: ReadonlyArray<{ role: string; cjk: boolean; fonts: string[] }> = [
  {
    role: 'Simplified Chinese classics (Windows ships them; macOS/Linux substitute)',
    cjk: true,
    fonts: [
      'SimSun',
      '宋体',
      'NSimSun',
      '新宋体',
      'SimHei',
      '黑体',
      'KaiTi',
      '楷体',
      'FangSong',
      '仿宋',
      '楷体_GB2312',
      'FangSong_GB2312',
      'STZhongsong',
      '华文中宋',
    ],
  },
  {
    role: 'Modern Microsoft CJK faces',
    cjk: true,
    fonts: ['Microsoft YaHei', '微软雅黑', 'DengXian', '等线', '等线 Light'],
  },
  {
    role: 'Traditional Chinese',
    cjk: true,
    fonts: [
      'PMingLiU',
      '細明體',
      'MingLiU',
      'Microsoft JhengHei',
      '微軟正黑體',
      'DFKai-SB',
      '標楷體',
    ],
  },
  {
    role: 'Japanese',
    cjk: true,
    fonts: [
      'Yu Gothic',
      '游ゴシック',
      'Yu Mincho',
      '游明朝',
      'Meiryo',
      'メイリオ',
      'MS Mincho',
      'ＭＳ 明朝',
      'MS Gothic',
    ],
  },
  {
    role: 'Korean',
    cjk: true,
    fonts: [
      'Malgun Gothic',
      '맑은 고딕',
      'Batang',
      '바탕',
      'Gulim',
      '굴림',
      'Gungsuh',
      '궁서',
      'NanumGothic',
    ],
  },
  {
    role: 'Open-source CJK families (Linux users may install these)',
    cjk: true,
    fonts: [
      'Noto Sans CJK SC',
      'Noto Serif CJK SC',
      'Noto Sans SC',
      'Noto Sans TC',
      'Noto Serif JP',
      'Noto Sans KR',
      'Source Han Sans SC',
      'Source Han Serif SC',
    ],
  },
  {
    role: 'Chinese vendor faces outside the known sets (name-guess fallback path)',
    cjk: true,
    fonts: ['方正小标宋简体', '华文楷体', '思源黑体'],
  },
  {
    role: 'Western anchors (metric-compatible substitution chains)',
    cjk: false,
    fonts: [
      'Calibri',
      'Aptos',
      'Times New Roman',
      'Arial',
      'Cambria',
      'Cambria Math',
      'Consolas',
      'Palatino Linotype',
    ],
  },
  {
    role: 'Thai (Windows Cordia/Angsana/Leelawadee classics; mac Thonburi-class; linux bundles)',
    cjk: false,
    fonts: [
      'Cordia New',
      'Angsana New',
      'Browallia New',
      'Leelawadee',
      'Leelawadee UI',
      'TH Sarabun New',
      'Thonburi',
      'Tahoma',
    ],
  },
  {
    role: 'Devanagari (Windows Mangal/Nirmala; mac Sangam/Kohinoor; linux bundles)',
    cjk: false,
    fonts: [
      'Mangal',
      'Nirmala UI',
      'Aparajita',
      'Utsaah',
      'Kokila',
      'Sanskrit Text',
      'Devanagari MT',
      'Devanagari Sangam MN',
    ],
  },
  {
    role: 'Hebrew (Windows David/FrankRuehl classics; Word substitutes Times New Roman)',
    cjk: false,
    fonts: ['David', 'FrankRuehl', 'Narkisim', 'Miriam', 'Aharoni', 'Levenim MT', 'Guttman'],
  },
  {
    role: 'Unknown Latin-named vendor face (generic backstop path)',
    cjk: false,
    fonts: ['Hexa Gonic Pro'],
  },
]

const CORPUS = CORPUS_GROUPS.flatMap((g) => g.fonts)
const CJK_CORPUS = CORPUS_GROUPS.filter((g) => g.cjk).flatMap((g) => g.fonts)

/** w:ascii ≠ w:eastAsia dual-slot samples (Latin head + full EA chain). */
const DUAL_SAMPLES: ReadonlyArray<readonly [string, string]> = [
  ['Times New Roman', '宋体'],
  ['Arial', 'Malgun Gothic'],
  ['Calibri', 'Yu Mincho'],
]

/** w:eastAsia-only runs resolve Latin through the inherited ascii chain. */
const EA_ONLY_SAMPLES: string[] = ['宋体', 'Malgun Gothic', 'Yu Gothic']

interface ChainEntry {
  chain: string
  lineHeightFactor: number
  cjkFactor: number | null
}

interface ChainSnapshot {
  single: Record<string, ChainEntry>
  dual: Record<string, string>
  eaOnly: Record<string, string>
}

function buildSnapshot(platform: FontPlatform): ChainSnapshot {
  setFontPlatform(platform)
  try {
    setDocFontTable(null) // isolation: no document fontTable substitution hints
    const single: Record<string, ChainEntry> = {}
    for (const font of CORPUS) {
      single[font] = {
        chain: cssFontFamily(font),
        lineHeightFactor: lineHeightFactor(font),
        cjkFactor: cjkDeclaredLineFactor(font),
      }
    }
    const dual: Record<string, string> = {}
    for (const [ascii, ea] of DUAL_SAMPLES) dual[`${ascii} + ${ea}`] = cssDualFontFamily(ascii, ea)
    const eaOnly: Record<string, string> = {}
    for (const ea of EA_ONLY_SAMPLES) eaOnly[ea] = cssEaOnlyFontFamily(ea)
    return { single, dual, eaOnly }
  } finally {
    setFontPlatform(null)
  }
}

const SNAPSHOTS: Record<FontPlatform, ChainSnapshot> = {
  darwin: buildSnapshot('darwin'),
  win32: buildSnapshot('win32'),
  linux: buildSnapshot('linux'),
}

/** Faces a bare-Linux host is guaranteed to reach via the bundled web fonts. */
const BUNDLED_TAIL_RE = /GenOffice [A-Z]|Noto (Sans|Serif) CJK/

const UPDATE = process.env.UPDATE_FONT_SNAPSHOTS === '1'

function snapshotPath(platform: FontPlatform): string {
  return join(SNAPSHOT_DIR, `${platform}.json`)
}

describe('font chain cross-platform matrix', () => {
  it('has a committed snapshot for every platform in the matrix', () => {
    for (const platform of PLATFORMS) {
      expect(existsSync(snapshotPath(platform)), platform).toBe(true)
    }
  })

  it(`matches the committed ${HOST_PLATFORM} snapshot`, () => {
    const path = snapshotPath(HOST_PLATFORM)
    if (UPDATE) {
      mkdirSync(SNAPSHOT_DIR, { recursive: true })
      for (const platform of PLATFORMS) {
        writeFileSync(snapshotPath(platform), `${JSON.stringify(SNAPSHOTS[platform], null, 2)}\n`)
      }
      return
    }
    expect(existsSync(path), `missing snapshot: ${path}`).toBe(true)
    const committed = JSON.parse(readFileSync(path, 'utf8')) as ChainSnapshot
    expect(SNAPSHOTS[HOST_PLATFORM]).toEqual(committed)
  })

  it('keeps the literal chain head for Windows-native faces under the win32 profile', () => {
    for (const font of CORPUS) {
      if (!WINDOWS_NATIVE_FONTS.has(font)) continue
      expect(
        SNAPSHOTS.win32.single[font]!.chain.startsWith(`'${font}'`),
        `${font}: ${SNAPSHOTS.win32.single[font]!.chain}`,
      ).toBe(true)
    }
  })

  it('reaches a bundled face for every CJK font under the linux profile', () => {
    for (const font of CJK_CORPUS) {
      expect(
        BUNDLED_TAIL_RE.test(SNAPSHOTS.linux.single[font]!.chain),
        `${font}: ${SNAPSHOTS.linux.single[font]!.chain}`,
      ).toBe(true)
    }
  })

  it('resolves an installed Noto CJK name to itself (not the substitution class)', () => {
    // Regression for the T4 fix: bundled faces used to lose their literal head
    // on every platform and Noto Sans CJK SC degraded to the serif class.
    for (const platform of ['win32', 'linux'] as const) {
      expect(SNAPSHOTS[platform].single['Noto Sans CJK SC']!.chain.startsWith("'Noto Sans CJK SC'")).toBe(true)
      expect(SNAPSHOTS[platform].single['Noto Sans CJK SC']!.chain.endsWith('sans-serif')).toBe(true)
    }
  })
})
