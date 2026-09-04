import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  AuditWriter,
  auditDayFile,
  serializeAuditLine,
  sm3,
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

// ── C4: SM3 (GB/T 32905-2016) ──────────────────────────────────────────────

describe('sm3 (compliance C4)', () => {
  it('matches the GB/T 32905-2016 standard vectors', () => {
    expect(sm3('abc')).toBe('66c7f0f462eeedd9d1f2d46bdc10e4e24167c4875cf2f7a2297da02b8f4ba8e0')
    expect(sm3('abcd'.repeat(16))).toBe(
      'debe9ff92275b8a138604889c18e5a4d6fdb70e5387e5765293dcba39c0c5732',
    )
  })

  it('cross-checks OpenSSL(3) reference values at block boundaries', () => {
    const b = (n: number) => new Uint8Array(Array.from({ length: n }, (_, i) => i))
    expect(sm3('')).toBe('1ab21d8355cfa17f8e61194831e81a8f22bec8c728fefb747ed035eb5082aa2b')
    expect(sm3(b(64))).toBe('93566f236d157aae078d1ddb5cebdbba1520b5142e22a8915564345ba2ae1d63')
    expect(sm3(new Uint8Array([...b(64), 0x78]))).toBe(
      'cc93cadf29730dd8464c54fd5f483660431e4d7ed7ac518147324bd71c611d48',
    )
    expect(sm3(new Uint8Array([...b(64), ...b(63)]))).toBe(
      '6d00a5cf3bd81f01ed61e0e54da8f94e9e0319745ccb5e5cb5836715f696a4ab',
    )
    expect(sm3('abcd'.repeat(128))).toBe(
      '5985bf39206b50e6701a2f04905762b9d5c2b1fbdd626b78962aaa944f7c1bc5',
    )
    expect(sm3(new TextEncoder().encode('政务审计日志·等保'))).toBe(
      '2f14d36193c01361ebe93758f5d20daba56794addcf2ad4437f35549d6a96856',
    )
  })

  it('sm3 mode chains and verifies (algo field self-describes each line)', async () => {
    const dir = newDir()
    const writer = new AuditWriter({ auditDir: dir, hashAlgo: 'sm3' })
    await writer.append(evt())
    await writer.append(evt({ action: 'doc.save' }))
    await writer.close()
    const { events } = await AuditWriter.read(dir, auditDayFile().replace(/\.jsonl$/, ''))
    expect(events[0]!.algo).toBe('sm3')
    expect(events[1]!.prev).toBe(events[0]!.hash)
    expect(events[1]!.hash).toHaveLength(64)
    expect((await AuditWriter.verify(dir)).ok).toBe(true)
    // a tampered sm3 line is still caught
    const path = join(dir, auditDayFile())
    const lines = readFileSync(path, 'utf8').split('\n')
    const first = JSON.parse(lines[0]!) as { target: string }
    first.target = 'C:/innocent.docx'
    lines[0] = JSON.stringify(first)
    writeFileSync(path, lines.join('\n'))
    const verdict = await AuditWriter.verify(dir)
    expect(verdict.ok).toBe(false)
    expect(verdict.reason).toBe('hash')
  })

  it('verify handles a mixed sha256/sm3 file (algo dispatches per line)', async () => {
    const dir = newDir()
    const first = serializeAuditLine(evt(), '')
    const second = serializeAuditLine(evt({ action: 'doc.save' }), first.hash, 'sm3')
    const third = serializeAuditLine(
      evt({ action: 'doc.print', target: '1 page' }),
      second.hash,
    )
    writeFileSync(
      join(dir, auditDayFile()),
      first.line + second.line + third.line,
    )
    expect((await AuditWriter.verify(dir)).ok).toBe(true)
  })

  it('default mode stays byte-stable (no algo field, sha256 chain)', () => {
    const out = serializeAuditLine(evt(), '')
    const parsed = JSON.parse(out.line) as { algo?: string }
    expect(parsed.algo).toBeUndefined()
    expect(out.hash).toHaveLength(64)
  })
})
