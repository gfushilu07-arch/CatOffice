/**
 * Sheet template presets (asset center S1): every preset must produce a
 * valid workbook through rowsToXlsxBuffer — parseable by the sheets gateway
 * itself (csvToXlsxBuffer's parser) with the expected header row intact.
 */
import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { SHEET_TEMPLATES, SHEET_TEMPLATE_MENU, sheetTemplateById } from '../src/gateway/sheet-templates'
import { rowsToXlsxBuffer } from '../src/gateway/csv-import'

describe('sheet template presets', () => {
  it('ships budget / roster / ledger with unique ids', () => {
    expect(SHEET_TEMPLATES.map((t) => t.id)).toEqual([
      'sheet-budget',
      'sheet-roster',
      'sheet-ledger',
    ])
    expect(SHEET_TEMPLATE_MENU).toHaveLength(SHEET_TEMPLATES.length)
    expect(sheetTemplateById('sheet-budget')?.label).toBe('预算表')
  })

  it.each(SHEET_TEMPLATES.map((t) => [t.id, t] as const))(
    '%s renders a workbook with its headers and named sheet',
    async (_id, template) => {
      const bytes = await rowsToXlsxBuffer(template.rows, template.sheetName)
      const zip = await JSZip.loadAsync(bytes)
      const sheetXml = await zip.file('xl/worksheets/sheet1.xml')!.async('string')
      expect(sheetXml).toContain(template.rows[0]![0]!)
      // header row cells are present as inline strings
      for (const header of template.rows[0]!) {
        expect(sheetXml).toContain(header)
      }
      // the workbook names the sheet
      const workbookXml = await zip.file('xl/workbook.xml')!.async('string')
      expect(workbookXml).toContain(template.sheetName)
    },
  )
})

describe('formula cells (budget template)', () => {
  it('writes =-prefixed values as real <f> formula cells, never formula text', async () => {
    const budget = sheetTemplateById('sheet-budget')!
    const bytes = await rowsToXlsxBuffer(budget.rows, budget.sheetName)
    const zip = await JSZip.loadAsync(bytes)
    const xml = await zip.file('xl/worksheets/sheet1.xml')!.async('string')
    expect(xml).toContain('<c r="D2"><f>B2-C2</f></c>')
    expect(xml).toContain('<c r="B5"><f>SUM(B2:B4)</f></c>')
    // a formula must never leak into an inlineStr text cell
    expect(xml).not.toMatch(/t="inlineStr"><is><t[^>]*>=/)
  })
})
