/**
 * Local built-in official-document template catalog (asset center A1):
 * GB/T 9704 scaffolds per document kind, rendered through govtDocBlocks so
 * every semantic (red banner, char-unit indents, red rule) ships intact.
 * Zero-network by design — the local layer of the asset-center plan.
 */

import { govtDocBlocks, type GovtTemplateOptions } from './govt-template'

export interface GovtTemplateEntry {
  /** stable id for the new-document entry points */
  id: GovtTemplateId
  /** display name (zh — the GB/T 9704 audience is zh documents) */
  label: string
  /** one-line description of when to use this kind */
  description: string
  /** the docx filename base for a new document from this template */
  fileName: string
  options: GovtTemplateOptions
}

export type GovtTemplateId = 'notice' | 'request' | 'report' | 'letter' | 'minutes'

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
