/**
 * CatOffice document container encryption (compliance C5): a self-describing
 * whole-file encryption for deployments that require Guomi ciphers. The
 * ECMA-376 Agile format (officecrypto-tool, AES-256/SHA-512) stays the
 * default — it is what Word/WPS open; this container is CatOffice-only and
 * opt-in per document.
 *
 * Format (little-endian fields):
 *   0  magic  'CATENC1\0'
 *   8  u16    format version (1)
 *   10 u16    algorithm id (1 = SM4-CTR + HMAC-SM3)
 *   12 16B    KDF salt
 *   28 16B    CTR initial counter block
 *   44 u32    PBKDF2 iteration count
 *   48 32B    HMAC-SM3 tag (encrypt-then-MAC over bytes [0,48)+ciphertext)
 *   80 ..     ciphertext (SM4-CTR keystream XOR of the payload)
 *
 * Keys derive from PBKDF2-HMAC-SM3(password, salt, iterations, 48): first 16
 * bytes are the SM4 key, the remaining 32 the HMAC key. CTR + full-length HMAC
 * gives authenticated encryption without SM4-GCM (absent from the bundled
 * OpenSSL's default provider on some platforms). All primitives come from
 * node:crypto; SM4-CTR output is byte-identical to OpenSSL's (verified).
 */
import { createCipheriv, createDecipheriv, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto'

export const CONTAINER_MAGIC = Buffer.from('CATENC1\0', 'latin1')
export const CONTAINER_VERSION = 1

/** algorithm ids inside the container; the string form rides through settings/UI */
export type ContainerAlgo = 'cat-sm4'
export const CONTAINER_ALGO_ID: Record<ContainerAlgo, number> = { 'cat-sm4': 1 }

const HEADER_LEN = 48
const SALT_LEN = 16
const IV_LEN = 16
const TAG_LEN = 32
const KEY_LEN = 16
const MAC_KEY_LEN = 32
/** Word's default open-password iteration count (Agile path uses the same order) */
export const DEFAULT_ITERATIONS = 100_000

export type ContainerDecryptFailReason = 'wrong-password' | 'unsupported'

export class ContainerDecryptError extends Error {
  readonly reason: ContainerDecryptFailReason
  constructor(reason: ContainerDecryptFailReason, message: string) {
    super(message)
    this.reason = reason
  }
}

/** 'cat-sm4' when the bytes carry our container magic, else null */
export function detectContainerAlgo(bytes: Buffer): ContainerAlgo | null {
  if (bytes.length < HEADER_LEN || !bytes.subarray(0, 8).equals(CONTAINER_MAGIC)) return null
  const version = bytes.readUInt16LE(8)
  const algoId = bytes.readUInt16LE(10)
  if (version !== CONTAINER_VERSION) return null
  const algo = (Object.keys(CONTAINER_ALGO_ID) as ContainerAlgo[]).find(
    (k) => CONTAINER_ALGO_ID[k] === algoId,
  )
  return algo ?? null
}

function deriveKeys(password: string, salt: Buffer, iterations: number): { key: Buffer; macKey: Buffer } {
  const out = pbkdf2Sync(password, salt, iterations, KEY_LEN + MAC_KEY_LEN, 'sm3')
  return { key: out.subarray(0, KEY_LEN), macKey: out.subarray(KEY_LEN) }
}

function sm4Ctr(key: Buffer, iv: Buffer, data: Buffer): Buffer {
  const cipher = createCipheriv('sm4-ctr', key, iv)
  return Buffer.concat([cipher.update(data), cipher.final()])
}

/** HMAC-SM3 over the header prefix and the ciphertext (everything but the tag) */
function containerTag(macKey: Buffer, header: Buffer, ciphertext: Buffer): Buffer {
  return createHmac('sm3', macKey).update(header).update(ciphertext).digest()
}

export function encryptContainer(
  plain: Buffer,
  password: string,
  options: { iterations?: number } = {},
): Buffer {
  const iterations = options.iterations ?? DEFAULT_ITERATIONS
  if (!(iterations >= 1000)) throw new RangeError('container iterations below 1000')
  const salt = randomBytes(SALT_LEN)
  const iv = randomBytes(IV_LEN)
  const { key, macKey } = deriveKeys(password, salt, iterations)
  const ciphertext = sm4Ctr(key, iv, plain)

  const header = Buffer.alloc(HEADER_LEN)
  CONTAINER_MAGIC.copy(header, 0)
  header.writeUInt16LE(CONTAINER_VERSION, 8)
  header.writeUInt16LE(CONTAINER_ALGO_ID['cat-sm4'], 10)
  salt.copy(header, 12)
  iv.copy(header, 28)
  header.writeUInt32LE(iterations, 44)
  const tag = containerTag(macKey, header, ciphertext)
  return Buffer.concat([header, tag, ciphertext])
}

export function decryptContainer(bytes: Buffer, password: string): Buffer {
  const algo = detectContainerAlgo(bytes)
  if (!algo) throw new ContainerDecryptError('unsupported', 'not a CatOffice container')
  if (bytes.length < HEADER_LEN + TAG_LEN) {
    throw new ContainerDecryptError('unsupported', 'truncated container')
  }
  const header = bytes.subarray(0, HEADER_LEN)
  const salt = bytes.subarray(12, 12 + SALT_LEN)
  const iv = bytes.subarray(28, 28 + IV_LEN)
  const iterations = bytes.readUInt32LE(44)
  const tag = bytes.subarray(HEADER_LEN, HEADER_LEN + TAG_LEN)
  const ciphertext = bytes.subarray(HEADER_LEN + TAG_LEN)
  if (iterations < 1000) throw new ContainerDecryptError('unsupported', 'bad iteration count')

  const { key, macKey } = deriveKeys(password, salt, iterations)
  // verify BEFORE decrypting (encrypt-then-MAC): a wrong password must fail
  // in constant-ish time and never emit plaintext
  if (!containerTag(macKey, header, ciphertext).equals(tag)) {
    throw new ContainerDecryptError('wrong-password', 'container tag mismatch')
  }
  return sm4Ctr(key, iv, ciphertext)
}
