/**
 * Sheet template presets (asset center S1): the everyday tables — budget,
 * duty roster, ledger — as row arrays rendered through the sheets gateway's
 * rowsToXlsxBuffer. Headers + a handful of xx fill-in rows; formulas are
 * deliberately absent in v1 (the gateway writes inline values only — the
 * user adds SUMs live, and formula emission belongs to the engine's write
 * path, not a template string).
 */

export interface SheetTemplateEntry {
  id: string
  label: string
  description: string
  fileName: string
  sheetName: string
  rows: readonly (readonly string[])[]
}

export const SHEET_TEMPLATES: SheetTemplateEntry[] = [
  {
    id: 'sheet-budget',
    label: '预算表',
    description: '月度收支：科目 / 计划 / 实际 / 差额',
    fileName: '预算表',
    sheetName: '月度预算',
    rows: [
      ['科目', '计划（元）', '实际（元）', '差额（元）', '备注'],
      ['××××', '0', '0', '=B2-C2', '××'],
      ['××××', '0', '0', '=B3-C3', '××'],
      ['××××', '0', '0', '=B4-C4', '××'],
      ['合计', '=SUM(B2:B4)', '=SUM(C2:C4)', '=B5-C5', ''],
    ],
  },
  {
    id: 'sheet-roster',
    label: '值班表',
    description: '周排班：日期 / 时段 / 值班人 / 交接备注',
    fileName: '值班表',
    sheetName: '值班安排',
    rows: [
      ['日期', '星期', '时段', '值班人', '交接备注'],
      ['××月××日', '星期一', '9:00–18:00', '××', ''],
      ['××月××日', '星期二', '9:00–18:00', '××', ''],
      ['××月××日', '星期三', '9:00–18:00', '××', ''],
      ['××月××日', '星期四', '9:00–18:00', '××', ''],
      ['××月××日', '星期五', '9:00–18:00', '××', ''],
    ],
  },
  {
    id: 'sheet-ledger',
    label: '台账',
    description: '通用流水：编号 / 日期 / 事项 / 经办 / 金额 / 状态',
    fileName: '台账',
    sheetName: '台账',
    rows: [
      ['编号', '日期', '事项', '经办人', '金额（元）', '状态'],
      ['001', '××××-××-××', '××××××', '××', '0', '进行中'],
      ['002', '××××-××-××', '××××××', '××', '0', '已完成'],
      ['003', '××××-××-××', '××××××', '××', '0', '进行中'],
    ],
  },
]

export function sheetTemplateById(id: string): SheetTemplateEntry | undefined {
  return SHEET_TEMPLATES.find((entry) => entry.id === id)
}

/** Labels for the shell's native picker menu (shell bundles independently of
 *  the sheets renderer, so the menu data lives with the presets). */
export const SHEET_TEMPLATE_MENU = SHEET_TEMPLATES.map((entry) => ({
  id: entry.id,
  label: entry.label,
  description: entry.description,
}))
