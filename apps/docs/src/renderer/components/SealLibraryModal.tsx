/**
 * Seal management panel (asset-center SA2, the visible face of the
 * seal-signing management model's stamp tier — see seal-signing-plan.md):
 * lists the local stamp library, imports stamps (a picked image or a text
 * hint for SA1 detection), renames, removes, and inserts into the document
 * at the cursor through the standard image path. Signature mode (SA3) is a
 * future second tier of the same panel — entries carry the reservation
 * field already; the tier badge makes the model legible.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { SealLibraryEntry } from '../seal-library'
import { cropRgba, detectSeal, detectedSizeMm } from '../seal-detect'
import { useI18n } from '../i18n/locale'

type AddSource =
  | {
      kind: 'file'
      png: Uint8Array
      name: string
      shape?: 'circle' | 'ellipse' | 'rect'
      sizeMm?: { width: number; height: number }
    }
  | { kind: 'none' }

export function SealLibraryModal({
  onInsert,
  onClose,
}: {
  /** insert the stamp PNG at the cursor (already base64 data-url ready) */
  onInsert: (dataUrl: string, entry: SealLibraryEntry) => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const [entries, setEntries] = useState<SealLibraryEntry[] | null>(null)
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    setEntries(await window.desktop.sealsList())
  }, [])
  useEffect(() => {
    void refresh()
  }, [refresh])

  const addStampFrom = async (source: AddSource) => {
    if (source.kind === 'none') return
    setBusy(true)
    setError('')
    try {
      const res = await window.desktop.sealsAdd({
        name: source.name,
        png: source.png,
        ...(source.kind === 'file' && source.shape ? { shape: source.shape } : {}),
        ...(source.kind === 'file' && source.sizeMm ? { sizeMm: source.sizeMm } : {}),
      })
      if (!res.ok) {
        setError(t('sealAddFailed'))
        return
      }
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  /**
   * Import pipeline: decode the picked image, run the SA1 red-ink detector,
   * and crop to the seal's bounding box when one is found (auto shape/size
   * annotation); a no-hit import stores the whole image unchanged. Encoding
   * back through the canvas keeps the stored bytes PNG, whatever came in.
   */
  const onPickFile = async (file: File) => {
    if (!/\/png$|\/jpeg$/.test(file.type)) {
      setError(t('sealUnsupportedImage'))
      return
    }
    setBusy(true)
    setError('')
    try {
      const bitmap = await createImageBitmap(file)
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(bitmap, 0, 0)
      const image = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
      bitmap.close()

      const detection = detectSeal(image.data, image.width, image.height)
      const box = detection
        ? { x: detection.x, y: detection.y, width: detection.width, height: detection.height }
        : { x: 0, y: 0, width: image.width, height: image.height }
      const cropped = detection
        ? cropRgba(image.data, image.width, box)
        : { rgba: new Uint8Array(image.data), width: image.width, height: image.height }

      const out = new OffscreenCanvas(cropped.width, cropped.height)
      out.getContext('2d')!.putImageData(
        new ImageData(new Uint8ClampedArray(cropped.rgba), cropped.width, cropped.height),
        0,
        0,
      )
      const blob = await out.convertToBlob({ type: 'image/png' })
      const png = new Uint8Array(await blob.arrayBuffer())
      const sizeMm = detection
        ? { width: detectedSizeMm(detection.width), height: detectedSizeMm(detection.height) }
        : undefined
      await addStampFrom({
        kind: 'file',
        png,
        name: file.name.replace(/\.(png|jpe?g)$/i, '').slice(0, 60) || t('sealDefaultName'),
        ...(detection ? { shape: detection.shape, sizeMm } : {}),
      })
    } catch (err) {
      setError(t('sealAddFailed'))
      console.error('[seal-library] import failed:', err)
    } finally {
      setBusy(false)
    }
  }

  const insert = async (entry: SealLibraryEntry) => {
    const img = await window.desktop.sealsImage(entry.id)
    if (!img) {
      setError(t('sealImageMissing'))
      return
    }
    onInsert(`data:${img.mime};base64,${img.base64}`, entry)
    onClose()
  }

  const commitRename = async () => {
    if (!renaming) return
    const name = renaming.value.trim()
    if (name) await window.desktop.sealsRename(renaming.id, name)
    setRenaming(null)
    await refresh()
  }

  const remove = async (entry: SealLibraryEntry) => {
    if (!window.confirm(t('sealRemoveConfirm', { name: entry.name }))) return
    await window.desktop.sealsRemove(entry.id)
    await refresh()
  }

  const SHAPE_KEYS = {
    circle: 'sealShapeCircle',
    ellipse: 'sealShapeEllipse',
    rect: 'sealShapeRect',
    unknown: '',
  } as const
  const shapeLabel = (entry: SealLibraryEntry): string => {
    const key = SHAPE_KEYS[entry.shape]
    return key ? t(key) : ''
  }

  return (
    <div className="modal-backdrop">
      <div className="modal seal-library-modal gs-form">
        <h2>{t('sealLibraryTitle')}</h2>
        <p className="modal-desc">{t('sealLibraryDesc')}</p>

        <div className="seal-actions">
          <button onClick={() => fileRef.current?.click()} disabled={busy}>
            {t('sealImportImage')}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) void onPickFile(f)
            }}
          />
        </div>
        {error && <p className="fld-error">{error}</p>}

        {entries !== null && entries.length === 0 && (
          <p className="fld-hint">{t('sealEmpty')}</p>
        )}
        <div className="seal-grid">
          {(entries ?? []).map((entry) => (
            <div key={entry.id} className="seal-card">
              <SealThumb entry={entry} />
              {renaming?.id === entry.id ? (
                <input
                  autoFocus
                  value={renaming.value}
                  onChange={(e) => setRenaming({ id: entry.id, value: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void commitRename()
                    if (e.key === 'Escape') setRenaming(null)
                  }}
                  onBlur={() => void commitRename()}
                />
              ) : (
                <div className="seal-name" title={entry.name}>
                  {entry.name}
                </div>
              )}
              <div className="seal-meta">
                <span className="seal-tier">{t('sealTierStamp')}</span>
                {shapeLabel(entry) && <span>{shapeLabel(entry)}</span>}
                {entry.sizeMm && (
                  <span>
                    {Math.round(entry.sizeMm.width)}×{Math.round(entry.sizeMm.height)} mm
                  </span>
                )}
              </div>
              <div className="seal-card-actions">
                <button onClick={() => void insert(entry)}>{t('sealInsert')}</button>
                <button onClick={() => setRenaming({ id: entry.id, value: entry.name })}>
                  {t('sealRename')}
                </button>
                <button className="seal-danger" onClick={() => void remove(entry)}>
                  {t('sealRemove')}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="modal-actions">
          <button onClick={onClose}>{t('appClose')}</button>
        </div>
      </div>
    </div>
  )
}

/** stamp thumbnail: fetches the image bytes once per entry */
function SealThumb({ entry }: { entry: SealLibraryEntry }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    void window.desktop.sealsImage(entry.id).then((img) => {
      if (alive && img) setSrc(`data:${img.mime};base64,${img.base64}`)
    })
    return () => {
      alive = false
    }
  }, [entry.id])
  return (
    <div className="seal-thumb">
      {src ? <img src={src} alt={entry.name} /> : <span className="seal-thumb-missing">?</span>}
    </div>
  )
}
