/**
 * Business document templates (asset center P1): the everyday office set —
 * contract, weekly report, meeting minutes — as Block[] generators in the
 * same style as govt-template.ts. These are NOT GB/T 9704 documents: no red
 * banner, no char-unit rules; standard body typography (the blank doc's
 * default East Asian face per UI language), heading/label structure, and
 * fill-in ×× placeholders like the govt line.
 */

import type { Block, Run } from '@genoffice/docx-engine'
import { govtDocSection } from './govt-template'

let seq = 0
function block(partial: Omit<Block, 'id' | 'docxIndex' | 'originalXml'>): Block {
  seq += 1
  return { id: `office-${seq}`, docxIndex: null, originalXml: null, ...partial }
}

const run = (text: string, extra: Partial<Run> = {}): Run => ({ text, ...extra })

/** body text: 12pt (the Chinese "size-4" office standard), default face */
const BODY_HALF_POINTS = 24
/** headings: 16pt (the Chinese "size-3" office standard) */
const HEAD_HALF_POINTS = 32
/** 2-char first-line indent at 12pt = 480 twips */
const TWO_CHAR_TWIPS = 480

const bodyRun = (text: string): Run => run(text, { sizeHalfPoints: BODY_HALF_POINTS })

const headBlock = (text: string): Block =>
  block({
    type: 'paragraph',
    runs: [run(text, { sizeHalfPoints: HEAD_HALF_POINTS, bold: true })],
    format: { align: 'center', spaceAfter: 360 },
  })

const labelBlock = (text: string): Block =>
  block({
    type: 'paragraph',
    runs: [run(text, { sizeHalfPoints: BODY_HALF_POINTS, bold: true })],
    format: { spaceBefore: 240, spaceAfter: 120 },
  })

const bodyBlock = (text: string): Block =>
  block({
    type: 'paragraph',
    runs: [bodyRun(text)],
    format: { indentFirstLineChars: 200, indentFirstLine: TWO_CHAR_TWIPS },
  })

const fieldBlock = (label: string, value = '××'): Block =>
  block({ type: 'paragraph', runs: [bodyRun(`${label}${value}`)] })

export interface WeeklyReportOptions {
  /** report title */
  title?: string
  name?: string
  period?: string
  /** [done, …] bullet items */
  done?: string[]
  /** next week's plan items */
  plan?: string[]
  /** issues/risks lines (empty = section omitted) */
  issues?: string[]
}

export function weeklyReportBlocks(options: WeeklyReportOptions = {}): Block[] {
  seq = 0
  const {
    title = '××××××周报',
    name = '××',
    period = '××××年××月××日 — ××月××日',
    done = ['1. ××××××××；', '2. ××××××××。'],
    plan = ['1. ××××××××；'],
    issues = ['××××××××，需××支持。'],
  } = options
  const blocks: Block[] = [
    headBlock(title),
    fieldBlock('汇报人：', name),
    fieldBlock('周期：', period),
    labelBlock('一、本周完成'),
    ...done.map(bodyBlock),
    labelBlock('二、下周计划'),
    ...plan.map(bodyBlock),
  ]
  if (issues.length > 0) {
    blocks.push(labelBlock('三、问题与风险'))
    blocks.push(...issues.map(bodyBlock))
  }
  return blocks
}

export interface MeetingMinutesOptions {
  title?: string
  time?: string
  place?: string
  host?: string
  attendees?: string
  /** agenda/resolution items */
  resolutions?: string[]
  /** [name, task] action rows */
  actions?: Array<[string, string]>
}

export function meetingMinutesBlocks(options: MeetingMinutesOptions = {}): Block[] {
  seq = 0
  const {
    title = '××××××会议纪要',
    time = '××××年××月××日××:××',
    place = '××会议室',
    host = '××',
    attendees = '××、××、××',
    resolutions = ['1. ××××××××；', '2. ××××××××。'],
    actions = [
      ['××', '××××××××，××月××日前完成。'],
    ],
  } = options
  const blocks: Block[] = [
    headBlock(title),
    fieldBlock('时间：', time),
    fieldBlock('地点：', place),
    fieldBlock('主持人：', host),
    fieldBlock('参会人员：', attendees),
    labelBlock('一、议定事项'),
    ...resolutions.map(bodyBlock),
    labelBlock('二、行动项'),
  ]
  for (const [owner, task] of actions) {
    blocks.push(bodyBlock(`· ${owner}：${task}`))
  }
  blocks.push(block({ type: 'paragraph', runs: [] }))
  blocks.push(
    block({
      type: 'paragraph',
      runs: [bodyRun('记录人：××')],
      format: { align: 'right', indentRight: 480 },
    }),
  )
  return blocks
}

export interface ContractOptions {
  title?: string
  partyA?: string
  partyB?: string
  /** clause paragraphs (numbered) */
  clauses?: string[]
  /** signature block lines */
  extraSigners?: Array<[string, string]>
}

export function contractBlocks(options: ContractOptions = {}): Block[] {
  seq = 0
  const {
    title = '××××合同',
    partyA = '甲方：××××××××',
    partyB = '乙方：××××××××',
    clauses = [
      '一、××××××××××××××××××××。',
      '二、××××××××××××××××××××。',
      '三、××××××××××××××××××××。',
    ],
    extraSigners = [],
  } = options
  const blocks: Block[] = [
    headBlock(title),
    bodyBlock(partyA),
    bodyBlock(partyB),
    labelBlock('经双方协商一致，订立如下条款：'),
    ...clauses.map(bodyBlock),
    block({ type: 'paragraph', runs: [] }),
    fieldBlock('甲方（盖章）：'),
    fieldBlock('乙方（盖章）：'),
    fieldBlock('签订日期：', '××××年××月××日'),
  ]
  void extraSigners
  return blocks
}

export interface ResumeOptions {
  title?: string
  name?: string
  /** one-line contact info: phone / email / city */
  contact?: string
  /** [period, role, org] experience rows */
  experience?: Array<[string, string, string]>
  education?: string[]
  skills?: string[]
  summary?: string
}

export function resumeBlocks(options: ResumeOptions = {}): Block[] {
  seq = 0
  const {
    title = '个人简历',
    name = '××',
    contact = '电话：×××　·　邮箱：××@××.com　·　城市：××',
    experience = [
      ['××××.××—××××.××', '××岗位', '××公司'],
      ['××××.××—××××.××', '××岗位', '××公司'],
    ],
    education = ['××××.××—××××.××　××大学　××专业　本科'],
    skills = ['××××××；', '××××××。'],
    summary = '××××××××××××××××××××。',
  } = options
  const blocks: Block[] = [
    headBlock(title),
    block({
      type: 'paragraph',
      runs: [bodyRun(`${name}　·　`)],
      format: { align: 'center' },
    }),
    block({ type: 'paragraph', runs: [bodyRun(contact)], format: { align: 'center' } }),
    labelBlock('个人简介'),
    bodyBlock(summary),
    labelBlock('工作经历'),
  ]
  for (const [period, role, org] of experience) {
    blocks.push(bodyBlock(`${period}　${org}　${role}`))
  }
  blocks.push(labelBlock('教育背景'))
  blocks.push(...education.map(bodyBlock))
  blocks.push(labelBlock('技能特长'))
  blocks.push(...skills.map(bodyBlock))
  return blocks
}

export interface BidProposalOptions {
  title?: string
  /** bidding project name */
  projectName?: string
  /** the inviting party (tendering side, Chinese zhaobiaoren) */
  tenderer?: string
  /** the bidding company (Chinese toubiaoren) */
  bidder?: string
  /** total bid price */
  amount?: string
  /** delivery/construction duration */
  duration?: string
  /** technical-approach section lines */
  approach?: string[]
  /** qualification/certificate lines */
  qualifications?: string[]
}

/** Bid proposal: bid letter + project overview + technical approach + qualification list + signature page. */
export function bidProposalBlocks(options: BidProposalOptions = {}): Block[] {
  seq = 0
  const {
    title = '××××项目投标书',
    projectName = '××××××项目',
    tenderer = '××××××（招标人）',
    bidder = '××××××公司',
    amount = '人民币 ×××× 万元',
    duration = '××个日历日',
    approach = [
      '××××××××××××××××××。',
      '××××××××××××××××××××××××××。',
    ],
    qualifications = [
      '营业执照副本复印件（加盖公章）；',
      '法定代表人身份证明及授权委托书；',
      '××××资质证书复印件（加盖公章）。',
    ],
  } = options
  const blocks: Block[] = [
    headBlock(title),
    block({ type: 'paragraph', runs: [bodyRun(`项目名称：${projectName}`)], format: { align: 'center' } }),
    labelBlock('投标函'),
    bodyBlock(`致：${tenderer}`),
    bodyBlock(
      `根据贵方 ${projectName} 招标文件（招标编号：××××××），我方经认真研究招标文件的全部内容后，愿以 ${amount} 的投标总价，按招标文件的要求承担本项目的全部工作，工期 ${duration}。`,
    ),
    bodyBlock('我方承诺：本投标文件的真实性、合法性和完整性由我方负责；如中标，将严格履行合同约定的全部义务。'),
    labelBlock('项目概况'),
    bodyBlock('项目名称：' + projectName),
    fieldBlock('招标编号：'),
    fieldBlock('建设地点：'),
    fieldBlock('招标范围：'),
    labelBlock('技术方案'),
    ...approach.map(bodyBlock),
    labelBlock('资质证明文件清单'),
    ...qualifications.map(bodyBlock),
    block({ type: 'paragraph', runs: [bodyRun('　')], format: { spaceBefore: 240 } }),
    block({
      type: 'paragraph',
      runs: [bodyRun(`投标人（盖章）：${bidder}`)],
      format: { align: 'right' },
    }),
    block({
      type: 'paragraph',
      runs: [bodyRun('法定代表人或授权代表（签字）：×××')],
      format: { align: 'right' },
    }),
    block({
      type: 'paragraph',
      runs: [bodyRun('日期：××××年××月××日')],
      format: { align: 'right' },
    }),
  ]
  return blocks
}

/** Section settings for office templates: A4 with comfortable margins
 *  (2.54cm top/bottom, 3.17cm left/right — Word's zh defaults). */
export function officeDocSection(): ReturnType<typeof govtDocSection> {
  return {
    ...govtDocSection(),
    marginTop: 1440,
    marginBottom: 1440,
    marginLeft: 1797,
    marginRight: 1797,
  }
}
