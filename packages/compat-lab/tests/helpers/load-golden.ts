import { readFileSync } from 'node:fs'

import { expectationFile, goldenFile } from '../../src/helpers/paths'

export interface GoldenCase {
  bytes: Uint8Array
  expected: {
    file: string
    kind: string
    text: string
    digest?: Record<string, unknown>
  }
}

/** load a committed corpus file + its expectation; fail with a fix-it hint */
export function loadGolden(kind: 'docx' | 'pptx' | 'xlsx' | 'pdf', name: string): GoldenCase {
  const bytes = new Uint8Array(readFileSync(goldenFile(kind, name)))
  let expected: GoldenCase['expected']
  try {
    expected = JSON.parse(readFileSync(expectationFile(name), 'utf8'))
  } catch {
    throw new Error(
      `missing expectation for ${name}; run: pnpm --filter @catoffice/compat-lab run golden`,
    )
  }
  return { bytes, expected }
}
