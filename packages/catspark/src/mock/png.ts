/**
 * Minimal PNG encoder for mock image assets: solid-color and vertical-gradient
 * RGB images built directly from zlib output (truecolor, no interlace). Enough
 * for the mock server to serve real, correctly-sized images without any
 * dependency on an imaging library.
 */

import { deflateSync } from 'node:zlib'

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'ascii')
  Buffer.from(data).copy(out, 8)
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), Buffer.from(data)])), 8 + data.length)
  return out
}

export interface Rgb {
  r: number
  g: number
  b: number
}

/**
 * Truecolor PNG of `width`×`height` with a vertical gradient from `top` to
 * `bottom` (same colors → solid fill).
 */
export function gradientPng(width: number, height: number, top: Rgb, bottom: Rgb): Uint8Array {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // color type: truecolor RGB
  // compression/filter/interlace all zero by allocation

  // each scanline is prefixed with filter byte 0 (None)
  const stride = width * 3
  const raw = Buffer.alloc(height * (stride + 1))
  for (let y = 0; y < height; y++) {
    const t = height > 1 ? y / (height - 1) : 0
    const row = Buffer.alloc(stride)
    for (let x = 0; x < width; x++) {
      row[x * 3] = Math.round(top.r + (bottom.r - top.r) * t)
      row[x * 3 + 1] = Math.round(top.g + (bottom.g - top.g) * t)
      row[x * 3 + 2] = Math.round(top.b + (bottom.b - top.b) * t)
    }
    row.copy(raw, y * (stride + 1) + 1)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), // PNG signature
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array(0)),
  ])
}
