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
  resumeBlocks,
  weeklyReportBlocks,
  bidProposalBlocks,
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

describe('resume', () => {
  it('renders contact, summary, experience, education, and skills', () => {
    const text = textsOf(
      resumeBlocks({
        experience: [['2024.01—2026.01', '前端工程师', '××科技']],
      }),
    )
    expect(text).toContain('个人简历')
    expect(text).toContain('电话：×××')
    expect(text).toContain('个人简介')
    expect(text).toContain('工作经历')
    expect(text).toContain('××科技　前端工程师')
    expect(text).toContain('教育背景')
    expect(text).toContain('技能特长')
  })
})

describe('bidProposalBlocks (N2 category expansion)', () => {
  it('renders the bid structure with default placeholders', () => {
    const blocks = bidProposalBlocks()
    const text = blocks
      .map((b) => (b.type === 'paragraph' ? (b.runs ?? []).map((r) => r.text).join('') : ''))
      .join('\n')
    expect(text).toContain('投标书')
    expect(text).toContain('投标函')
    expect(text).toContain('技术方案')
    expect(text).toContain('资质证明文件清单')
    expect(text).toContain('投标人（盖章）：××××××公司')
    // right-aligned signature block survives as real runs
    const signer = blocks.find(
      (b) => b.type === 'paragraph' && (b.runs ?? []).some((r) => r.text.includes('法定代表人或授权代表')),
    )
    expect(signer).toBeDefined()
  })

  it('every field is overridable by the caller', () => {
    const blocks = bidProposalBlocks({
      projectName: '市政道路改造工程',
      amount: '人民币 800 万元',
      approach: ['分三段施工。'],
    })
    const text = blocks
      .map((b) => (b.type === 'paragraph' ? (b.runs ?? []).map((r) => r.text).join('') : ''))
      .join('\n')
    expect(text).toContain('市政道路改造工程')
    expect(text).toContain('人民币 800 万元')
    expect(text).toContain('分三段施工。')
    // untouched defaults stay ××-placeholdered
    expect(text).toContain('招标编号：××')
  })
})