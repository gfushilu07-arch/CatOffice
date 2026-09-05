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
  {
    id: 'sheet-invoice',
    label: '发票登记',
    description: '开票记录：发票号 / 日期 / 购方 / 金额 / 税额',
    fileName: '发票登记',
    sheetName: '发票登记',
    rows: [
      ['发票号码', '开票日期', '购买方', '金额（元）', '税额（元）', '价税合计（元）'],
      ['××××××××', '××××-××-××', '××××××', '0', '0', '=D2+E2'],
      ['××××××××', '××××-××-××', '××××××', '0', '0', '=D3+E3'],
      ['合计', '', '', '=SUM(D2:D3)', '=SUM(E2:E3)', '=SUM(F2:F3)'],
    ],
  },
  {
    id: 'sheet-project',
    label: '项目进度',
    description: '任务跟踪：任务 / 负责人 / 起止日期 / 进度 / 状态',
    fileName: '项目进度',
    sheetName: '项目进度',
    rows: [
      ['任务', '负责人', '开始日期', '结束日期', '进度（%）', '状态'],
      ['××××××', '××', '××××-××-××', '××××-××-××', '0%', '未开始'],
      ['××××××', '××', '××××-××-××', '××××-××-××', '50%', '进行中'],
      ['××××××', '××', '××××-××-××', '××××-××-××', '100%', '已完成'],
    ],
  },
  {
    id: 'sheet-inventory',
    label: '库存表',
    description: '出入库台账：编号 / 品名 / 单位 / 库存 / 单价 / 金额',
    fileName: '库存表',
    sheetName: '库存',
    rows: [
      ['编号', '品名', '单位', '库存数量', '单价（元）', '金额（元）'],
      ['××××', '××××', '件', '0', '0', '=D2*E2'],
      ['××××', '××××', '箱', '0', '0', '=D3*E3'],
      ['合计', '', '', '=SUM(D2:D3)', '', '=SUM(F2:F3)'],
    ],
  },
  {
    id: 'sheet-attendance',
    label: '考勤表',
    description: '月度出勤：姓名 / 日期段 / 出勤 / 请假 / 加班',
    fileName: '考勤表',
    sheetName: '月度考勤',
    rows: [
      ['姓名', '应出勤（天）', '实际出勤（天）', '请假（天）', '加班（小时）', '备注'],
      ['××', '21.75', '21.75', '0', '0', ''],
      ['××', '21.75', '21', '0.75', '2', '事假××'],
      ['××', '21.75', '22', '0', '3', ''],
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
