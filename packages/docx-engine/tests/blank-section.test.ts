/**
 * buildBlankDocx section option (asset center A1): a fresh document can ship
 * with a caller-specified page setup (GB/T 9704 text area) instead of the
 * A4/1-inch default, read back through the normal parse path.
 */
import { describe, expect, it } from 'vitest'
import { buildBlankDocx, parseDocx, readSectionSettings } from '../src/index'

describe('buildBlankDocx section option', () => {
  it('defaults to A4 with 1-inch margins', async () => {
    const bytes = await buildBlankDocx()
    const s = readSectionSettings(await parseDocx(bytes))
    expect(s.pageWidth).toBe(11906)
    expect(s.marginTop).toBe(1440)
  })

  it('applies a caller section (GB margins) to the trailing sectPr', async () => {
    const bytes = await buildBlankDocx({
      section: {
        pageWidth: 11906,
        pageHeight: 16838,
        orientation: 'portrait',
        marginTop: 2098,
        marginRight: 1474,
        marginBottom: 1984,
        marginLeft: 1587,
        pageBorder: false,
        columns: 1,
        headerDist: 1440,
        footerDist: 1440,
      },
    })
    const s = readSectionSettings(await parseDocx(bytes))
    expect(s.marginTop).toBe(2098)
    expect(s.marginBottom).toBe(1984)
    expect(s.marginLeft).toBe(1587)
    expect(s.marginRight).toBe(1474)
    // page size unchanged
    expect(s.pageWidth).toBe(11906)
    expect(s.pageHeight).toBe(16838)
  })
})
