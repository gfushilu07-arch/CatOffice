/**
 * Seal library (asset center SA2, compliance: stamp-mode tier — visual
 * assets, no legal signing weight; see seal-signing-plan.md): CRUD over a
 * JSONL-free simple JSON registry in userData/seals/library.json with each
 * stamp image stored alongside as a PNG. Pure TS + node:fs; the storage
 * root is injected (main process passes app.getPath('userData')).
 *
 * A stamp entry can be UPGRADED to signature mode later (CA-backed) by
 * adding certificate metadata — the registry reserves the field.
 */

import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export type SealShape = 'circle' | 'ellipse' | 'rect' | 'unknown'

export interface SealLibraryEntry {
  id: string
  name: string
  shape: SealShape
  /** physical size hints in mm (from SA1 detection or user edit) */
  sizeMm?: { width: number; height: number }
  /** stamp mode (visual asset). Signature-mode upgrades add cert metadata */
  mode: 'stamp'
  /** reserved for SA3 signature-mode upgrade */
  signature?: { certFingerprint: string } | undefined
  /** ISO timestamp */
  createdAt: string
  /** image file name inside the library dir */
  image: string
}

const LIBRARY_FILE = 'library.json'

export interface SealLibrary {
  entries: SealLibraryEntry[]
}

export function libraryFile(root: string): string {
  return join(root, LIBRARY_FILE)
}

export async function readLibrary(root: string): Promise<SealLibrary> {
  try {
    const raw = JSON.parse(await readFile(libraryFile(root), 'utf8')) as { entries?: unknown }
    if (!raw || !Array.isArray(raw.entries)) return { entries: [] }
    const entries: SealLibraryEntry[] = []
    for (const e of raw.entries as Array<Record<string, unknown>>) {
      if (
        typeof e.id !== 'string' ||
        typeof e.name !== 'string' ||
        typeof e.image !== 'string' ||
        typeof e.createdAt !== 'string' ||
        e.mode !== 'stamp'
      )
        continue
      const shape = (['circle', 'ellipse', 'rect', 'unknown'] as const).includes(
        e.shape as SealShape,
      )
        ? (e.shape as SealShape)
        : 'unknown'
      entries.push({
        id: e.id,
        name: e.name,
        shape,
        ...(e.sizeMm && typeof e.sizeMm === 'object'
          ? { sizeMm: e.sizeMm as SealLibraryEntry['sizeMm'] }
          : {}),
        mode: 'stamp',
        ...(e.signature ? { signature: e.signature as SealLibraryEntry['signature'] } : {}),
        createdAt: e.createdAt,
        image: e.image,
      })
    }
    return { entries }
  } catch {
    return { entries: [] }
  }
}

async function writeLibrary(root: string, lib: SealLibrary): Promise<void> {
  await mkdir(root, { recursive: true })
  await writeFile(libraryFile(root), JSON.stringify(lib, null, 2), 'utf8')
}

export interface AddStampInput {
  name: string
  shape?: SealShape
  sizeMm?: { width: number; height: number }
  /** PNG bytes (from SA1 cropRgba output or user file) */
  png: Uint8Array
}

/** add a stamp: image bytes land as <id>.png, metadata appended */
export async function addStamp(
  root: string,
  input: AddStampInput,
  id = `seal-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
): Promise<SealLibraryEntry> {
  const lib = await readLibrary(root)
  await mkdir(root, { recursive: true })
  const image = `${id}.png`
  await writeFile(join(root, image), input.png)
  const entry: SealLibraryEntry = {
    id,
    name: input.name,
    shape: input.shape ?? 'unknown',
    ...(input.sizeMm ? { sizeMm: input.sizeMm } : {}),
    mode: 'stamp',
    createdAt: new Date().toISOString(),
    image,
  }
  lib.entries.push(entry)
  await writeLibrary(root, lib)
  return entry
}

export async function renameStamp(root: string, id: string, name: string): Promise<boolean> {
  const lib = await readLibrary(root)
  const entry = lib.entries.find((e) => e.id === id)
  if (!entry) return false
  entry.name = name
  await writeLibrary(root, lib)
  return true
}

export async function removeStamp(root: string, id: string): Promise<boolean> {
  const lib = await readLibrary(root)
  const entry = lib.entries.find((e) => e.id === id)
  if (!entry) return false
  lib.entries = lib.entries.filter((e) => e.id !== id)
  await writeLibrary(root, lib)
  await unlink(join(root, entry.image)).catch(() => {})
  return true
}

/** resolve a stamp's image bytes (insert path) */
export async function readStampImage(
  root: string,
  id: string,
): Promise<{ entry: SealLibraryEntry; png: Uint8Array } | null> {
  const lib = await readLibrary(root)
  const entry = lib.entries.find((e) => e.id === id)
  if (!entry) return null
  try {
    const png = await readFile(join(root, entry.image))
    return { entry, png: new Uint8Array(png) }
  } catch {
    return null
  }
}

export async function entryExists(root: string, id: string): Promise<boolean> {
  return (await readLibrary(root)).entries.some((e) => e.id === id)
}

