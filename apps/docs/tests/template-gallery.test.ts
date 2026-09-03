/**
 * Template gallery merge rules (asset center A2): the local catalog is the
 * floor (offline-guaranteed, first), cloud entries dedupe by id into it
 * (metadata enrichment only — the preset stays local), and cloud-only
 * entries append after, ordered by downloads.
 */
import { describe, expect, it } from 'vitest'
import { mergeCatalog } from '../src/renderer/components/TemplateGallery'
import type { AssetTemplateEntry } from '@catoffice/catspark/asset-center'

const cloudEntry = (id: string, downloads: number): AssetTemplateEntry => ({
  id,
  label: `label-${id}`,
  description: 'desc',
  fileName: id,
  category: 'govt',
  downloads,
  preset: { kind: 'govt', options: { title: `关于××的${id}` } },
})

describe('gallery catalog merge', () => {
  it('shows the five govt kinds first, then the office set, when the cloud is unreachable', () => {
    const rows = mergeCatalog(null)
    expect(rows).toHaveLength(9) // 5 govt + 4 office (P1)
    expect(rows.slice(0, 5).map((r) => r.id)).toEqual([
      'notice',
      'request',
      'report',
      'letter',
      'minutes',
    ])
    expect(rows.slice(5).map((r) => r.id)).toEqual([
      'office-contract',
      'office-weekly',
      'office-minutes',
      'office-resume',
    ])
    expect(rows.slice(5).every((r) => r.category === 'business' && !r.cloudOnly)).toBe(true)
  })

  it('dedupes cloud entries by id and enriches the local row', () => {
    const rows = mergeCatalog([cloudEntry('notice', 9999)])
    expect(rows).toHaveLength(9) // no duplicate notice row
    const notice = rows.find((r) => r.id === 'notice')!
    expect(notice.cloudOnly).toBe(false)
    expect(notice.downloads).toBe(9999)
    // the preset stays the LOCAL one (label not overwritten)
    expect(notice.label).toBe('通知')
  })

  it('appends cloud-only rows after the local block, ordered by downloads', () => {
    const rows = mergeCatalog([cloudEntry('govt-joint', 100), cloudEntry('govt-horizontal', 500)])
    expect(rows).toHaveLength(11)
    expect(rows.slice(9).map((r) => r.id)).toEqual(['govt-horizontal', 'govt-joint'])
    expect(rows.slice(9).every((r) => r.cloudOnly)).toBe(true)
  })

  it('keeps local rows ahead even when cloud downloads are higher', () => {
    const rows = mergeCatalog([cloudEntry('govt-joint', 999999)])
    expect(rows[0]!.id).toBe('notice')
    expect(rows[rows.length - 1]!.id).toBe('govt-joint')
  })
})
