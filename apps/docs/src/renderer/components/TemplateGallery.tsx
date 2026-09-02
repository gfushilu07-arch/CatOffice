/**
 * Template gallery (asset center A2): a modal overlay listing the local
 * built-in GB/T 9704 kinds merged with the cloud catalog (CatSpark; mock
 * mode serves canned entries). Cloud entries with a local id dedupe into
 * the local row enriched with cloud metadata (download badge); cloud-only
 * entries show a cloud chip. Picking a template applies it through the
 * same newFile path as a blank draft (blocks + GB section, full fidelity).
 */

import { useEffect, useMemo, useState } from 'react'
import type { NewFileTemplate } from '../file-actions'
import { ALL_TEMPLATES, templateById, type TemplateEntry } from '../template-catalog'
import { govtDocBlocks, govtDocSection } from '../govt-template'
import type { AssetTemplateEntry } from '@catoffice/catspark/asset-center'
import { isMockMode } from '@catoffice/catspark'

/** gallery row: the union of local and cloud entries, keyed by id */
export interface GalleryRow {
  id: string
  label: string
  description: string
  fileName: string
  category: TemplateEntry['category']
  /** the preset a fresh document starts with */
  options: Record<string, string>
  /** cloud-only rows carry the badge; local rows may carry download counts */
  cloudOnly: boolean
  downloads?: number
}

/** exported for tests: the local+cloud merge and ordering rules */
export function mergeCatalog(cloud: AssetTemplateEntry[] | null): GalleryRow[] {
  const local: GalleryRow[] = ALL_TEMPLATES.map((entry) => ({
    id: entry.id,
    label: entry.label,
    description: entry.description,
    fileName: entry.fileName,
    category: entry.category,
    options: entry.defaultOptions,
    cloudOnly: false,
  }))
  if (!cloud || cloud.length === 0) return local
  const byId = new Map(local.map((row) => [row.id, row]))
  for (const entry of cloud) {
    const existing = byId.get(entry.id)
    if (existing) {
      // cloud metadata enriches the local row (popularity hint)
      if (entry.downloads > 0) existing.downloads = entry.downloads
      continue
    }
    byId.set(entry.id, {
      id: entry.id,
      label: entry.label,
      description: entry.description,
      fileName: entry.fileName,
      category: entry.category === 'business' ? 'business' : 'govt',
      options: entry.preset.options,
      cloudOnly: true,
      downloads: entry.downloads,
    })
  }
  // local rows first (offline-guaranteed): govt kinds, then office; cloud-only last by downloads
  return [...byId.values()].sort((a, b) => {
    if (a.cloudOnly !== b.cloudOnly) return a.cloudOnly ? 1 : -1
    if (!a.cloudOnly && a.category !== b.category) return a.category === 'govt' ? -1 : 1
    return (b.downloads ?? 0) - (a.downloads ?? 0)
  })
}

/** a tiny live preview: the banner, doc number and title of the scaffold */
function TemplatePreview({ row }: { row: GalleryRow }) {
  if (row.category === 'business') {
    // office typography: bold centered heading over plain line bars
    return (
      <div className="govt-tpl-preview" aria-hidden="true">
        <div className="govt-tpl-title">{row.options.title ?? row.label}</div>
        <div className="govt-tpl-body">
          <span />
          <span />
          <span />
          <span style={{ marginLeft: '16%' }} />
        </div>
      </div>
    )
  }
  const banner = row.options.banner ?? '××××文件'
  const docNumber = row.options.docNumber ?? '××发〔2026〕1号'
  return (
    <div className="govt-tpl-preview" aria-hidden="true">
      <div className="govt-tpl-banner">{banner}</div>
      <div className="govt-tpl-docnum">{docNumber}</div>
      <div className="govt-tpl-rule" />
      <div className="govt-tpl-title">{row.options.title ?? row.label}</div>
      <div className="govt-tpl-body">
        <span />
        <span />
        <span />
      </div>
    </div>
  )
}

export function TemplateGallery({
  onPick,
  onClose,
}: {
  onPick: (template: NewFileTemplate) => void
  onClose: () => void
}) {
  const [cloud, setCloud] = useState<AssetTemplateEntry[] | null>(null)
  const [cloudFailed, setCloudFailed] = useState(false)
  const rows = useMemo(() => mergeCatalog(cloud), [cloud])

  useEffect(() => {
    let alive = true
    // lazy import: the asset-center client is only needed while the gallery
    // is open, keeping it out of the initial bundle's critical path
    void import('@catoffice/catspark/asset-center').then(async ({ listAssetTemplates }) => {
      const list = await listAssetTemplates()
      if (!alive) return
      if (list === null) setCloudFailed(true)
      else setCloud(list)
    })
    return () => {
      alive = false
    }
  }, [])

  const pick = (row: GalleryRow) => {
    const entry = templateById(row.id)
    const render = entry
      ? entry.render(row.options)
      : {
          // a cloud-only row without a local generator: govt scaffold by contract
          blocks: govtDocBlocks(row.options),
          section: govtDocSection(),
        }
    onPick({ ...render, fileName: row.fileName })
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="govt-gallery"
        role="dialog"
        aria-label="公文模板"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="govt-gallery-head">
          <h2>公文模板</h2>
          <span className="govt-gallery-sub">GB/T 9704 · 本地内置{cloud ? ' + 云目录' : ''}</span>
          <button className="govt-gallery-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <div className="govt-gallery-grid">
          {rows.map((row) => (
            <button key={row.id} className="govt-tpl-card" onClick={() => pick(row)}>
              <TemplatePreview row={row} />
              <div className="govt-tpl-meta">
                <div className="govt-tpl-name">
                  {row.label}
                  {row.cloudOnly && <span className="govt-tpl-cloud-chip">云</span>}
                </div>
                <div className="govt-tpl-desc">{row.description}</div>
                {row.downloads !== undefined && (
                  <div className="govt-tpl-dl">{row.downloads.toLocaleString()} 次使用</div>
                )}
              </div>
            </button>
          ))}
        </div>
        {cloudFailed && (
          <div className="govt-gallery-note">
            {isMockMode() ? '云目录不可用（mock 未响应）' : '云目录不可用，已显示本地内置模板'}
          </div>
        )}
      </div>
    </div>
  )
}
