/**
 * GENERATED FILE — do not edit by hand.
 * Blank 16:9 one-slide PPTX produced by @genoffice/pptx-engine createBlankPptx,
 * gzip-compressed and base64-encoded so the mock server can serve a deck the
 * slides importer is guaranteed to open. Regenerate with the one-off script
 * recorded in docs/catoffice/catspark-integration.md (mock section).
 */
import { gunzipSync } from 'node:zlib'

const GZ_BASE64 =
  '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' +
  '1BGM2oWbgO/efwCrIVJnjhUAAA=='

/** The decompressed deck bytes (a valid minimal PPTX). */
export function mockDeckPptx(): Uint8Array {
  return gunzipSync(Buffer.from(GZ_BASE64, 'base64'))
}
