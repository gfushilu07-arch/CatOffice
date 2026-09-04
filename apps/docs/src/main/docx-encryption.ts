/**
 * Password-protected (ECMA-376 encrypted) docx support. The single integration
 * point for the third-party crypto implementation (officecrypto-tool): if it
 * ever needs replacing, only this module changes.
 *
 * An encrypted docx is not a zip: Word/WPS repackage it as a CFB (OLE2)
 * container holding an EncryptionInfo stream (parameters) and an
 * EncryptedPackage stream (the ciphertext of the real docx zip). Both apps
 * write the same MS-OFFCRYPTO formats (Standard = AES-128/SHA-1, Agile =
 * AES-256/SHA-512), and both open either — so we decrypt both and re-encrypt
 * with Agile, matching Word 2013+ defaults.
 */
import officeCrypto from 'officecrypto-tool'
import {
  ContainerDecryptError,
  decryptContainer,
  detectContainerAlgo,
  encryptContainer,
  type ContainerAlgo,
} from './doc-container-crypto'

const CFB_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
const ENCRYPTED_STREAM_UTF16 = Buffer.from('EncryptedPackage', 'utf16le')

/** CFB (OLE2) container magic — for a .docx path this means "encrypted" (plain docx is a zip) */
export function isCfbFile(bytes: Buffer): boolean {
  return bytes.length >= 8 && bytes.subarray(0, 8).equals(CFB_MAGIC)
}

/** ECMA-376 encrypted OOXML: CFB magic + an EncryptedPackage stream in the directory. */
export function isEncryptedDocx(bytes: Buffer): boolean {
  return isCfbFile(bytes) && bytes.includes(ENCRYPTED_STREAM_UTF16)
}

export type DecryptFailReason = 'wrong-password' | 'unsupported'

export class DocxDecryptError extends Error {
  readonly reason: DecryptFailReason
  constructor(reason: DecryptFailReason, message: string) {
    super(message)
    this.reason = reason
  }
}

/**
 * Decrypt an encrypted docx into plain zip bytes. Throws DocxDecryptError with
 * reason 'wrong-password' (verifier mismatch — reprompt) or 'unsupported'
 * (exotic scheme, e.g. WPS account encryption or Extensible encryption).
 */
export async function decryptDocx(bytes: Buffer, password: string): Promise<Buffer> {
  // our own container first: officecrypto would reject it as unsupported
  if (detectContainerAlgo(bytes)) {
    try {
      return decryptContainer(bytes, password)
    } catch (err) {
      if (err instanceof ContainerDecryptError) {
        throw new DocxDecryptError(err.reason, err.message)
      }
      throw err
    }
  }
  try {
    return await officeCrypto.decrypt(bytes, { password })
  } catch (err) {
    const message = String((err as Error)?.message ?? err)
    if (message.includes('password is incorrect')) {
      throw new DocxDecryptError('wrong-password', message)
    }
    throw new DocxDecryptError('unsupported', message)
  }
}

/**
 * Encryption algorithm for a document's on-disk bytes. 'ecma376-agile' is the
 * Word/WPS-compatible default (AES-256/SHA-512); 'cat-sm4' is the CatOffice
 * container (SM4-CTR + HMAC-SM3) for deployments that require Guomi ciphers —
 * those files open only in CatOffice, which the Protect dialog states.
 */
export type DocEncryptAlgo = 'ecma376-agile' | ContainerAlgo

/** Re-encrypt plain docx zip bytes with the requested algorithm (default Agile). */
export function encryptDocx(bytes: Buffer, password: string, algo: DocEncryptAlgo = 'ecma376-agile'): Buffer {
  return algo === 'cat-sm4' ? encryptContainer(bytes, password) : officeCrypto.encrypt(bytes, { password })
}

// ── In-memory password state, keyed per renderer + file path.
// Never persisted: a relaunch re-prompts, exactly like Word/WPS. ──

/** Password that can decrypt the bytes currently on disk. */
const diskPasswords = new Map<number, Map<string, string>>()

/** Encryption algorithm of the bytes currently on disk (sniffed at open, set at commit). */
const diskAlgos = new Map<number, Map<string, DocEncryptAlgo>>()

interface PasswordIntent {
  password: string | null
  /** algorithm for the next save when a password is desired (null = keep disk algo) */
  algo: DocEncryptAlgo | null
  revision: number
}

/** Desired password for the next successful save of an existing document. */
const desiredPasswords = new Map<number, Map<string, PasswordIntent>>()
/** Desired password for the next successful save of a pathless document. */
const pendingNewDocPasswords = new Map<number, PasswordIntent>()
let nextIntentRevision = 1

/** paths whose on-disk bytes are currently encrypted (tracked at open/save time:
 *  deterministic, unlike probing the file, which can transiently fail) */
const diskEncryptedPaths = new Map<number, Set<string>>()

function setDiskPassword(wcId: number, filePath: string, password: string | null): void {
  const forWc = diskPasswords.get(wcId) ?? new Map<string, string>()
  if (password) forWc.set(filePath, password)
  else forWc.delete(filePath)
  if (forWc.size > 0) diskPasswords.set(wcId, forWc)
  else diskPasswords.delete(wcId)
}

/** Record the current on-disk password (null when the opened file is plain).
 *  `algo` is the sniffed container format of the bytes on disk. */
export function rememberDocPassword(
  wcId: number,
  filePath: string,
  password: string | null,
  algo?: DocEncryptAlgo,
): void {
  setDiskPassword(wcId, filePath, password)
  const forAlgo = diskAlgos.get(wcId) ?? new Map<string, DocEncryptAlgo>()
  if (algo) forAlgo.set(filePath, algo)
  else forAlgo.delete(filePath)
  if (forAlgo.size > 0) diskAlgos.set(wcId, forAlgo)
  else diskAlgos.delete(wcId)
}

/** Sniffed algorithm of the file's on-disk bytes (null = plain or unknown). */
export function diskAlgoFor(wcId: number, filePath: string | null | undefined): DocEncryptAlgo | null {
  if (!filePath) return null
  return diskAlgos.get(wcId)?.get(filePath) ?? null
}

/**
 * Session lock (compliance C3): drop every cached password. Subsequent operations
 * on encrypted documents re-prompt per document (the normal open path) —
 * nothing else is cleared, so unlocked plain documents are unaffected.
 * Returns how many documents were holding passwords.
 */
export function lockSession(): number {
  let count = 0
  for (const forWc of diskPasswords.values()) count += forWc.size
  diskPasswords.clear()
  return count
}

/** Password for the bytes currently on disk, or null for plain documents. */
export function docPasswordFor(wcId: number, filePath: string | null | undefined): string | null {
  if (!filePath) return null
  return diskPasswords.get(wcId)?.get(filePath) ?? null
}

/**
 * Record the user's desired password for the next save. This deliberately does
 * not alter the password for the current on-disk bytes: recovery copies and
 * reopen must keep using that password until a save actually lands. `algo`
 * (with a password) picks the container format for the next save; without a
 * password the disk algorithm stands.
 */
export function setDocPassword(
  wcId: number,
  filePath: string | null,
  password: string | null,
  algo?: DocEncryptAlgo,
): void {
  // explicit algo wins; undefined keeps whatever the on-disk bytes use
  // (algorithm follows the file), plain defaults to the interop format
  const effectiveAlgo = password ? (algo ?? diskAlgoFor(wcId, filePath) ?? 'ecma376-agile') : null
  const intent: PasswordIntent = { password, algo: effectiveAlgo, revision: nextIntentRevision++ }
  if (filePath) {
    const forWc = desiredPasswords.get(wcId) ?? new Map<string, PasswordIntent>()
    forWc.set(filePath, intent)
    desiredPasswords.set(wcId, forWc)
    return
  }
  pendingNewDocPasswords.set(wcId, intent)
}

/** Capture a cutoff before document-swap cleanup is queued behind an in-flight save. */
export function currentDocPasswordIntentRevision(): number {
  return nextIntentRevision - 1
}

/**
 * The renderer accepted a different document. Discard only intents that
 * existed at the captured cutoff; a password chosen for the replacement
 * document while cleanup waits behind a save must survive.
 */
export function discardDocPasswordIntents(
  wcId: number,
  throughRevision = Number.MAX_SAFE_INTEGER,
): void {
  const forWc = desiredPasswords.get(wcId)
  if (forWc) {
    for (const [path, intent] of forWc) {
      if (intent.revision <= throughRevision) forWc.delete(path)
    }
    if (forWc.size === 0) desiredPasswords.delete(wcId)
  }
  const pending = pendingNewDocPasswords.get(wcId)
  if (pending && pending.revision <= throughRevision) pendingNewDocPasswords.delete(wcId)
}

export interface DocPasswordSaveSnapshot {
  readonly sourcePath: string | null
  readonly password: string | null
  /** algorithm the next save must write with (intent override, else disk sniff) */
  readonly algo: DocEncryptAlgo
  readonly intentRevision: number | null
}

/**
 * Snapshot the effective desired state before a save starts. A failed write
 * leaves the snapshot uncommitted, while a successful write commits exactly
 * these bytes without consuming a newer intent recorded during the await.
 */
export function snapshotDocPassword(
  wcId: number,
  filePath: string | null,
): DocPasswordSaveSnapshot {
  const intent = filePath
    ? desiredPasswords.get(wcId)?.get(filePath)
    : pendingNewDocPasswords.get(wcId)
  if (intent) {
    return {
      sourcePath: filePath,
      password: intent.password,
      algo: intent.password
        ? (intent.algo ?? 'ecma376-agile')
        : (diskAlgoFor(wcId, filePath) ?? 'ecma376-agile'),
      intentRevision: intent.revision,
    }
  }
  return {
    sourcePath: filePath,
    password: docPasswordFor(wcId, filePath),
    algo: diskAlgoFor(wcId, filePath) ?? 'ecma376-agile',
    intentRevision: null,
  }
}

/**
 * Commit password state only after the atomic file write succeeds. Save As and
 * first-save move a newer concurrent intent to the new path so it remains the
 * desired state for the following save. Returns whether such an intent remains.
 */
export function commitDocPasswordSave(
  wcId: number,
  snapshot: DocPasswordSaveSnapshot,
  savedPath: string,
): boolean {
  setDiskPassword(wcId, savedPath, snapshot.password)
  markDiskEncrypted(wcId, savedPath, snapshot.password !== null)
  if (snapshot.password) {
    const forAlgo = diskAlgos.get(wcId) ?? new Map<string, DocEncryptAlgo>()
    forAlgo.set(savedPath, snapshot.algo)
    diskAlgos.set(wcId, forAlgo)
  } else {
    diskAlgos.get(wcId)?.delete(savedPath)
  }

  const sourcePath = snapshot.sourcePath
  const forWc = desiredPasswords.get(wcId) ?? new Map<string, PasswordIntent>()

  if (sourcePath === null) {
    const current = pendingNewDocPasswords.get(wcId)
    // The target may have stale state from an older document opened in this
    // renderer. Its new baseline is the just-written snapshot.
    forWc.delete(savedPath)
    if (current?.revision === snapshot.intentRevision) {
      pendingNewDocPasswords.delete(wcId)
    } else if (current) {
      pendingNewDocPasswords.delete(wcId)
      forWc.set(savedPath, current)
    }
  } else if (sourcePath === savedPath) {
    const current = forWc.get(sourcePath)
    if (current?.revision === snapshot.intentRevision) forWc.delete(sourcePath)
  } else {
    const current = forWc.get(sourcePath)
    forWc.delete(sourcePath)
    forWc.delete(savedPath)
    if (current && current.revision !== snapshot.intentRevision) {
      forWc.set(savedPath, current)
    }
  }

  if (forWc.size > 0) desiredPasswords.set(wcId, forWc)
  else desiredPasswords.delete(wcId)
  return forWc.has(savedPath)
}

/**
 * Prepare crash-recovery bytes using only the password for the current disk
 * file. Returning null for an encrypted file with missing state is deliberate:
 * skipping a recovery tick is safer than ever writing its plaintext.
 */
export function prepareRecoveryDocx(
  wcId: number,
  filePath: string,
  plainBytes: Buffer,
): Buffer | null {
  if (!isDiskEncrypted(wcId, filePath)) return plainBytes
  const password = docPasswordFor(wcId, filePath)
  if (!password) return null
  return encryptDocx(plainBytes, password, diskAlgoFor(wcId, filePath) ?? 'ecma376-agile')
}

/** Decrypt an encrypted recovery copy with the current disk password. */
export async function decryptRecoveryCopy(
  wcId: number,
  filePath: string,
  bytes: Buffer,
): Promise<Buffer> {
  if (!isEncryptedDocx(bytes)) return bytes
  const password = docPasswordFor(wcId, filePath)
  if (!password) {
    throw new DocxDecryptError('unsupported', 'missing password for encrypted recovery copy')
  }
  return decryptDocx(bytes, password)
}

/** File renamed on disk: keep disk and desired state reachable under the new path. */
export function renameDocPassword(wcId: number, oldPath: string, newPath: string): void {
  const forWc = diskPasswords.get(wcId)
  const password = forWc?.get(oldPath)
  if (forWc && password !== undefined) {
    forWc.delete(oldPath)
    forWc.set(newPath, password)
  }
  const forAlgo = diskAlgos.get(wcId)
  const algo = forAlgo?.get(oldPath)
  if (forAlgo && algo !== undefined) {
    forAlgo.delete(oldPath)
    forAlgo.set(newPath, algo)
  }
  const desiredForWc = desiredPasswords.get(wcId)
  const desired = desiredForWc?.get(oldPath)
  if (desiredForWc && desired) {
    desiredForWc.delete(oldPath)
    desiredForWc.set(newPath, desired)
  }
  const encSet = diskEncryptedPaths.get(wcId)
  if (encSet?.delete(oldPath)) encSet.add(newPath)
}

/**
 * Record whether the file's on-disk bytes are encrypted; called wherever the
 * main process learns the on-disk state (open, and after every save). Recovery
 * copies key off this: they are only encrypted when the on-disk original is,
 * so a post-crash reopen (which can only ever obtain the on-disk file's
 * password) can always decrypt them.
 */
export function markDiskEncrypted(wcId: number, filePath: string, encrypted: boolean): void {
  const forWc = diskEncryptedPaths.get(wcId) ?? new Set<string>()
  if (encrypted) forWc.add(filePath)
  else forWc.delete(filePath)
  diskEncryptedPaths.set(wcId, forWc)
}

/** The file's on-disk bytes are encrypted (as last opened/saved by this renderer). */
export function isDiskEncrypted(wcId: number, filePath: string): boolean {
  return diskEncryptedPaths.get(wcId)?.has(filePath) ?? false
}

/** Renderer torn down (tab closed): its passwords must not outlive it. */
export function forgetDocPasswords(wcId: number): void {
  diskPasswords.delete(wcId)
  diskAlgos.delete(wcId)
  desiredPasswords.delete(wcId)
  pendingNewDocPasswords.delete(wcId)
  diskEncryptedPaths.delete(wcId)
}
