/**
 * CatOffice pnpm patch: electron-builder copies the nested commander path of
 * @genspark/cli verbatim from a flat node_modules (see
 * apps/shell/electron-builder.cjs). pnpm + shamefully-hoist does not create
 * that nested directory, so copy the hoisted root commander (which is exactly
 * the ^12.1.0 version the CLI needs) into place. Runs after every pnpm install.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cliDir = join(root, 'node_modules/@genspark/cli')
const rel = (p) => p.slice(root.length + 1)

if (!existsSync(cliDir)) {
  console.log('[catoffice-setup] @genspark/cli not installed yet; skipping')
  process.exit(0)
}

const nested = join(cliDir, 'node_modules/commander')
const req = createRequire(join(cliDir, 'package.json'))
// exports maps seal ./package.json, so resolve the entry file and walk up to
// the package directory (checked against its package.json)
let resolved = dirname(req.resolve('commander'))
while (!existsSync(join(resolved, 'package.json'))) {
  const parent = dirname(resolved)
  if (parent === resolved) {
    console.error('[catoffice-setup] cannot locate commander package directory')
    process.exit(1)
  }
  resolved = parent
}
if (!existsSync(nested)) {
  mkdirSync(dirname(nested), { recursive: true })
  // dereference: copy the real file tree instead of symlinks so electron-builder packs it as-is
  cpSync(resolved, nested, { recursive: true, dereference: true })
  console.log(`[catoffice-setup] created ${nested} <- ${resolved}`)
}

// The slides main process deep-imports <root>/node_modules/harfbuzzjs/dist/
// (the package exports map seals subpaths; see apps/slides/src/main/shaped-metrics.ts).
// Under npm workspaces the hoisted root copy is slides' ^1.4.0 which has dist/,
// but pnpm's shamefully-hoist may instead surface pdf's ^0.10.3 (no dist/). Point
// the root entry at slides' own copy when dist/ is missing so both layouts build.
const rootHarfbuzz = join(root, 'node_modules/harfbuzzjs')
const wantDistFile = join(rootHarfbuzz, 'dist/harfbuzz.js')
if (!existsSync(wantDistFile)) {
  const slidesCopy = join(root, 'apps/slides/node_modules/harfbuzzjs')
  if (!existsSync(join(slidesCopy, 'dist/harfbuzz.js'))) {
    console.error('[catoffice-setup] no harfbuzzjs 1.x copy found under apps/slides')
    process.exit(1)
  }
  rmSync(rootHarfbuzz, { force: true, recursive: true })
  symlinkSync(slidesCopy, rootHarfbuzz)
  console.log(`[catoffice-setup] repointed ${rel(rootHarfbuzz)} -> slides 1.x copy (for dist/)`)
}

const checks = [
  'node_modules/@genspark/cli',
  'node_modules/ws',
  'node_modules/electron/dist/LICENSES.chromium.html',
  'node_modules/@embedpdf/pdfium/dist/pdfium.wasm',
  'apps/pdf/node_modules/harfbuzzjs/hb-subset.wasm',
]
let ok = true
for (const rel of checks) {
  const p = join(root, rel)
  if (!existsSync(p)) {
    console.error(`[catoffice-setup] missing ${rel}`)
    ok = false
  }
}
if (!ok) process.exit(1)
console.log('[catoffice-setup] packaging path checks passed')
