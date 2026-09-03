/**
 * Telemetry upload client (C2): consented audit-event batches and sanitized
 * error reports go to the CatSpark telemetry endpoints. Every failure
 * resolves false — upload is best-effort and must never surface as a user
 * facing error.
 */

/** Endpoint base, overridable for tests. */
export function telemetryBase(): string {
  const v = process.env.CATSPARK_TELEMETRY_BASE
  return v && v.trim() !== '' ? v.trim() : apiUrl('/api/telemetry')
}

import { apiUrl, attributionHeaders } from './index'

/** POST one batch of audit events; false on any failure. */
export async function uploadTelemetryEvents(events: unknown[]): Promise<boolean> {
  try {
    const res = await fetch(`${telemetryBase()}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...attributionHeaders(telemetryBase()) },
      body: JSON.stringify({ events }),
    })
    return res.ok
  } catch {
    return false
  }
}

/** POST one sanitized error report; false on any failure. */
export async function uploadTelemetryError(report: {
  message: string
  stack?: string
  appVersion?: string
  platform?: string
}): Promise<boolean> {
  try {
    const res = await fetch(`${telemetryBase()}/errors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...attributionHeaders(telemetryBase()) },
      body: JSON.stringify(report),
    })
    return res.ok
  } catch {
    return false
  }
}
