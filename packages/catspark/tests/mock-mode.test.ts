import { afterEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_CLOUD_ORIGIN,
  DEFAULT_MOCK_PORT,
  cloudOrigin,
  isMockMode,
  mockCloudOrigin,
} from '@catoffice/catspark'

/**
 * Mode-resolution semantics. Under vitest the default is OFF (so legacy suites
 * keep their upstream-origin expectations); every case here controls the env
 * explicitly.
 */
describe('mock mode resolution', () => {
  const KEYS = ['CATSPARK_MOCK', 'CATSPARK_MOCK_PORT', 'CATSPARK_API_BASE', 'GSK_BASE_URL', 'VITEST']
  const saved = new Map<string, string | undefined>()

  afterEach(() => {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    saved.clear()
  })

  function setEnv(entries: Record<string, string | undefined>): void {
    if (saved.size === 0) for (const key of KEYS) saved.set(key, process.env[key])
    for (const [key, value] of Object.entries(entries)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }

  it('defaults to mock outside vitest when no backend is configured', () => {
    setEnv({ VITEST: undefined, CATSPARK_MOCK: undefined, CATSPARK_API_BASE: undefined, GSK_BASE_URL: undefined })
    expect(isMockMode()).toBe(true)
    expect(cloudOrigin()).toBe(mockCloudOrigin())
    expect(mockCloudOrigin()).toBe(`http://127.0.0.1:${DEFAULT_MOCK_PORT}`)
  })

  it('stays off under vitest unless CATSPARK_MOCK=1', () => {
    setEnv({ VITEST: '1', CATSPARK_MOCK: undefined, CATSPARK_API_BASE: undefined })
    expect(isMockMode()).toBe(false)
    expect(cloudOrigin()).toBe(DEFAULT_CLOUD_ORIGIN)
  })

  it('an explicit API base opts out of mock', () => {
    setEnv({ VITEST: undefined, CATSPARK_MOCK: undefined, CATSPARK_API_BASE: 'https://spark.example.com/' })
    expect(isMockMode()).toBe(false)
    expect(cloudOrigin()).toBe('https://spark.example.com')
  })

  it('the legacy GSK_BASE_URL also opts out, after CATSPARK_API_BASE', () => {
    setEnv({
      VITEST: undefined,
      CATSPARK_MOCK: undefined,
      CATSPARK_API_BASE: undefined,
      GSK_BASE_URL: 'https://legacy.example.com',
    })
    expect(isMockMode()).toBe(false)
    expect(cloudOrigin()).toBe('https://legacy.example.com')
    setEnv({ CATSPARK_API_BASE: 'https://new.example.com' })
    expect(cloudOrigin()).toBe('https://new.example.com')
  })

  it('CATSPARK_MOCK=0 restores the legacy upstream default', () => {
    setEnv({ VITEST: undefined, CATSPARK_MOCK: '0', CATSPARK_API_BASE: undefined, GSK_BASE_URL: undefined })
    expect(isMockMode()).toBe(false)
    expect(cloudOrigin()).toBe(DEFAULT_CLOUD_ORIGIN)
  })

  it('CATSPARK_MOCK=1 forces mock even when a real base is configured', () => {
    setEnv({ VITEST: '1', CATSPARK_MOCK: '1', CATSPARK_API_BASE: 'https://spark.example.com' })
    expect(isMockMode()).toBe(true)
    expect(cloudOrigin()).toBe(mockCloudOrigin())
  })

  it('CATSPARK_MOCK_PORT moves the mock origin', () => {
    setEnv({ VITEST: '1', CATSPARK_MOCK: '1', CATSPARK_MOCK_PORT: '45999' })
    expect(mockCloudOrigin()).toBe('http://127.0.0.1:45999')
  })
})
