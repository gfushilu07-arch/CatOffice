/**
 * Audit chain hash algorithm selection (compliance C4): CATOFFICE_AUDIT_HASH=sm3
 * switches the deployment to SM3 for lines written after a restart; anything
 * else stays on the sha256 default. The SM3 implementation itself and the
 * chain-mode behavior are covered by packages/audit/tests/audit.test.ts; this
 * locks the deployment knob. (audit-log.ts is imported for the env contract —
 * it loads `electron` at module scope, which vitest resolves to the mock below.)
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => '/tmp/audit-hash-test' } }))

const { auditHashAlgo } = await import('../src/main/audit-log')

describe('audit hash algo selection', () => {
  it('defaults to sha256', () => {
    delete process.env.CATOFFICE_AUDIT_HASH
    expect(auditHashAlgo()).toBe('sha256')
  })

  it('selects sm3 for CATOFFICE_AUDIT_HASH=sm3', () => {
    process.env.CATOFFICE_AUDIT_HASH = 'sm3'
    expect(auditHashAlgo()).toBe('sm3')
    delete process.env.CATOFFICE_AUDIT_HASH
  })

  it('unknown values stay on sha256', () => {
    process.env.CATOFFICE_AUDIT_HASH = 'md5'
    expect(auditHashAlgo()).toBe('sha256')
    process.env.CATOFFICE_AUDIT_HASH = 'SM3'
    expect(auditHashAlgo()).toBe('sha256') // case-sensitive by design
    delete process.env.CATOFFICE_AUDIT_HASH
  })
})
