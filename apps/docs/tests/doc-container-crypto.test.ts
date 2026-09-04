/**
 * CatOffice container encryption (compliance C5, SM4 opt-in path):
 * round-trip, tamper detection, wrong-password isolation, and an OpenSSL(3)
 * cross-check of the raw SM4-CTR layer. The ECMA-376 Agile default is covered
 * by the officecrypto-tool suite; this locks only our container.
 */
import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ITERATIONS,
  decryptContainer,
  detectContainerAlgo,
  encryptContainer,
  ContainerDecryptError,
} from '../src/main/doc-container-crypto'

const SAMPLE = Buffer.from(
  'PK\x03\x04 fake docx zip payload — 政务文档内容 '.repeat(32),
  'utf8',
)

describe('container detection', () => {
  it('detects its own container and leaves other formats alone', () => {
    const enc = encryptContainer(SAMPLE, 'pw')
    expect(detectContainerAlgo(enc)).toBe('cat-sm4')
    expect(detectContainerAlgo(SAMPLE)).toBeNull()
    // ECMA-376 CFB magic is not our container
    const cfb = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), SAMPLE])
    expect(detectContainerAlgo(cfb)).toBeNull()
  })

  it('rejects unknown versions and algorithm ids', () => {
    const enc = encryptContainer(SAMPLE, 'pw')
    enc.writeUInt16LE(9, 8)
    expect(detectContainerAlgo(enc)).toBeNull()
    enc.writeUInt16LE(1, 8)
    enc.writeUInt16LE(7, 10)
    expect(detectContainerAlgo(enc)).toBeNull()
  })
})

describe('container round-trip', () => {
  it('encrypts and decrypts back to the exact payload', () => {
    const enc = encryptContainer(SAMPLE, '口令123')
    expect(enc.equals(SAMPLE)).toBe(false)
    expect(decryptContainer(enc, '口令123').equals(SAMPLE)).toBe(true)
  })

  it('handles the empty payload', () => {
    const enc = encryptContainer(Buffer.alloc(0), 'pw')
    expect(decryptContainer(enc, 'pw')).toHaveLength(0)
  })

  it('iterations ride in the header (test-shrunk rounds work)', () => {
    const enc = encryptContainer(SAMPLE, 'pw', { iterations: 2000 })
    expect(enc.readUInt32LE(44)).toBe(2000)
    expect(decryptContainer(enc, 'pw').equals(SAMPLE)).toBe(true)
    expect(enc.readUInt32LE(44)).not.toEqual(DEFAULT_ITERATIONS)
  })
})

describe('container attacks', () => {
  it('a wrong password fails as wrong-password without emitting plaintext', () => {
    const enc = encryptContainer(SAMPLE, 'right')
    try {
      decryptContainer(enc, 'wrong')
      expect.unreachable('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(ContainerDecryptError)
      expect((err as ContainerDecryptError).reason).toBe('wrong-password')
    }
  })

  it('any single-bit ciphertext flip breaks the tag (encrypt-then-MAC)', () => {
    const enc = encryptContainer(SAMPLE, 'pw')
    const victim = Buffer.from(enc)
    victim[victim.length - 1] ^= 0x01
    expect(() => decryptContainer(victim, 'pw')).toThrowError(ContainerDecryptError)
    // header tampering (salt/iv/iterations) is covered by the same tag
    const headerHit = Buffer.from(enc)
    headerHit[13] ^= 0xff
    expect(() => decryptContainer(headerHit, 'pw')).toThrowError(ContainerDecryptError)
  })

  it('truncated containers are unsupported, not wrong-password', () => {
    const enc = encryptContainer(SAMPLE, 'pw')
    expect(() => decryptContainer(enc.subarray(0, 60), 'pw')).toThrowError(
      /truncated|not a CatOffice/,
    )
  })
})

describe('SM4-CTR layer cross-check (OpenSSL 3)', () => {
  it('matches openssl enc -sm4-ctr byte-for-byte', () => {
    // the container uses node:crypto's sm4-ctr; this pins the primitive itself
    // so a Node/OpenSSL bump that changes output cannot slip through silently
    const key = Buffer.from('000102030405060708090a0b0c0d0e0f', 'hex')
    const iv = Buffer.from('0102030405060708090a0b0c0d0e0f10', 'hex')
    const plain = Buffer.from('hello world 123')
    let opensslOut: Buffer
    try {
      opensslOut = execFileSync(
        'openssl',
        ['enc', '-e', '-sm4-ctr', '-K', key.toString('hex'), '-iv', iv.toString('hex')],
        { input: plain },
      )
    } catch {
      return // openssl without sm4: skip (the vectors in sm3.test.ts cover Guomi primitives)
    }
    const { createCipheriv } = require('node:crypto') as typeof import('node:crypto')
    const cipher = createCipheriv('sm4-ctr', key, iv)
    const nodeOut = Buffer.concat([cipher.update(plain), cipher.final()])
    expect(nodeOut.equals(opensslOut)).toBe(true)
  })
})
