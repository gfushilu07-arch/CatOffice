/**
 * Business (P1) office templates: the three everyday generators must produce
 * complete, labeled structures — heading, fields, sections, and (for the
 * minutes/contract) their closing blocks — with ×× placeholders throughout.
 */
import { describe, expect, it } from 'vitest'
import {
  contractBlocks,
  meetingMinutesBlocks,
  officeDocSection,
  weeklyReportBlocks,
} from '../src/renderer/office-template'

const textsOf = (blocks: ReturnType<typeof weeklyReportBlocks>): string =>
  blocks.map((b) => (b.runs ?? []).map((r) => r.text).join('')).join('\n')

describe('weekly report', () => {
  it('renders the three sections with fields', () => {
    const text = textsOf(weeklyReportBlocks())
    expect(text).toContain('××××××周报')
    expect(text).toContain('汇报人：××')
    expect(text).toContain('一、本周完成')
    expect(text).toContain('二、下周计划')
    expect(text).toContain('三、问题与风险')
  })

  it('omits the issues section when empty', () => {
    const text = textsOf(weeklyReportBlocks({ issues: [] }))
    expect(text).not.toContain('三、问题与风险')
  })
})

describe('meeting minutes', () => {
  it('renders fields, resolutions, action rows, and the recorder line', () => {
    const text = textsOf(
      meetingMinutesBlocks({ actions: [['张三', '整理规格，周五前完成。']] }),
    )
    expect(text).toContain('时间：')
    expect(text).toContain('参会人员：')
    expect(text).toContain('一、议定事项')
    expect(text).toContain('· 张三：整理规格，周五前完成。')
    expect(text).toContain('记录人：××')
  })
})

describe('contract', () => {
  it('renders parties, clause block, and the seal/signature fields', () => {
    const text = textsOf(contractBlocks())
    expect(text).toContain('甲方：××××××××')
    expect(text).toContain('乙方：××××××××')
    expect(text).toContain('一、')
    expect(text).toContain('甲方（盖章）：')
    expect(text).toContain('签订日期：')
  })
})

describe('officeDocSection', () => {
  it('is A4 with Word zh default margins (not the GB text area)', () => {
    const s = officeDocSection()
    expect(s.pageWidth).toBe(11906)
    expect(s.marginTop).toBe(1440)
    expect(s.marginLeft).toBe(1797)
    expect(s.marginLeft).not.toBe(1587) // distinct from GB
  })
})
