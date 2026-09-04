/**
 * SM3 cryptographic hash (GB/T 32905-2016), pure TypeScript — compliance C4.
 *
 * Purpose: the audit hash chain and future OFD digests need a Guomi option
 * (Chinese gov/sectoral deployments); the audit package is dependency-free by
 * contract, so this is an in-repo implementation locked by the GB/T 32905
 * standard vectors plus OpenSSL(3) cross-checks at block boundaries — not an
 * npm supply-chain dependency. SHA-256 stays the default everywhere; SM3 is
 * opt-in.
 */

/** 32-bit left rotation (x is assumed unsigned) */
function rotl(x: number, n: number): number {
  return ((x << n) | (x >>> (32 - n))) >>> 0
}

const IV = [
  0x7380166f, 0x4914b2b9, 0x172442d7, 0xda8a0600, 0xa96f30bc, 0x163138aa, 0xe38dee4d, 0xb0fb0e4e,
]

/** compress one 512-bit block (16 big-endian words read from `bytes` at `byteOff`) into V (in place) */
function compress(v: number[], bytes: Uint8Array, byteOff: number): void {
  const dv = new DataView(bytes.buffer, bytes.byteOffset + byteOff, 64)
  const W = new Uint32Array(68)
  const W1 = new Uint32Array(64)
  for (let i = 0; i < 16; i++) W[i] = dv.getUint32(i * 4)
  for (let j = 16; j < 68; j++) {
    const x = W[j - 16]! ^ W[j - 9]! ^ rotl(W[j - 3]!, 15)
    W[j] = (x ^ rotl(x, 15) ^ rotl(x, 23)) ^ rotl(W[j - 13]!, 7) ^ W[j - 6]!
  }
  for (let j = 0; j < 64; j++) W1[j] = W[j]! ^ W[j + 4]!

  let [A, B, C, D, E, F, G, H] = v
  for (let j = 0; j < 64; j++) {
    // SM3 distinguishes itself from the SHA family here: the round constant
    // rotates by j mod 32 on top of the two base values (GB/T 32905-2016 §5.3.2)
    const t = rotl(j < 16 ? 0x79cc4519 : 0x7a879d8a, j % 32)
    const ss1 = rotl((rotl(A, 12) + E + t) >>> 0, 7)
    const ss2 = ss1 ^ rotl(A, 12)
    const ff = j < 16 ? A ^ B ^ C : (A & B) | (A & C) | (B & C)
    const gg = j < 16 ? E ^ F ^ G : (E & F) | (~E & G)
    const tt1 = (ff + D + ss2 + W1[j]!) >>> 0
    const tt2 = (gg + H + ss1 + W[j]!) >>> 0
    D = C
    C = rotl(B, 9)
    B = A
    A = tt1
    H = G
    G = rotl(F, 19)
    F = E
    E = tt2 ^ rotl(tt2, 9) ^ rotl(tt2, 17)
  }
  v[0] = (v[0]! ^ A) >>> 0
  v[1] = (v[1]! ^ B) >>> 0
  v[2] = (v[2]! ^ C) >>> 0
  v[3] = (v[3]! ^ D) >>> 0
  v[4] = (v[4]! ^ E) >>> 0
  v[5] = (v[5]! ^ F) >>> 0
  v[6] = (v[6]! ^ G) >>> 0
  v[7] = (v[7]! ^ H) >>> 0
}

function hex(v: number[]): string {
  return v.map((x) => x.toString(16).padStart(8, '0')).join('')
}

/** SM3 digest of a UTF-8 string or raw bytes, as 64 lowercase hex chars */
export function sm3(input: string | Uint8Array): string {
  const data = typeof input === 'string' ? new TextEncoder().encode(input) : input
  const bitLenHi = Math.floor((data.length / 0x20000000) | 0)
  const bitLenLo = (data.length << 3) >>> 0
  // padded length: message + 0x80 + zeros + 8-byte big-endian bit length
  const padded = new Uint8Array((((data.length + 8) >>> 6) + 1) << 6)
  padded.set(data)
  padded[data.length] = 0x80
  const dv = new DataView(padded.buffer)
  dv.setUint32(padded.length - 8, bitLenHi)
  dv.setUint32(padded.length - 4, bitLenLo)

  const v = [...IV]
  for (let off = 0; off < padded.length; off += 64) compress(v, padded, off)
  return hex(v)
}
