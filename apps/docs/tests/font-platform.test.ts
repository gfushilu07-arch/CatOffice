/**
 * Platform dispatch semantics of the font seam (T4). The matrix test locks the
 * full chains per profile; here the override/inference mechanics and the
 * dispatch decision points get focused coverage, including the regression the
 * dispatch fixed (a bundled Noto name degraded to the substitution class on
 * every platform).
 */

import { describe, expect, it } from 'vitest'
import { cssFontFamily } from '../src/renderer/line-metrics'
import { fontPlatform, setFontPlatform } from '../src/renderer/font-platform'

describe('font platform dispatch', () => {
  it('defaults to the host platform inference', () => {
    const expected =
      process.platform === 'win32' ? 'win32' : process.platform === 'darwin' ? 'darwin' : 'linux'
    expect(fontPlatform()).toBe(expected)
  })

  it('the override wins and null restores inference', () => {
    setFontPlatform('win32')
    expect(fontPlatform()).toBe('win32')
    setFontPlatform(null)
    expect(fontPlatform()).toBe(expectedHost())
  })

  it('keeps the literal head for a bundled Noto name on windows and linux', () => {
    // Pre-T4 the bundled check stripped the literal head on every platform,
    // degrading an installed Noto Sans CJK SC to the serif substitution class.
    setFontPlatform('win32')
    const win = cssFontFamily('Noto Sans CJK SC')
    expect(win.startsWith("'Noto Sans CJK SC'")).toBe(true)
    expect(win.endsWith('sans-serif')).toBe(true)
    setFontPlatform('linux')
    const linux = cssFontFamily('Noto Sans CJK SC')
    expect(linux.startsWith("'Noto Sans CJK SC'")).toBe(true)
    expect(linux.endsWith('sans-serif')).toBe(true)
  })

  it('macOS keeps the wholesale substitution for a bundled Noto name', () => {
    // Word for Mac substitutes the missing face wholesale; the bundled subset
    // must not shadow it (frozen darwin snapshot covers the chain, this pins
    // the branch decision itself).
    setFontPlatform('darwin')
    const chain = cssFontFamily('Noto Sans CJK SC')
    expect(chain.startsWith("'Noto Sans CJK SC'")).toBe(false)
    expect(chain.startsWith("'GenOffice Songti SC'")).toBe(true)
  })

  it('restores darwin behavior after every test (no cross-test leakage)', () => {
    setFontPlatform(null)
    expect(cssFontFamily('Noto Sans CJK SC').startsWith("'Noto Sans CJK SC'")).toBe(
      fontPlatform() !== 'darwin',
    )
  })
})

function expectedHost(): 'win32' | 'darwin' | 'linux' {
  if (process.platform === 'win32') return 'win32'
  if (process.platform === 'darwin') return 'darwin'
  return 'linux'
}
