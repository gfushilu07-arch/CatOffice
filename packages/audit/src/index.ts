/**
 * Local security audit log (compliance C1, compliance-plan.md section 2): an append-only
 * JSONL file per day under `<auditDir>/YYYY-MM-DD.jsonl`, one event per line,
 * each line carrying a hash chain over the previous line so any after-the-fact
 * deletion or edit breaks the chain and is detectable.
 *
 * Hard red line: events record WHO did WHAT to WHICH file WHEN — never
 * document content, never AI prompts/responses, never passwords.
 *
 * Storage contract: `appendEvent` never rewrites existing bytes (fd kept
 * resident, O_APPEND), so single-writer semantics must be enforced by the
 * caller (the shell main process owns the log; renderers go through IPC).
 */

import { createHash } from 'node:crypto'
import { open, appendFile, mkdir, readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

export type AuditAction =
  | 'doc.open'
  | 'doc.save'
  | 'doc.export.pdf'
  | 'doc.export.image'
  | 'doc.print'
  | 'doc.password.set'
  | 'doc.password.remove'
  | 'doc.permission.change'
  | 'ai.session.start'
  | 'ai.session.end'
  | 'settings.privacy.change'
  | 'app.session.lock'
  | 'app.start'
  | 'app.quit'

/** one audit record (as persisted, minus the chain fields) */
export interface AuditEvent {
  /** ISO UTC timestamp */
  ts: string
  /** actor id; 'local' until an account system exists */
  actor: string
  action: AuditAction
  /** semantic target: file path / page count / model id — never content */
  target: string
  /** action-specific extra fields; must not carry document content */
  detail?: Record<string, string | number | boolean>
}

/** an event as written to the file: chain fields appended */
export interface AuditLine extends AuditEvent {
  /** hash of the previous line ('' for the first line of a fresh log) */
  prev: string
  /** sha256(prev + canonical-json-of-this-entry-without-hash) */
  hash: string
}

/** canonical JSON: fixed key order, no spaces — the hash input must be stable */
function canonicalJson(event: Omit<AuditLine, 'hash'>): string {
  const ordered = {
    ts: event.ts,
    actor: event.actor,
    action: event.action,
    target: event.target,
    ...(event.detail ? { detail: event.detail } : {}),
    prev: event.prev,
  }
  return JSON.stringify(ordered)
}

function lineHash(prev: string, event: Omit<AuditLine, 'hash'>): string {
  return createHash('sha256').update(canonicalJson({ ...event, prev })).digest('hex')
}

/** the current UTC date as the per-day FILE name (YYYY-MM-DD.jsonl) */
export function auditDayFile(now = new Date()): string {
  return now.toISOString().slice(0, 10) + '.jsonl'
}

/** accept 'YYYY-MM-DD' or 'YYYY-MM-DD.jsonl'; public read/verify take either */
function dayStem(day: string): string {
  return day.replace(/\.jsonl$/, '')
}

/** serialize one event into its on-disk line (with trailing newline) */
export function serializeAuditLine(
  event: Omit<AuditLine, 'hash'> | AuditEvent,
  prevHash: string,
): {
  line: string
  hash: string
} {
  const hash = lineHash(prevHash, event as Omit<AuditLine, 'hash'>)
  const full: AuditLine = { ...event, prev: prevHash, hash }
  return { line: JSON.stringify(full) + '\n', hash }
}

export interface AuditWriterOptions {
  /** directory holding YYYY-MM-DD.jsonl files (created on demand) */
  auditDir: string
  /** injected clock for tests */
  now?: () => Date
}

/**
 * Resident audit writer: owns the append fd for the current day, rolls over
 * when the UTC date changes, and tracks the running hash chain. `flush` is
 * fire-and-forget by design — an audit write must never block or fail the
 * user action that produced it (compliance-plan.md section 2).
 */
import type { FileHandle } from 'node:fs/promises'

export class AuditWriter {
  private fd: FileHandle | null = null
  private fdDay = ''
  private lastHash = ''
  private initialized = false
  private readonly now: () => Date

  constructor(private readonly options: AuditWriterOptions) {
    this.now = options.now ?? (() => new Date())
  }

  /** release the resident fd (app quit / day roll in tests) */
  async close(): Promise<void> {
    if (this.fd !== null) {
      await this.fd.close()
      this.fd = null
      this.fdDay = ''
    }
  }

  private async dayFilePath(day: string): Promise<string> {
    await mkdir(this.options.auditDir, { recursive: true })
    // `day` is the YYYY-MM-DD stem from auditDayFile(); the suffix is added here
    return join(this.options.auditDir, day + '.jsonl')
  }

  /**
   * Open (or reopen) the day's file and seed the chain from its last line.
   * A missing file starts a fresh chain with prev=''.
   */
  private async ensureOpened(): Promise<void> {
    const now = this.now()
    // the YYYY-MM-DD stem (auditDayFile returns a FILE name; here we want the day)
    const day = auditDayFile(now).replace(/\.jsonl$/, '')
    if (this.initialized && this.fdDay === day && this.fd !== null) return
    await this.close()
    const path = await this.dayFilePath(day)
    let prevHash = ''
    try {
      const existing = await readFile(path, 'utf8')
      const lines = existing.split('\n').filter((l) => l.trim() !== '')
      if (lines.length > 0) {
        const last = JSON.parse(lines[lines.length - 1]!) as AuditLine
        prevHash = last.hash
      }
    } catch {
      // no file yet: fresh chain
    }
    this.fd = await open(path, 'a')
    this.fdDay = day
    this.lastHash = prevHash
    this.initialized = true
  }

  /** append one event; resolves after the bytes hit the fd */
  async append(event: AuditEvent): Promise<void> {
    await this.ensureOpened()
    const { line, hash } = serializeAuditLine(event as Omit<AuditLine, 'hash'>, this.lastHash)
    await appendFile(this.fd!, line)
    this.lastHash = hash
  }

  /**
   * Verify a day's file (or every day file in the dir when `day` is omitted):
   * recompute the chain and report the first break. A truncated/garbled tail
   * is reported as `parse` — deletions and edits surface as `hash` breaks.
   */
  static async verify(
    auditDir: string,
    day?: string,
  ): Promise<{ ok: boolean; file: string; line?: number; reason?: 'hash' | 'parse' }> {
    const files = day
      ? [dayStem(day) + '.jsonl']
      : (await readdir(auditDir)).filter((f) => f.endsWith('.jsonl')).sort()
    for (const file of files) {
      let expectedPrev = ''
      let index = 0
      let text = ''
      try {
        text = await readFile(join(auditDir, file), 'utf8')
      } catch {
        return { ok: false, file, reason: 'parse' }
      }
      for (const raw of text.split('\n')) {
        if (raw.trim() === '') continue
        index++
        let parsed: AuditLine
        try {
          parsed = JSON.parse(raw) as AuditLine
        } catch {
          return { ok: false, file, line: index, reason: 'parse' }
        }
        const expected = lineHash(expectedPrev, parsed)
        if (expected !== parsed.hash) return { ok: false, file, line: index, reason: 'hash' }
        if (parsed.prev !== expectedPrev) return { ok: false, file, line: index, reason: 'hash' }
        expectedPrev = parsed.hash
      }
    }
    return { ok: true, file: files.join(',') }
  }

  /** read back one day's events, oldest first (viewer path) */
  static async read(
    auditDir: string,
    day: string,
  ): Promise<{ events: AuditLine[]; verify: Awaited<ReturnType<typeof AuditWriter.verify>> }> {
    let text = ''
    try {
      text = await readFile(join(auditDir, dayStem(day) + '.jsonl'), 'utf8')
    } catch {
      return { events: [], verify: { ok: true, file: dayStem(day) + '.jsonl' } }
    }
    const events: AuditLine[] = []
    for (const raw of text.split('\n')) {
      if (raw.trim() === '') continue
      events.push(JSON.parse(raw) as AuditLine)
    }
    const verdict = await AuditWriter.verify(auditDir, day)
    return { events, verify: verdict }
  }
}
