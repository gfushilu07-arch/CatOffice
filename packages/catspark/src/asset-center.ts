/**
 * CatSpark asset-center client (A2): the cloud catalog of document templates.
 * The contract mirrors the embedded mock server's /api/asset_center routes;
 * the real CatSpark backend serves the same shapes. Every failure resolves
 * null/[] so the UI's local layer (govt-catalog) never depends on the cloud.
 *
 * Model note: a cloud entry is metadata + a generation preset id, not a
 * binary file — templates are code-rendered Block[] (asset-center plan §3:
 * the template IS the docx the local generators emit), so "download" means
 * applying the preset locally.
 */

import { apiUrl, attributionHeaders } from './index'

export interface AssetTemplateEntry {
  /** stable template id (matches the local catalog ids when it has one) */
  id: string
  /** display name */
  label: string
  /** when to use this kind (zh, shown in the gallery) */
  description: string
  /** docx filename base for new documents */
  fileName: string
  /** category tag for the gallery filter */
  category: 'govt' | 'business' | 'personal'
  /** download count (display-only popularity hint) */
  downloads: number
  /** generation preset carried by this entry; the local renderer applies it */
  preset: {
    kind: 'govt'
    options: Record<string, string>
  }
}

/** Endpoint base: the CatSpark cloud by default, overridable for tests. */
export function assetCenterBase(): string {
  const v = process.env.CATSPARK_ASSET_BASE
  return v && v.trim() !== '' ? v.trim() : apiUrl('/api/asset_center')
}

/** The template gallery listing; `category` filters, `q` searches
 * label+description (same query contract the mock serves). */
export async function listAssetTemplates(
  query?: { category?: string; q?: string },
): Promise<AssetTemplateEntry[] | null> {
  const params = new URLSearchParams()
  if (query?.category) params.set('category', query.category)
  if (query?.q) params.set('q', query.q)
  const qs = params.toString()
  let res: Response
  try {
    res = await fetch(`${assetCenterBase()}/templates${qs ? `?${qs}` : ''}`, {
      headers: attributionHeaders(assetCenterBase()),
    })
  } catch {
    return null
  }
  if (!res.ok) return null
  try {
    const parsed: unknown = await res.json()
    if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { templates?: unknown }).templates))
      return null
    const out: AssetTemplateEntry[] = []
    for (const entry of (parsed as { templates: unknown[] }).templates) {
      if (!entry || typeof entry !== 'object') continue
      const e = entry as Record<string, unknown>
      const preset = e.preset as AssetTemplateEntry['preset'] | undefined
      if (
        typeof e.id !== 'string' ||
        typeof e.label !== 'string' ||
        typeof e.description !== 'string' ||
        typeof e.fileName !== 'string' ||
        !preset ||
        preset.kind !== 'govt' ||
        typeof preset.options !== 'object' ||
        preset.options === null
      )
        continue
      out.push({
        id: e.id,
        label: e.label,
        description: e.description,
        fileName: e.fileName,
        category: e.category === 'business' || e.category === 'personal' ? e.category : 'govt',
        downloads: typeof e.downloads === 'number' ? e.downloads : 0,
        preset: { kind: 'govt', options: preset.options as Record<string, string> },
      })
    }
    return out
  } catch {
    return null
  }
}
