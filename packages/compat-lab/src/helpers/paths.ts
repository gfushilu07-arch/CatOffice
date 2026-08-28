import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** this file sits at packages/compat-lab/src/helpers; walk up to the repo root */
const HERE = dirname(fileURLToPath(import.meta.url))

export const REPO_ROOT = join(HERE, '..', '..', '..', '..')
export const GOLDEN_ROOT = join(REPO_ROOT, 'compat', 'golden')
export const EXPECTATIONS_ROOT = join(GOLDEN_ROOT, 'expectations')

export function goldenFile(kind: 'docx' | 'pptx' | 'xlsx' | 'pdf', name: string): string {
  return join(GOLDEN_ROOT, kind, name)
}

export function expectationFile(name: string): string {
  return join(EXPECTATIONS_ROOT, `${name}.json`)
}
