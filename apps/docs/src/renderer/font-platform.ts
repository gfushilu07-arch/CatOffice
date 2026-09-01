/**
 * Rendering-host platform profile for font resolution (T4,
 * docs/catoffice/cross-platform-plan.md).
 *
 * The substitution chains in line-metrics.ts were derived against Word for Mac
 * and implicitly assumed the macOS font inventory. The platform profile lets
 * the same chain builder special-case the other hosts:
 *  - darwin: substitution platform (current behavior, frozen by snapshots)
 *  - win32:  literal-hit platform — the classic GB/JP/KR Office faces ship with
 *            Windows itself, so declared names resolve natively
 *  - linux:  bundled-fallback platform — no system CJK fonts can be assumed;
 *            every chain must reach the bundled Noto/GenOffice subsets
 *
 * Line-height factors are font-metric values and stay shared across platforms
 * until the per-platform baselines land (T2 Windows Word probes / T3 bundled
 * opentype metrics).
 *
 * Default comes from process.platform; tests force a profile with
 * setFontPlatform(). Electron renderers expose process.platform, so runtime
 * callers need no wiring.
 */

export type FontPlatform = 'darwin' | 'win32' | 'linux'

let override: FontPlatform | null = null

/** Force a profile (tests / simulated environments); null restores inference. */
export function setFontPlatform(platform: FontPlatform | null): void {
  override = platform
}

/** The platform font resolution is currently targeting. */
export function fontPlatform(): FontPlatform {
  if (override) return override
  if (process.platform === 'win32') return 'win32'
  if (process.platform === 'darwin') return 'darwin'
  return 'linux'
}

/**
 * Faces that resolve natively on a Windows machine (base system, Chinese/JP/KR
 * language packs, or Office). Declaring one of these in a chain head is the
 * literal-hit contract of the win32 profile; Linux never assumes them.
 * Legacy GB2312 variants (KaiTi_GB2312 / FangSong_GB2312), Nanum*, and
 * Noto/Source Han are deliberately absent — they are missing even on
 * stock Windows+Office.
 */
export const WINDOWS_NATIVE_FONTS: ReadonlySet<string> = new Set([
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
  'Microsoft YaHei',
  '微软雅黑',
  'DengXian',
  '等线',
  '等线 Light',
  'STZhongsong',
  '华文中宋',
  'PMingLiU',
  '細明體',
  'MingLiU',
  'Microsoft JhengHei',
  '微軟正黑體',
  'DFKai-SB',
  '標楷體',
  'Yu Gothic',
  '游ゴシック',
  'Yu Mincho',
  '游明朝',
  'Meiryo',
  'メイリオ',
  'MS Mincho',
  'ＭＳ 明朝',
  'MS Gothic',
  'Malgun Gothic',
  '맑은 고딕',
  'Batang',
  '바탕',
  'Gulim',
  '굴림',
  'Gungsuh',
  '궁서',
  // Office-bundled Western anchors
  'Calibri',
  'Cambria',
  'Cambria Math',
  'Consolas',
  'Palatino Linotype',
  'Times New Roman',
  'Arial',
])
