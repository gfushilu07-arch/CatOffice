/**
 * Local built-in template catalog (asset center A1/P1): GB/T 9704 government
 * kinds plus the everyday office set (P1), rendered through their generators
 * so every semantic ships intact. Zero-network by design — the local layer
 * of the asset-center plan.
 */

import { govtDocBlocks, type GovtTemplateOptions } from './govt-template'
import {
  contractBlocks,
  meetingMinutesBlocks,
  weeklyReportBlocks,
} from './office-template'
import type { Block, SectionSettings } from '@genoffice/docx-engine'
import { govtDocSection } from './govt-template'
import { officeDocSection } from './office-template'

/** how a catalog entry renders: generator + section + file name */
export interface TemplateRender {
  blocks: Block[]
  section: SectionSettings
}

export interface TemplateEntry {
  /** stable id for the new-document entry points */
  id: string
  /** display name (zh — the audience is zh documents) */
  label: string
  /** one-line description of when to use this kind */
  description: string
  /** the docx filename base for a new document from this template */
  fileName: string
  /** gallery grouping (mirrors the cloud contract's category) */
  category: 'govt' | 'business'
  /** the ×× placeholders a fresh document starts with */
  defaultOptions: Record<string, string>
  /** apply the preset to a full render */
  render: (options: Record<string, string>) => TemplateRender
}

export type GovtTemplateId = 'notice' | 'request' | 'report' | 'letter' | 'minutes'

/** one GB/T 9704 preset (kept for the existing consumers/tests) */
export interface GovtTemplateEntry {
  id: GovtTemplateId
  label: string
  description: string
  fileName: string
  options: GovtTemplateOptions
}

export const GOVT_TEMPLATES: GovtTemplateEntry[] = [
  {
    id: 'notice',
    label: '通知',
    description: '传达事项、布置工作（印发/转发/事项通知）',
    fileName: '通知',
    options: { title: '关于××的通知' },
  },
  {
    id: 'request',
    label: '请示',
    description: '向上级机关请求指示、批准',
    fileName: '请示',
    options: { title: '关于××的请示' },
  },
  {
    id: 'report',
    label: '报告',
    description: '向上级机关汇报工作、反映情况',
    fileName: '报告',
    options: { title: '关于××的报告' },
  },
  {
    id: 'letter',
    label: '函',
    description: '不相隶属机关之间商洽工作、询问和答复',
    fileName: '函',
    options: { title: '关于××的函' },
  },
  {
    id: 'minutes',
    label: '纪要',
    description: '记载会议主要情况和议定事项',
    fileName: '纪要',
    options: { title: '××会议纪要' },
  },
]

export function govtTemplateById(id: string): GovtTemplateEntry | undefined {
  return GOVT_TEMPLATES.find((entry) => entry.id === id)
}

/** office (P1) entries: rendered with their dedicated generators */
export const OFFICE_TEMPLATES: Array<Omit<TemplateEntry, 'render'>> = [
  {
    id: 'office-contract',
    label: '合同',
    description: '双方权利义务条款、签署页',
    fileName: '合同',
    category: 'business',
    defaultOptions: { title: '××××合同' },
  },
  {
    id: 'office-weekly',
    label: '周报',
    description: '本周完成 / 下周计划 / 问题风险',
    fileName: '周报',
    category: 'business',
    defaultOptions: { title: '××××××周报' },
  },
  {
    id: 'office-minutes',
    label: '会议纪要',
    description: '议定事项 + 行动项跟踪',
    fileName: '会议纪要',
    category: 'business',
    defaultOptions: { title: '××××××会议纪要' },
  },
]

/** the union the gallery shows: govt first, office after */
export const ALL_TEMPLATES: TemplateEntry[] = [
  ...GOVT_TEMPLATES.map((entry) => ({
    id: entry.id,
    label: entry.label,
    description: entry.description,
    fileName: entry.fileName,
    category: 'govt' as const,
    defaultOptions: entry.options as Record<string, string>,
    render: (options: Record<string, string>) => ({
      blocks: govtDocBlocks(options as GovtTemplateOptions),
      section: govtDocSection(),
    }),
  })),
  ...OFFICE_TEMPLATES.map((entry) => ({
    id: entry.id,
    label: entry.label,
    description: entry.description,
    fileName: entry.fileName,
    category: entry.category,
    defaultOptions: entry.defaultOptions,
    render: (options: Record<string, string>) => {
      if (entry.id === 'office-contract') {
        return { blocks: contractBlocks(options), section: officeDocSection() }
      }
      if (entry.id === 'office-weekly') {
        return { blocks: weeklyReportBlocks(options), section: officeDocSection() }
      }
      return { blocks: meetingMinutesBlocks(options), section: officeDocSection() }
    },
  })),
]

export function templateById(id: string): TemplateEntry | undefined {
  return ALL_TEMPLATES.find((entry) => entry.id === id)
}
