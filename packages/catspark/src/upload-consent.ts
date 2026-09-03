/**
 * Upload-consent state (等保 C2, compliance-plan.md §三): tiered, versioned,
 * revocable consent records persisted in app-settings.json.
 *
 * Tiers:
 *   t1 — AI conversation content upload (prompt/responses/attachments reach
 *        the cloud). Without it the online AI path is refused at the
 *        ai:stream gate; mock mode is never gated.
 *   t2 — crash/error log upload (sanitized).
 *   t3 — anonymous usage analytics (GA4; the capability only exists when
 *        build-time keys were injected).
 *
 * Air-gapped deployments set CATSPARK_TELEMETRY_DISABLED=1: the whole
 * consent surface disappears (no prompts, no uploads, online AI stays
 * available only when the deployment explicitly enables it).
 */

export interface ConsentGrant {
  /** privacy-policy version the user agreed to */
  version: number
  /** UTC timestamp of the grant */
  ts: string
}

export interface UploadConsent {
  t1?: ConsentGrant
  t2?: ConsentGrant
  t3?: ConsentGrant
}

export const PRIVACY_POLICY_VERSION = 1
export const CONSENT_KEY = 'uploadConsent'

export { isMockMode } from './index'

export type ConsentTier = keyof UploadConsent

export const CONSENT_TIERS: ConsentTier[] = ['t1', 't2', 't3']

/** parse + validate the persisted record (unknown shapes degrade to none) */
export function parseUploadConsent(raw: unknown): UploadConsent {
  if (!raw || typeof raw !== 'object') return {}
  const out: UploadConsent = {}
  const record = raw as Record<string, unknown>
  for (const tier of CONSENT_TIERS) {
    const grant = record[tier] as { version?: unknown; ts?: unknown } | undefined
    if (
      grant &&
      typeof grant.version === 'number' &&
      typeof grant.ts === 'string' &&
      Number.isFinite(grant.version)
    ) {
      out[tier] = { version: grant.version, ts: grant.ts }
    }
  }
  return out
}

/** true when the tier has a current-policy grant */
export function hasConsent(consent: UploadConsent, tier: ConsentTier): boolean {
  return consent[tier]?.version === PRIVACY_POLICY_VERSION
}

/** true when the grant exists but the policy version moved (re-prompt needed) */
export function needsRePrompt(consent: UploadConsent, tier: ConsentTier): boolean {
  const grant = consent[tier]
  return grant !== undefined && grant.version !== PRIVACY_POLICY_VERSION
}

/** build a fresh grant for now */
export function makeGrant(now = new Date()): ConsentGrant {
  return { version: PRIVACY_POLICY_VERSION, ts: now.toISOString() }
}

/** true when the deployment disables the whole telemetry surface */
export function telemetryDisabled(): boolean {
  return process.env.CATSPARK_TELEMETRY_DISABLED === '1'
}
