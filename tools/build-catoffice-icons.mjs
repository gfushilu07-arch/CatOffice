/**
 * Builds the full CatOffice icon set from the master SVG at
 * assets/brand/catoffice-icon.svg ("the document is the cat" mark).
 *
 * Rasterization uses @napi-rs/canvas (bundles resvg — full gradient/stroke/path
 * support; ImageMagick's built-in MSVG renderer is not good enough). The .ico is
 * assembled by ImageMagick from the rendered PNGs; the .icns by macOS iconutil.
 *
 * Outputs:
 *   apps/shell/build/icon.icns / icon.ico / icon.png / icon-mac.png
 *   apps/shell/build/icons/<size>x<size>.png   (Linux hicolor set)
 *   apps/shell/src/renderer/src/assets/app-icon.png
 *
 * Usage: node tools/build-catoffice-icons.mjs
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const { createCanvas, loadImage } = require('@napi-rs/canvas')

const MASTER = join(ROOT, 'assets/brand/catoffice-icon.svg')
const MASTER_SMALL = join(ROOT, 'assets/brand/catoffice-icon-small.svg')
const BUILD = join(ROOT, 'apps/shell/build')
const ICONS_DIR = join(BUILD, 'icons')
const RENDERER_ASSETS = join(ROOT, 'apps/shell/src/renderer/src/assets')

/** ≤32 uses the simplified rendition (no whiskers/text lines); 48+ the full art */
const SMALL_SIZES = [16, 24, 32]
const FULL_SIZES = [48, 64, 128, 256, 512, 1024]

async function renderAll() {
  const buffers = new Map()
  const sources = [
    [MASTER_SMALL, SMALL_SIZES],
    [MASTER, FULL_SIZES],
  ]
  for (const [file, sizes] of sources) {
    const img = await loadImage(readFileSync(file))
    for (const size of sizes) {
      const canvas = createCanvas(size, size)
      const ctx = canvas.getContext('2d')
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, size, size)
      buffers.set(size, canvas.toBuffer('image/png'))
    }
  }
  return buffers
}

function buildIcns(buffers) {
  const work = mkdtempSync(join(tmpdir(), 'catoffice-iconset-'))
  const iconset = join(work, 'icon.iconset')
  execFileSync('mkdir', ['-p', iconset])
  const pairs = [
    [16, 'icon_16x16.png'],
    [32, 'icon_16x16@2x.png'],
    [32, 'icon_32x32.png'],
    [64, 'icon_32x32@2x.png'],
    [128, 'icon_128x128.png'],
    [256, 'icon_128x128@2x.png'],
    [256, 'icon_256x256.png'],
    [512, 'icon_256x256@2x.png'],
    [512, 'icon_512x512.png'],
    [1024, 'icon_512x512@2x.png'],
  ]
  for (const [size, name] of pairs) {
    writeFileSync(join(iconset, name), buffers.get(size))
  }
  const out = join(BUILD, 'icon.icns')
  execFileSync('iconutil', ['-c', 'icns', iconset, '-o', out])
  return out
}

function buildIco(buffers) {
  // ImageMagick embeds larger entries PNG-compressed automatically
  const magick = process.env.MAGICK_BIN ?? 'magick'
  const work = mkdtempSync(join(tmpdir(), 'catoffice-ico-'))
  const inputs = []
  for (const size of [...SMALL_SIZES, ...FULL_SIZES]) {
    if (size > 256) continue
    const p = join(work, `icon-${size}.png`)
    writeFileSync(p, buffers.get(size))
    inputs.push(p)
  }
  const out = join(BUILD, 'icon.ico')
  execFileSync(magick, [...inputs, out])
  return out
}

async function main() {
  const buffers = await renderAll()

  writeFileSync(join(BUILD, 'icon.png'), buffers.get(1024))
  writeFileSync(join(BUILD, 'icon-mac.png'), buffers.get(1024))
  writeFileSync(join(RENDERER_ASSETS, 'app-icon.png'), buffers.get(1024))
  for (const size of [...SMALL_SIZES, ...FULL_SIZES]) {
    if (size === 24) continue // Linux hicolor set has no 24px slot
    writeFileSync(join(ICONS_DIR, `${size}x${size}.png`), buffers.get(size))
  }

  console.log('icns:', buildIcns(buffers))
  console.log('ico:', buildIco(buffers))
  console.log(
    `done: ${SMALL_SIZES.length + FULL_SIZES.length} sizes from ${MASTER} (+small variant)`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
