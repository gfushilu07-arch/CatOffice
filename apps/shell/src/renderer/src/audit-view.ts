/**
 * Settings-page audit log loader (C1): thin wrappers over the shell
 * preload's audit read/verify surface.
 */

interface AuditLineLike {
  ts: string
  action: string
  target: string
}

interface AuditBridge {
  auditRead?: (day?: string) => Promise<{
    events: AuditLineLike[]
    verify: { ok: boolean }
  }>
  auditVerify?: (day?: string) => Promise<{ ok: boolean }>
}

const bridge = (): AuditBridge => (window as unknown as { auditView?: AuditBridge }).auditView ?? {}

function todayStem(): string {
  return new Date().toISOString().slice(0, 10)
}

/** today's events + verdict; null when the audit surface is absent (tests) */
export async function fetchTodayAudit(): Promise<{
  day: string
  events: AuditLineLike[]
  ok: boolean
} | null> {
  const api = bridge().auditRead
  if (!api) return null
  const { events, verify } = await api(todayStem())
  return { day: todayStem(), events, ok: verify.ok }
}

/** verify the hash chain; null when the audit surface is absent (tests) */
export async function verifyTodayAudit(): Promise<boolean | null> {
  const api = bridge().auditVerify
  if (!api) return null
  return (await api(todayStem())).ok
}
