import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  AuditWriter,
  auditDayFile,
  serializeAuditLine,
  type AuditEvent,
} from '../src/index'

const dirs: string[] = []
afterEach(() => {
  // temp dirs are under os.tmpdir(); no recursive cleanup needed for the
  // assertions, and leaving them aids post-mortem of a failed run
  dirs.length = 0
})

const newDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'audit-'))
  dirs.push(dir)
  return dir
}

const evt = (over: Partial<AuditEvent> = {}): AuditEvent => ({
  ts: '2026-09-03T10:00:00.000Z',
  actor: 'local',
  action: 'doc.open',
  target: 'D:/docs/预算.docx',
  ...over,
})

describe('audit day file naming', () => {
  it('uses the UTC date', () => {
    expect(auditDayFile(new Date('2026-09-03T23:30:00Z'))).toBe('2026-09-03.jsonl')
    expect(auditDayFile(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01-01.jsonl')
  })
})

describe('serializeAuditLine', () => {
  it('chains each line to the previous hash with a canonical form', () => {
    const first = serializeAuditLine(evt(), '')
    expect(first.hash).toHaveLength(64)
    expect(first.line.endsWith('\n')).toBe(true)
    const second = serializeAuditLine(
      evt({ action: 'doc.save', ts: '2026-09-03T10:01:00.000Z' }),
      first.hash,
    )
    const parsed = JSON.parse(second.line) as { prev: string }
    expect(parsed.prev).toBe(first.hash)
    // the same inputs must produce the same hash (canonical stability)
    expect(serializeAuditLine(evt(), '').hash).toBe(first.hash)
  })
})

describe('AuditWriter', () => {
  it('appends events into the day file with a verifiable chain', async () => {
    const dir = newDir()
    const writer = new AuditWriter({ auditDir: dir })
    await writer.append(evt())
    await writer.append(evt({ action: 'doc.save', target: 'D:/docs/预算.docx' }))
    await writer.close()
    const path = join(dir, auditDayFile())
    expect(existsSync(path)).toBe(true)
    const verdict = await AuditWriter.verify(dir)
    expect(verdict.ok).toBe(true)
    const { events } = await AuditWriter.read(dir, auditDayFile().replace(/\.jsonl$/, ''))
    expect(events).toHaveLength(2)
    expect(events[0]!.action).toBe('doc.open')
    expect(events[1]!.prev).toBe(events[0]!.hash)
  })

  it('continues the chain when reopening an existing file', async () => {
    const dir = newDir()
    const day = auditDayFile().replace(/\.jsonl$/, '')
    const first = new AuditWriter({ auditDir: dir })
    await first.append(evt())
    await first.close()
    const second = new AuditWriter({ auditDir: dir })
    await second.append(evt({ action: 'doc.save' }))
    await second.close()
    expect((await AuditWriter.verify(dir)).ok).toBe(true)
    const { events } = await AuditWriter.read(dir, day)
    expect(events).toHaveLength(2)
  })

  it('rolls over to a new file when the UTC day changes', async () => {
    const dir = newDir()
    let now = new Date('2026-09-03T23:59:59Z')
    const writer = new AuditWriter({ auditDir: dir, now: () => now })
    await writer.append(evt())
    now = new Date('2026-09-04T00:00:01Z')
    await writer.append(evt({ action: 'doc.save' }))
    await writer.close()
    expect(existsSync(join(dir, '2026-09-03.jsonl'))).toBe(true)
    expect(existsSync(join(dir, '2026-09-04.jsonl'))).toBe(true)
    expect((await AuditWriter.verify(dir)).ok).toBe(true)
  })

  it('detects an edited line (hash break)', async () => {
    const dir = newDir()
    const writer = new AuditWriter({ auditDir: dir })
    await writer.append(evt())
    await writer.append(evt({ action: 'doc.save' }))
    await writer.close()
    // tamper: rewrite the first line's target
    const path = join(dir, auditDayFile())
    const text = readFileSync(path, 'utf8')
    const lines = text.split('\n')
    const first = JSON.parse(lines[0]!) as { target: string }
    first.target = 'C:/innocent.docx'
    lines[0] = JSON.stringify(first)
    writeFileSync(path, lines.join('\n'))
    const verdict = await AuditWriter.verify(dir)
    expect(verdict.ok).toBe(false)
    expect(verdict.line).toBe(1)
    expect(verdict.reason).toBe('hash')
  })

  it('detects a deleted middle line (chain break)', async () => {
    const dir = newDir()
    const writer = new AuditWriter({ auditDir: dir })
    await writer.append(evt())
    await writer.append(evt({ action: 'doc.save' }))
    await writer.append(evt({ action: 'doc.print', target: '3 pages' }))
    await writer.close()
    const path = join(dir, auditDayFile())
    const lines = readFileSync(path, 'utf8').split('\n').filter((l) => l.trim() !== '')
    writeFileSync(path, [lines[0], lines[2], ''].join('\n'))
    const verdict = await AuditWriter.verify(dir)
    expect(verdict.ok).toBe(false)
    expect(verdict.reason).toBe('hash')
  })

  it('reports a garbled tail as a parse break', async () => {
    const dir = newDir()
    const writer = new AuditWriter({ auditDir: dir })
    await writer.append(evt())
    await writer.close()
    const path = join(dir, auditDayFile())
    writeFileSync(path, readFileSync(path, 'utf8') + 'not-json\n')
    const verdict = await AuditWriter.verify(dir)
    expect(verdict.ok).toBe(false)
    expect(verdict.reason).toBe('parse')
  })
})
