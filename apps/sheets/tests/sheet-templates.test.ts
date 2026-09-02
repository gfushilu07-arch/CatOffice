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
