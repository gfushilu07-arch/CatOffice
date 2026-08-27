/**
 * CatSpark cloud integration seam.
 *
 * Every CatOffice -> cloud endpoint lives here so the self-hosted CatSpark
 * backend can be swapped in by configuration alone. Precedence for all
 * origins: CATSPARK_* env > legacy GSK_* env (kept for the upstream CLI
 * bootstrap) > built-in defaults. The defaults still point at the upstream
 * Genspark service so development keeps working; flip CATSPARK_API_BASE (at
 * minimum) once the CatSpark deployment exists — no code changes needed.
 *
 * Pure TS, no Electron dependency; safe from main processes and tests alike.
 */

const stripTrailingSlash = (url: string): string => url.replace(/\/+$/, '')

function env(name: string): string | undefined {
  const value = process.env[name]
  return value && value.trim() ? value.trim() : undefined
}

/** Base URL of the cloud backend everything else derives from. */
export function cloudOrigin(): string {
  return stripTrailingSlash(
    env('CATSPARK_API_BASE') ?? env('GSK_BASE_URL') ?? DEFAULT_CLOUD_ORIGIN,
  )
}

export const DEFAULT_CLOUD_ORIGIN = 'https://www.genspark.ai'

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
 * About-pane star count source on api.github.com ('' disables the widget —
 * e.g. before the fork's own repo goes public).
 */
export function githubStarsApiUrl(): string {
  const repo = env('CATSPARK_GITHUB_REPO') ?? 'cat-office/catoffice'
  return repo ? `https://api.github.com/repos/${repo}` : ''
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
