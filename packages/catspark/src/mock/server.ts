/**
 * Embedded CatSpark mock server: an in-process Node HTTP server that speaks
 * the client side of the CatSpark contract (docs/catoffice/catspark-integration.md)
 * so the app runs end-to-end without a real deployment. Zero npm dependencies
 * — node:http / node:crypto / node:zlib only.
 *
 * Served surface:
 * - device-code login (auto-approving) + api tokens  → mock key lands in ~/.genoffice/auth.json
 * - LLM proxy, all three protocols                   → canned JSON replies (every ai-provider
 *   protocol accepts a complete JSON body instead of SSE, see jsonBodyInsteadOfSse)
 * - tool_cli (slide_generate, file/download)         → NDJSON, deck served from a checked-in fixture
 * - mock images, credit-usage page, health probe
 *
 * CLI-backed features (search, image generation, cloud projects…) are mocked
 * at the JS layer in @genoffice/ai-search and never reach this server; the
 * bundled upstream CLI never runs in mock mode.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import { isMockMode, DEFAULT_MOCK_PORT } from '../index'
import { gradientPng } from './png'
import { mockDeckPptx } from './deck-fixture'

const MOCK_HEALTH_PATH = '/mock/health'

/** Matches on every response so sibling app processes can identify and reuse the server. */
const MOCK_HEALTH_BODY = JSON.stringify({ service: 'catspark-mock', ok: true })

// ── login flow state (per-process; a mock login is worthless across restarts) ──

const approvals = new Map<string, 'pending' | 'approved'>()

// ── tiny helpers ─────────────────────────────────────────────────────

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(text)
}

function sendHtml(res: ServerResponse, title: string, bodyHtml: string): void {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(
    `<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>${title}</title>` +
      `<style>body{font-family:system-ui,sans-serif;max-width:34rem;margin:12vh auto;padding:0 1rem;line-height:1.6;color:#222}` +
      `code{background:#f4f4f4;padding:.1em .35em;border-radius:4px}</style></head>` +
      `<body>${bodyHtml}</body></html>`,
  )
}

async function readBody(req: IncomingMessage, limitBytes = 64 * 1024 * 1024): Promise<Buffer> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    total += chunk.length
    if (total > limitBytes) throw new Error('mock request body too large')
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks)
}

function parseJsonBody(body: Buffer): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(body.toString('utf8'))
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** First non-empty text of the final user message, across all three protocol shapes. */
function lastUserText(parsed: Record<string, unknown>, container: 'messages' | 'contents'): string {
  const list = Array.isArray(parsed[container]) ? (parsed[container] as unknown[]) : []
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i] as Record<string, unknown>
    if (String(m?.role ?? '') !== 'user') continue
    const content: unknown = m.content
    if (typeof content === 'string' && content.trim()) return content
    const parts = Array.isArray(content)
      ? content
      : Array.isArray(m.parts)
        ? m.parts
        : []
    for (const part of parts.reverse()) {
      const text = (part as Record<string, unknown>)?.text
      if (typeof text === 'string' && text.trim()) return text
    }
  }
  return ''
}

function clipped(text: string, max: number): string {
  const single = text.replace(/\s+/g, ' ').trim()
  return single.length > max ? `${single.slice(0, max)}…` : single
}

/** The one canned reply every mock model sends, labeled so it can't be mistaken for a real one. */
function mockReply(model: string, prompt: string, messageCount: number): string {
  return (
    '[CatSpark mock] 已收到请求（mock 模式）。\n\n' +
    `模型：${model || '(未指定)'}；消息数：${messageCount}；` +
    (prompt ? `最后一条用户消息：${clipped(prompt, 120)}` : '（无用户消息文本）') +
    '\n\n这是演示回复。设置 CATSPARK_API_BASE 指向真实 CatSpark 后端后，此处将返回真实模型输出。'
  )
}

// ── route handlers ───────────────────────────────────────────────────

function handleDeviceCode(res: ServerResponse, origin: string): void {
  const code = `mock-${randomUUID()}`
  approvals.set(code, 'pending')
  sendJson(res, 200, {
    device_code: code,
    // the "authorization page" approves instantly — mock login needs no human
    auth_url: `${origin}/mock/approve?code=${encodeURIComponent(code)}`,
    expires_in: 600,
    poll_interval: 1,
  })
}

function handleApprove(req: IncomingMessage, res: ServerResponse, url: URL, origin: string): void {
  const code = url.searchParams.get('code') ?? ''
  if (!code || !approvals.has(code)) {
    sendHtml(res, 'CatSpark mock', '<h1>CatSpark mock</h1><p>登录码无效或已过期。</p>')
    return
  }
  approvals.set(code, 'approved')
  console.log(`[catspark-mock] device login approved: ${code} (from ${req.socket.remoteAddress})`)
  sendHtml(
    res,
    'CatSpark mock 登录',
    '<h1>✅ 已批准登录（CatSpark mock）</h1><p>桌面端将在下一次轮询后完成登录，本页可以关闭。</p>' +
      `<p><code>${origin}</code> 是本机内嵌的 mock 服务器，未发生任何真实网络请求。</p>`,
  )
}

function handleToken(res: ServerResponse, url: URL): void {
  const code = url.searchParams.get('code') ?? ''
  const state = approvals.get(code)
  if (!state) {
    sendJson(res, 200, { status: 'expired' })
    return
  }
  if (state === 'pending') {
    sendJson(res, 200, { status: 'pending' })
    return
  }
  approvals.delete(code)
  sendJson(res, 200, { status: 'approved', access_token: `mock-access-${randomUUID()}` })
}

function handleSession(res: ServerResponse, req: IncomingMessage): void {
  // lenient by design: a mock does not authenticate, it just plays the shape
  if (!req.headers.authorization) {
    sendJson(res, 401, { message: 'mock: Authorization header required' })
    return
  }
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Set-Cookie': `mock_session=${randomUUID()}; Path=/; HttpOnly`,
  })
  res.end(JSON.stringify({ ok: true }))
}

function handleTokenCreate(res: ServerResponse, req: IncomingMessage): void {
  if (!req.headers.cookie?.includes('mock_session=')) {
    sendJson(res, 401, { message: 'mock: session cookie required' })
    return
  }
  sendJson(res, 200, {
    data: { token: `gsk-mock-${randomUUID()}`, key_id: `mock-key-${randomUUID()}` },
    message: 'ok',
  })
}

function handleAnthropic(res: ServerResponse, body: Buffer): void {
  const parsed = parseJsonBody(body)
  const model = String(parsed.model ?? '')
  const messages = Array.isArray(parsed.messages) ? (parsed.messages as unknown[]).length : 0
  sendJson(res, 200, {
    id: `msg_mock-${randomUUID()}`,
    type: 'message',
    role: 'assistant',
    model,
    content: [{ type: 'text', text: mockReply(model, lastUserText(parsed, 'messages'), messages) }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 1, output_tokens: 1 },
  })
}

function handleOpenAi(res: ServerResponse, body: Buffer): void {
  const parsed = parseJsonBody(body)
  const model = String(parsed.model ?? '')
  const messages = Array.isArray(parsed.messages) ? (parsed.messages as unknown[]).length : 0
  sendJson(res, 200, {
    id: `chatcmpl_mock-${randomUUID()}`,
    object: 'chat.completion',
    model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: mockReply(model, lastUserText(parsed, 'messages'), messages),
        },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  })
}

function handleGemini(res: ServerResponse, path: string, body: Buffer): void {
  // path: /api/llm_proxy/gemini/v1beta/models/{model}:streamGenerateContent|generateContent
  const model = decodeURIComponent(path.split('/models/')[1] ?? '').split(':')[0] ?? ''
  const parsed = parseJsonBody(body)
  const contents = Array.isArray(parsed.contents) ? (parsed.contents as unknown[]).length : 0
  sendJson(res, 200, [
    {
      candidates: [
        {
          content: {
            role: 'model',
            parts: [{ text: mockReply(model, lastUserText(parsed, 'contents'), contents) }],
          },
          finishReason: 'STOP',
        },
      ],
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
    },
  ])
}

function ndjson(res: ServerResponse, lines: unknown[]): void {
  res.writeHead(200, { 'Content-Type': 'application/x-ndjson' })
  for (const line of lines) res.write(`${JSON.stringify(line)}\n`)
  res.end()
}

function handleSlideGenerate(res: ServerResponse, origin: string, body: Buffer): void {
  const parsed = parseJsonBody(body)
  // heartbeats first, result last — parseToolCliNdjson takes the last status line
  ndjson(res, [
    { heartbeat: 1 },
    {
      status: 'ok',
      data: {
        pptx_url: `${origin}/api/files/mock-deck.pptx`,
        model: 'mock-slides-1',
        brief: clipped(String(parsed.brief ?? ''), 80),
      },
    },
  ])
}

function handleFileDownload(res: ServerResponse, origin: string, body: Buffer): void {
  const parsed = parseJsonBody(body)
  const wrapper = String(parsed.file_wrapper_url ?? '')
  // every mock file wrapper resolves to the one deck fixture
  ndjson(res, [
    {
      status: 'ok',
      data: { download_url: `${origin}/api/files/mock-deck.pptx?from=${encodeURIComponent(wrapper)}` },
    },
  ])
}

/**
 * Asset-center mock (A2): the template gallery. The five govt kinds mirror
 * the local catalog (proving the cloud-local merge dedupes by id); the joint-
 * issue and landscape-banner variants are cloud-exclusive extras exercising
 * the tiering story.
 */
function handleAssetTemplates(res: ServerResponse, url: URL): void {
  const category = url.searchParams.get('category')
  const q = url.searchParams.get('q')?.trim().toLowerCase() ?? ''
  const entries = ASSET_TEMPLATES.filter((t) => {
    if (category && t.category !== category) return false
    if (q && !`${t.label} ${t.description}`.toLowerCase().includes(q)) return false
    return true
  })
  sendJson(res, 200, { templates: entries })
}

const ASSET_TEMPLATES = [
      {
        id: 'notice',
        label: '通知',
        description: '传达事项、布置工作（印发/转发/事项通知）',
        fileName: '通知',
        category: 'govt',
        downloads: 12890,
        preset: { kind: 'govt', options: { title: '关于××的通知' } },
      },
      {
        id: 'request',
        label: '请示',
        description: '向上级机关请求指示、批准',
        fileName: '请示',
        category: 'govt',
        downloads: 7341,
        preset: { kind: 'govt', options: { title: '关于××的请示' } },
      },
      {
        id: 'report',
        label: '报告',
        description: '向上级机关汇报工作、反映情况',
        fileName: '报告',
        category: 'govt',
        downloads: 6102,
        preset: { kind: 'govt', options: { title: '关于××的报告' } },
      },
      {
        id: 'letter',
        label: '函',
        description: '不相隶属机关之间商洽工作、询问和答复',
        fileName: '函',
        category: 'govt',
        downloads: 4577,
        preset: { kind: 'govt', options: { title: '关于××的函' } },
      },
      {
        id: 'minutes',
        label: '纪要',
        description: '记载会议主要情况和议定事项',
        fileName: '纪要',
        category: 'govt',
        downloads: 3891,
        preset: { kind: 'govt', options: { title: '××会议纪要' } },
      },
      {
        id: 'govt-joint',
        label: '联合发文（云）',
        description: '多机关联合行文：双落款版式',
        fileName: '联合发文',
        category: 'govt',
        downloads: 942,
        preset: { kind: 'govt', options: { title: '关于××的联合通知' } },
      },
      {
        id: 'govt-horizontal',
        label: '横版红头（云）',
        description: '横版 A4 红头信纸样式',
        fileName: '横版红头',
        category: 'govt',
        downloads: 613,
        preset: { kind: 'govt', options: { title: '××文件' } },
      },
]

/**
 * Cloud OCR mock: body is the raw page PNG, response is an OcrRecognition
 * JSON (lines with normalized 0-1 boxes, origin bottom-left). The canned
 * lines stand in for real recognition so the pre-recognize → supply → gates
 * path is testable end to end against the embedded server.
 */
function handleOcrRecognize(res: ServerResponse, body: Buffer): void {
  const looksLikePng = body.length > 8 && body[0] === 0x89 && body[1] === 0x50
  if (!looksLikePng) return void sendJson(res, 400, { message: 'mock: expected a PNG body' })
  sendJson(res, 200, {
    lines: [
      { text: '扫描件文字识别测试', confidence: 0.92, box: { x0: 0.1, y0: 0.85, x1: 0.55, y1: 0.88 } },
      {
        text: 'Recognized by the CatSpark mock OCR',
        confidence: 0.94,
        box: { x0: 0.1, y0: 0.8, x1: 0.6, y1: 0.82 },
      },
    ],
    paperShare: 0.95,
  })
}

/** Matched against /mock-image/{1..3}.png; keep in sync with data.ts MOCK_IMAGES. */
function handleMockImage(res: ServerResponse, path: string): boolean {
  const m = /^\/mock-image\/([123])\.png$/.exec(path)
  if (!m) return false
  const palettes = [
    [{ r: 66, g: 133, b: 244 }, { r: 30, g: 60, b: 114 }],
    [{ r: 52, g: 168, b: 83 }, { r: 20, g: 68, b: 34 }],
    [{ r: 251, g: 188, b: 5 }, { r: 122, g: 92, b: 0 }],
  ] as const
  const [top, bottom] = palettes[Number(m[1]) - 1]!
  const dims = [
    { width: 800, height: 600 },
    { width: 1280, height: 720 },
    { width: 640, height: 640 },
  ][Number(m[1]) - 1]!
  res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' })
  res.end(Buffer.from(gradientPng(dims.width, dims.height, top, bottom)))
  return true
}

function handleFiles(res: ServerResponse, path: string): boolean {
  if (!path.startsWith('/api/files/')) return false
  if (path.startsWith('/api/files/mock-deck.pptx')) {
    res.writeHead(200, {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    })
    res.end(Buffer.from(mockDeckPptx()))
    return true
  }
  sendJson(res, 404, { message: 'mock: no such file' })
  return true
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://mock.local')
  // derive from the Host header so the served URLs match whatever address the
  // client dialed (fixed port in the app, ephemeral in tests)
  const origin = `http://${req.headers.host ?? '127.0.0.1'}`
  const path = url.pathname
  const body = ['POST', 'PUT'].includes(req.method ?? '') ? await readBody(req) : Buffer.alloc(0)

  if (path === MOCK_HEALTH_PATH) return void sendJson(res, 200, JSON.parse(MOCK_HEALTH_BODY))
  if (path === '/') {
    return void sendJson(res, 200, {
      service: 'catspark-mock',
      hint: 'embedded CatSpark mock server; set CATSPARK_API_BASE to use a real backend',
    })
  }
  if (path === '/mock/approve') return void handleApprove(req, res, url, origin)

  // device-code login (contract section 1)
  if (path === '/api/office_addin_auth/device_code' && req.method === 'POST')
    return void handleDeviceCode(res, origin)
  if (path === '/api/office_addin_auth/token') return void handleToken(res, url)
  if (path === '/api/office_addin_auth/session' && req.method === 'POST')
    return void handleSession(res, req)
  if (path === '/api/api_tokens/create' && req.method === 'POST')
    return void handleTokenCreate(res, req)
  if (path === '/api/api_tokens/revoke' && req.method === 'POST')
    return void sendJson(res, 200, { message: 'ok' })

  // LLM proxy (contract section 2) — complete JSON replies, no SSE needed
  if (path === '/api/anthropic/v1/messages' && req.method === 'POST')
    return void handleAnthropic(res, body)
  if (path === '/api/llm_proxy/v1/chat/completions' && req.method === 'POST')
    return void handleOpenAi(res, body)
  if (path.startsWith('/api/llm_proxy/gemini/v1beta/models/') && req.method === 'POST')
    return void handleGemini(res, path, body)

  // cloud OCR (L3): raw PNG in, an OcrRecognition-shaped JSON out. The mock
  // answer is a canned scanned-page text so the whole pre-recognize path is
  // exercisable without a real backend.
  if (path === '/api/ocr/recognize' && req.method === 'POST')
    return void handleOcrRecognize(res, body)

  // asset center (A2/A3): the template gallery listing. Entries are metadata +
  // a govt generation preset — the renderer applies presets locally, so
  // there is no binary download leg. `category` filters, `q` searches
  // label+description (the real backend serves the same query contract).
  if (path === '/api/asset_center/templates' && req.method === 'GET')
    return void handleAssetTemplates(res, url)

  // tool_cli (contract section 3)
  if (path === '/api/tool_cli/slide_generate' && req.method === 'POST')
    return void handleSlideGenerate(res, origin, body)
  if (path === '/api/tool_cli/file/download' && req.method === 'POST')
    return void handleFileDownload(res, origin, body)
  if (path.startsWith('/api/tool_cli/')) {
    return void ndjson(res, [
      { status: 'error', message: `mock: tool not implemented (${path})` },
    ])
  }

  // assets
  if (handleMockImage(res, path)) return
  if (handleFiles(res, path)) return

  if (path === '/credit-usage') {
    return void sendHtml(
      res,
      'CatSpark mock 用量',
      '<h1>CatSpark mock</h1><p>积分余额：∞（mock 模式不计量）。接入真实后端后，本页展示真实用量。</p>',
    )
  }

  sendJson(res, 404, { message: `mock: no route for ${req.method} ${path}` })
}

// ── lifecycle ────────────────────────────────────────────────────────

export interface MockCloudHandle {
  origin: string
  /** true when another app process already serves this port and was reused */
  reused: boolean
  stop(): Promise<void>
}

let running: Promise<MockCloudHandle | null> | null = null

/**
 * Binds the embedded mock server when mock mode is on; no-op otherwise (so
 * main entries can call it unconditionally at startup). Concurrent/repeat
 * calls share one server. When the port is taken by a sibling CatOffice
 * process, the existing server is probed and reused.
 */
export function startMockCloud(options: { port?: number } = {}): Promise<MockCloudHandle | null> {
  running ??= startInner(options).catch((e: unknown) => {
    console.error('[catspark-mock] failed to start:', e)
    running = null
    return null
  })
  return running
}

async function startInner(options: { port?: number }): Promise<MockCloudHandle | null> {
  if (!isMockMode()) return null
  const port = options.port ?? Number(process.env.CATSPARK_MOCK_PORT ?? DEFAULT_MOCK_PORT)
  const server: Server = createServer((req, res) => {
    handle(req, res).catch((e: unknown) => {
      console.error('[catspark-mock] handler error:', e)
      if (!res.headersSent) sendJson(res, 500, { message: 'mock: internal error' })
      res.end()
    })
  })
  // never let a hung mock request outlive its client
  server.requestTimeout = 10 * 60_000
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, '127.0.0.1', resolve)
    })
  } catch (e) {
    const code = (e as { code?: unknown })?.code
    if (code !== 'EADDRINUSE') throw e
    // another CatOffice process got here first: reuse it when it is ours
    const existing = await probeMockServer(port)
    if (!existing) {
      console.error(
        `[catspark-mock] port ${port} is taken by another program; mock cloud requests will fail ` +
          `(set CATSPARK_MOCK_PORT to a free port)`,
      )
      server.close()
      return null
    }
    console.log(`[catspark-mock] reusing mock server from a sibling process on ${existing}`)
    return { origin: existing, reused: true, stop: async () => {} }
  }
  const address = server.address()
  if (address === null || typeof address === 'string') {
    server.close()
    throw new Error('mock server: unexpected listen address')
  }
  const origin = `http://127.0.0.1:${address.port}`
  console.log(`[catspark-mock] serving mock CatSpark on ${origin}`)
  return {
    origin,
    reused: false,
    stop: () =>
      new Promise<void>((resolve) => {
        running = null
        server.close(() => resolve())
      }),
  }
}

/** GET /mock/health; returns the origin string when the responder is our mock, else null. */
async function probeMockServer(port: number, attempts = 6): Promise<string | null> {
  const origin = `http://127.0.0.1:${port}`
  for (let i = 0; i < attempts; i++) {
    try {
      const resp = await fetch(`${origin}${MOCK_HEALTH_PATH}`, { signal: AbortSignal.timeout(2000) })
      if (resp.ok) {
        const body = (await resp.json()) as { service?: unknown }
        if (body.service === 'catspark-mock') return origin
        return null
      }
    } catch {
      // the sibling's listen may not be visible yet; retry shortly
      await new Promise((r) => setTimeout(r, 150))
    }
  }
  return null
}
