/**
 * Local security audit log (等保 C1): the shell main process owns the single
 * AuditWriter instance (single-writer by contract — renderers go through
 * IPC), seeds it from userData/audit/, and exposes read/verify to the
 * settings page.
 */
import { app } from 'electron'
import { join } from 'node:path'
import {
  AuditWriter,
  auditDayFile,
  type AuditAction,
  type AuditEvent,
} from '@catoffice/audit'

let writer: AuditWriter | null = null

export function auditDir(): string {
  return join(app.getPath('userData'), 'audit')
}

function getWriter(): AuditWriter {
  writer ??= new AuditWriter({ auditDir: auditDir() })
  return writer
}

/** fire-and-forget: an audit write must never block or fail the user action */
export function auditLog(
  action: AuditAction,
  target: string,
  detail?: Record<string, string | number | boolean>,
): void {
  const event: AuditEvent = {
    ts: new Date().toISOString(),
    actor: 'local',
    action,
    target,
    ...(detail ? { detail } : {}),
  }
  void getWriter().append(event).catch((err) => {
    console.error('[audit] append failed:', err)
  })
}

/** the audit log's own lifecycle events cannot go through itself */
export function auditAppStart(): void {
  auditLog('app.start', app.getVersion())
}

export async function auditAppQuit(): Promise<void> {
  auditLog('app.quit', app.getVersion())
  await writer?.close()
  writer = null
}

export async function auditRead(day?: string): Promise<{
  events: unknown[]
  verify: { ok: boolean; file: string; line?: number; reason?: string }
}> {
  return AuditWriter.read(auditDir(), day ?? auditDayFile())
}

export async function auditVerify(day?: string): Promise<{
  ok: boolean
  file: string
  line?: number
  reason?: string
}> {
  return AuditWriter.verify(auditDir(), day)
}

export function auditDay(): string {
  return auditDayFile()
}
