import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startMockCloud, type MockCloudHandle } from '@catoffice/catspark/mock'
import { isMockMode } from '@catoffice/catspark'

// vitest keeps mock mode off by default; this suite is about mock behavior
process.env.CATSPARK_MOCK = '1'

let mock: MockCloudHandle

beforeAll(async () => {
  const handle = await startMockCloud({ port: 0 })
  if (!handle) throw new Error('mock server did not start (is mock mode on?)')
  mock = handle
})

afterAll(async () => {
  await mock?.stop()
})

interface NdjsonLine {
  status?: string
  message?: string
  data?: Record<string, unknown>
  [key: string]: unknown
}

/** tool_cli responses are NDJSON; the LAST line carrying a status field is the result. */
function parseNdjson(text: string): NdjsonLine {
  const lines = text.trim().split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!.trim()
    if (!line.startsWith('{')) continue
    const obj = JSON.parse(line) as NdjsonLine
    if ('status' in obj) return obj
  }
  throw new Error(`no status line in NDJSON: ${text.slice(0, 200)}`)
}

const post = (path: string, body?: unknown, headers: Record<string, string> = {}) =>
  fetch(`${mock.origin}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

describe('mock server surface', () => {
  it('answers health and root probes', async () => {
    const health = await fetch(`${mock.origin}/mock/health`)
    expect(health.status).toBe(200)
    expect(await health.json()).toMatchObject({ service: 'catspark-mock', ok: true })

    const root = await fetch(`${mock.origin}/`)
    expect((await root.json()).service).toBe('catspark-mock')
  })

  it('serves the credit-usage page', async () => {
    const resp = await fetch(`${mock.origin}/credit-usage`)
    expect(resp.status).toBe(200)
    expect(resp.headers.get('content-type')).toContain('text/html')
  })

  it('runs the device-code login flow to a minted api key', async () => {
    const start = await post('/api/office_addin_auth/device_code?app_type=genoffice')
    const startBody = (await start.json()) as {
      device_code: string
      auth_url: string
      poll_interval: number
    }
    expect(startBody.device_code).toMatch(/^mock-/)
    expect(startBody.auth_url).toBe(
      `${mock.origin}/mock/approve?code=${encodeURIComponent(startBody.device_code)}`,
    )

    // opening the auth URL approves instantly (mock login needs no human)
    const approve = await fetch(startBody.auth_url)
    expect(approve.status).toBe(200)
    expect(await approve.text()).toContain('已批准登录')

    const token = await fetch(
      `${mock.origin}/api/office_addin_auth/token?code=${encodeURIComponent(startBody.device_code)}`,
    )
    const tokenBody = (await token.json()) as { status: string; access_token?: string }
    expect(tokenBody.status).toBe('approved')
    expect(tokenBody.access_token).toMatch(/^mock-access-/)

    const session = await fetch(`${mock.origin}/api/office_addin_auth/session`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenBody.access_token}` },
    })
    expect(session.status).toBe(200)
    const cookie = session.headers.get('set-cookie') ?? ''
    expect(cookie).toContain('mock_session=')

    const create = await post('/api/api_tokens/create', { key_name: 'genoffice' }, { Cookie: cookie })
    const createBody = (await create.json()) as { data: { token: string; key_id: string } }
    expect(createBody.data.token).toMatch(/^gsk-mock-/)

    // without the session cookie the mint is refused, like the real gateway
    const anon = await post('/api/api_tokens/create', { key_name: 'genoffice' })
    expect(anon.status).toBe(401)

    const revoke = await post('/api/api_tokens/revoke', { key_id: createBody.data.key_id })
    expect(revoke.status).toBe(200)
  })

  it('answers the anthropic protocol with a complete JSON message', async () => {
    const resp = await post('/api/anthropic/v1/messages', {
      model: 'claude-opus-4-8',
      max_tokens: 100,
      messages: [{ role: 'user', content: '你好，mock' }],
    })
    expect(resp.status).toBe(200)
    expect(resp.headers.get('content-type')).toContain('application/json')
    const body = (await resp.json()) as {
      content: Array<{ type: string; text: string }>
      stop_reason: string
    }
    expect(body.stop_reason).toBe('end_turn')
    expect(body.content[0]!.text).toContain('CatSpark mock')
    expect(body.content[0]!.text).toContain('你好，mock')
  })

  it('answers the openai-compatible protocol', async () => {
    const resp = await post('/api/llm_proxy/v1/chat/completions', {
      model: 'gpt-5.6',
      messages: [{ role: 'user', content: 'hello mock' }],
    })
    const body = (await resp.json()) as { choices: Array<{ message: { content: string } }> }
    expect(body.choices[0]!.message.content).toContain('CatSpark mock')
  })

  it('answers the gemini protocol with a chunk array', async () => {
    const resp = await post(
      '/api/llm_proxy/gemini/v1beta/models/gemini-3.7-flash:streamGenerateContent?alt=sse',
      { contents: [{ role: 'user', parts: [{ text: 'gemini mock' }] }] },
    )
    const body = (await resp.json()) as Array<{
      candidates: Array<{ content: { parts: Array<{ text: string }> }; finishReason: string }>
    }>
    expect(Array.isArray(body)).toBe(true)
    expect(body[0]!.candidates[0]!.finishReason).toBe('STOP')
    expect(body[0]!.candidates[0]!.content.parts[0]!.text).toContain('gemini mock')
  })

  it('serves slide_generate end-to-end: NDJSON result, signed download, valid pptx bytes', async () => {
    const gen = parseNdjson(
      await (
        await post('/api/tool_cli/slide_generate', { brief: '一页 mock 幻灯片', width: 1280, height: 720 })
      ).text(),
    )
    expect(gen.status).toBe('ok')
    const pptxUrl = gen.data!.pptx_url as string
    expect(pptxUrl).toBe(`${mock.origin}/api/files/mock-deck.pptx`)

    const dl = parseNdjson(
      await (
        await post('/api/tool_cli/file/download', { file_wrapper_url: pptxUrl })
      ).text(),
    )
    expect(dl.status).toBe('ok')
    const downloadUrl = dl.data!.download_url as string
    expect(downloadUrl.startsWith(mock.origin)).toBe(true)

    const bytes = new Uint8Array(await (await fetch(downloadUrl)).arrayBuffer())
    // ZIP local-file-header magic — every pptx starts with it
    expect(bytes[0]).toBe(0x50)
    expect(bytes[1]).toBe(0x4b)
    expect(bytes.length).toBeGreaterThan(1000)
  })

  it('rejects unimplemented tools with an error result line', async () => {
    const resp = await post('/api/tool_cli/some_other_tool', {})
    const result = parseNdjson(await resp.text())
    expect(result.status).toBe('error')
  })

  it('serves mock images as real PNGs with the advertised dimensions', async () => {
    const resp = await fetch(`${mock.origin}/mock-image/2.png`)
    expect(resp.headers.get('content-type')).toBe('image/png')
    const bytes = Buffer.from(await resp.arrayBuffer())
    expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(bytes.readUInt32BE(16)).toBe(1280) // IHDR width
    expect(bytes.readUInt32BE(20)).toBe(720) // IHDR height
  })

  it('recognizes a PNG body on /api/ocr/recognize and rejects non-PNG', async () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    )
    const resp = await fetch(`${mock.origin}/api/ocr/recognize`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/png' },
      body: png,
    })
    expect(resp.status).toBe(200)
    const recognition = (await resp.json()) as {
      lines: Array<{ text: string; confidence: number; box: Record<string, number> }>
      paperShare?: number
    }
    expect(recognition.lines.length).toBeGreaterThan(0)
    expect(recognition.lines[0]!.confidence).toBeGreaterThan(0.55)
    expect(recognition.paperShare).toBeGreaterThan(0.45)
    const bad = await fetch(`${mock.origin}/api/ocr/recognize`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/png' },
      body: Buffer.from('not a png'),
    })
    expect(bad.status).toBe(400)
  })

  it('404s unknown routes', async () => {
    const resp = await fetch(`${mock.origin}/api/unknown`)
    expect(resp.status).toBe(404)
  })

  it('is gated on mock mode', async () => {
    expect(isMockMode()).toBe(true)
  })
})

describe('asset center mock (A2)', () => {
  it('lists template metadata with govt presets', async () => {
    const resp = await fetch(`${mock.origin}/api/asset_center/templates`)
    expect(resp.status).toBe(200)
    const body = (await resp.json()) as {
      templates: Array<{ id: string; label: string; preset: { kind: string; options: Record<string, string> } }>
    }
    const ids = body.templates.map((t) => t.id)
    // mirrors the local catalog...
    expect(ids).toContain('notice')
    expect(ids).toContain('minutes')
    // ...and carries cloud-exclusive extras for the tiering story
    expect(ids).toContain('govt-joint')
    for (const t of body.templates) {
      expect(t.preset.kind).toBe('govt')
      expect(Object.keys(t.preset.options).length).toBeGreaterThan(0)
    }
  })
})

describe('asset center query contract (A3)', () => {
  it('filters by category and searches label/description', async () => {
    const category = await fetch(`${mock.origin}/api/asset_center/templates?category=govt`)
    expect(((await category.json()) as { templates: unknown[] }).templates.length).toBeGreaterThanOrEqual(5)
    const search = await fetch(`${mock.origin}/api/asset_center/templates?q=${encodeURIComponent('会议')}`)
    const hits = (await search.json()) as { templates: Array<{ id: string }> }
    expect(hits.templates.map((t) => t.id)).toContain('minutes')
    const none = await fetch(`${mock.origin}/api/asset_center/templates?q=${encodeURIComponent('不存在的词')}`)
    expect(((await none.json()) as { templates: unknown[] }).templates).toHaveLength(0)
  })
})
