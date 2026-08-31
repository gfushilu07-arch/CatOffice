/**
 * CatSpark cloud integration seam.
 *
 * Every CatOffice -> cloud endpoint lives here so the self-hosted CatSpark
 * backend can be swapped in by configuration alone.
 *
 * Mock mode is the default: with no real backend configured, cloudOrigin()
 * points at the embedded mock server (see ./mock) and CLI-backed features
 * return canned data, so the app runs end-to-end without any deployment.
 * Opting into a real backend is a config flip: set CATSPARK_API_BASE (at
 * minimum); CATSPARK_MOCK=0 restores the legacy default of talking to the
 * upstream Genspark service. Precedence for all origins: CATSPARK_* env >
 * legacy GSK_* env (kept for the upstream CLI bootstrap) > built-in default.
 *
 * Pure TS, no Electron dependency; safe from main processes and tests alike.
 * The ./mock subpath additionally serves the embedded backend (node:http).
 */

const stripTrailingSlash = (url: string): string => url.replace(/\/+$/, '')

function env(name: string): string | undefined {
  const value = process.env[name]
  return value && value.trim() ? value.trim() : undefined
}

/** Legacy default: the upstream Genspark service (CATSPARK_MOCK=0 restores it). */
export const DEFAULT_CLOUD_ORIGIN = 'https://www.genspark.ai'

/** Port of the embedded mock server; must be known synchronously (seams derive from it before listen). */
export const DEFAULT_MOCK_PORT = 45917

/** A real backend configured through env — either naming scheme. */
function explicitCloudBase(): string | undefined {
  return env('CATSPARK_API_BASE') ?? env('GSK_BASE_URL')
}

/**
 * Mock mode: serve every CatSpark endpoint from the embedded mock server
 * instead of a real deployment. On by default (the CatSpark backend does not
 * exist yet); forced on with CATSPARK_MOCK=1 (wins even over an explicit
 * API base), off with CATSPARK_MOCK=0 or any explicit base. Under vitest the
 * default is off so existing suites keep their upstream-origin semantics;
 * mock-behavior tests opt in with CATSPARK_MOCK=1.
 */
export function isMockMode(): boolean {
  const flag = env('CATSPARK_MOCK')
  if (process.env.VITEST && flag !== '1') return false
  if (flag === '1') return true
  if (flag === '0') return false
  return !explicitCloudBase()
}

/**
 * Origin of the embedded mock server. Deterministic before the server binds
 * so seam derivations stay synchronous; startMockCloud() binds this port and
 * reuses an already-listening instance from a sibling app process.
 */
export function mockCloudOrigin(): string {
  const port = env('CATSPARK_MOCK_PORT') ?? String(DEFAULT_MOCK_PORT)
  return `http://127.0.0.1:${port}`
}

/** Base URL of the cloud backend everything else derives from. */
export function cloudOrigin(): string {
  if (isMockMode()) return mockCloudOrigin()
  return stripTrailingSlash(explicitCloudBase() ?? DEFAULT_CLOUD_ORIGIN)
}

/** Origin + relative path (path may be empty). */
export function apiUrl(path = ''): string {
  return `${cloudOrigin()}${path.startsWith('/') ? path : `/${path}`}`
}

// ── LLM proxy (three protocols behind one login key) ────────────────

export type LlmProxyProtocol = 'anthropic' | 'gemini' | 'openai'

/**
 * Server-side LLM proxy endpoints per protocol. Model ids follow the
 * proxy's own naming scheme, which differs from the official vendor ids.
 */
export function llmProxyBase(protocol: LlmProxyProtocol): string {
  switch (protocol) {
    case 'anthropic':
      return env('CATSPARK_LLM_ANTHROPIC_BASE') ?? apiUrl('/api/anthropic')
    case 'gemini':
      return env('CATSPARK_LLM_GEMINI_BASE') ?? apiUrl('/api/llm_proxy/gemini/v1beta')
    case 'openai':
      return env('CATSPARK_LLM_OPENAI_BASE') ?? apiUrl('/api/llm_proxy/v1')
  }
}

/** True when the baseUrl is the built-in default cloud (upstream service). */
export function isDefaultCloudOrigin(baseUrl: string): boolean {
  return stripTrailingSlash(baseUrl) === DEFAULT_CLOUD_ORIGIN
}

/**
 * Splits this app's usage out of the proxy's default "Claw" billing bucket:
 * traffic attribution rides on X-Agent-Type. On the default origin keep the
 * upstream value ('genoffice') so existing billing attribution stays intact;
 * a CatSpark deployment names its own bucket via CATSPARK_AGENT_TYPE, and an
 * unset value means "no header" (the proxy decides billing).
 */
export function agentType(): string {
  if (!isDefaultCloudOrigin(cloudOrigin())) return env('CATSPARK_AGENT_TYPE') ?? ''
  return 'genoffice'
}

/**
 * Optional attribution headers for a given proxy base URL — only stamped when
 * the request actually targets our cloud proxy (default origin or the
 * configured CATSPARK_API_BASE), never to direct vendor APIs.
 */
export function attributionHeaders(baseUrl?: string): Record<string, string> {
  if (!baseUrl) return {}
  const type = agentType()
  if (!type) return {}
  // upstream semantics: any request routed through the proxy base (scheme +
  // host prefix match, e.g. .../api/anthropic) gets the header
  const origin = cloudOrigin()
  return baseUrl.startsWith(origin) && (baseUrl.length === origin.length || baseUrl[origin.length] === '/')
    ? { 'X-Agent-Type': type }
    : {}
}

// ── tool_cli / web resources ─────────────────────────────────────────

/** Structured tool-call endpoint (slide generation, image search tools…). */
export function toolCliBase(): string {
  return env('CATSPARK_TOOL_CLI_BASE') ?? apiUrl('/api/tool_cli')
}

/** Web page showing remaining credits for the signed-in account. */
export function creditUsageUrl(): string {
  return env('CATSPARK_CREDIT_USAGE_URL') ?? apiUrl('/credit-usage')
}

/** URL used to probe whether the system proxy can reach the cloud at all. */
export function proxyProbeUrl(): string {
  return `${cloudOrigin()}/`
}

/**
 * The fork's public repo (owner/repo, '' before it goes public — every
 * in-app GitHub CTA and the About-pane star widget hide when empty).
 */
export function githubRepo(): string {
  return env('CATSPARK_GITHUB_REPO') ?? 'cat-office/catoffice'
}

/** Web URL of the fork's repo ('' when disabled via githubRepo()). */
export function githubRepoUrl(): string {
  const repo = githubRepo()
  return repo ? `https://github.com/${repo}` : ''
}

/**
 * About-pane star count source on api.github.com ('' disables the widget —
 * e.g. before the fork's own repo goes public).
 */
export function githubStarsApiUrl(): string {
  const repo = githubRepo()
  return repo ? `https://api.github.com/repos/${repo}` : ''
}

/**
 * UA stamped on requests the app makes with plain Node fetch (bare undici
 * would present as "node"). Chromium-context requests already carry the app
 * name via Electron's default UA, so only main-process fetches need this.
 */
export function clientUserAgent(version?: string): string {
  return version ? `CatOffice/${version}` : 'CatOffice'
}

// ── asset-host classification (Referer / direct-link heuristics) ────

/** Referer sent when downloading assets served by our own cloud CDNs. */
export function cloudReferer(): string {
  return env('CATSPARK_WEB_REFERER') ?? `${cloudOrigin()}/`
}

/**
 * True when the hostname belongs to this deployment's cloud or the upstream
 * Genspark hosts (search results and generated files can live there even
 * after a partial migration). Extra custom CDN hosts via
 * CATSPARK_IMAGE_HOSTS="cdn.example.com,files.example.org".
 */
export function isCloudAssetHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  const extraHosts = (env('CATSPARK_IMAGE_HOSTS') ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
  const originHost = new URL(cloudOrigin()).hostname.toLowerCase()
  const legacySuffixes = ['genspark.ai']
  return (
    host === originHost ||
    host.endsWith(`.${originHost}`) ||
    legacySuffixes.some((suffix) => host === suffix || host.endsWith(`.${suffix}`)) ||
    extraHosts.some((extra) => host === extra || host.endsWith(`.${extra}`))
  )
}
