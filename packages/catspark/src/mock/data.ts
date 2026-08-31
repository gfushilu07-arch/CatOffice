/**
 * Canned CatSpark payloads for mock mode. Pure data — no Node builtins — so
 * this module stays safe to import from any bundle. Consumers: the embedded
 * mock server (./server) and the JS-layer mock branches in @genoffice/ai-search.
 */

import { mockCloudOrigin } from '../index'

// ── account ──────────────────────────────────────────────────────────

/** Account shown by gskLoginInfo() once mock login has minted a key. */
export const MOCK_ACCOUNT = {
  email: 'demo@catoffice.mock',
  plan: 'mock-pro',
  creditBalance: 9999,
}

// ── web search ───────────────────────────────────────────────────────

export interface MockWebResult {
  title: string
  url: string
  snippet: string
}

export function mockWebSearch(
  query: string,
  maxResults: number,
): { results: MockWebResult[]; answer: string } {
  const trimmed = query.trim() || 'cat office'
  const all: MockWebResult[] = [1, 2, 3].map((n) => ({
    title: `${trimmed} — mock result ${n}`,
    url: `https://example.com/search?q=${encodeURIComponent(trimmed)}&r=${n}`,
    snippet:
      `[CatSpark mock] This is canned search result #${n} for "${trimmed}". ` +
      'Real results come from the CatSpark backend once it is configured.',
  }))
  return {
    results: all.slice(0, Math.max(0, maxResults)),
    answer: `[CatSpark mock] Web search is mocked; query was "${trimmed}".`,
  }
}

// ── image search / generation ────────────────────────────────────────

export interface MockImageResult {
  title: string
  imageUrl: string
  sourceUrl: string
  source: string
  width?: number
  height?: number
}

/** Dimensions served by /mock-image/n.png on the mock server (kept in sync). */
const MOCK_IMAGES: ReadonlyArray<{ width: number; height: number }> = [
  { width: 800, height: 600 },
  { width: 1280, height: 720 },
  { width: 640, height: 640 },
]

export function mockImageSearch(query: string, maxResults: number): MockImageResult[] {
  const trimmed = query.trim() || 'cat'
  return MOCK_IMAGES.slice(0, Math.max(0, maxResults)).map((dim, i) => ({
    title: `${trimmed} — mock image ${i + 1}`,
    imageUrl: `${mockCloudOrigin()}/mock-image/${i + 1}.png`,
    sourceUrl: `https://example.com/images?q=${encodeURIComponent(trimmed)}`,
    source: 'example.com',
    ...dim,
  }))
}

let generatedSeq = 0

/** URL of a freshly "generated" mock image; served as a gradient PNG. */
export function mockGeneratedImageUrl(): string {
  generatedSeq = (generatedSeq % MOCK_IMAGES.length) + 1
  return `${mockCloudOrigin()}/mock-image/${generatedSeq}.png`
}

// ── past projects (cloud projects home list) ─────────────────────────

export interface MockPastProject {
  projectId: string
  type: string
  title: string
  ctime: string
  projectUrl: string
}

const MOCK_PROJECT_KINDS: ReadonlyArray<{ type: string; title: string }> = [
  { type: 'docs_agent', title: '季度复盘草稿' },
  { type: 'slides_agent_git', title: '产品发布会演示' },
  { type: 'sheets_agent_new', title: '预算跟踪表' },
  { type: 'docs_agent', title: '会议纪要：排版引擎评审' },
  { type: 'slides_agent_git', title: 'CatOffice 上手指南' },
  { type: 'other_agent', title: '灵感收集站' },
]

/** Newest-first sample list; ctimes are relative to now so the list always looks fresh. */
export function mockPastProjects(): { projects: MockPastProject[]; total: number; hasMore: false } {
  const dayMs = 24 * 60 * 60 * 1000
  const projects = MOCK_PROJECT_KINDS.map((kind, i) => ({
    projectId: `mock-${String(i + 1).padStart(3, '0')}`,
    type: kind.type,
    title: kind.title,
    ctime: new Date(Date.now() - (i + 1) * 2 * dayMs).toISOString(),
    projectUrl: `/agents?id=mock-${String(i + 1).padStart(3, '0')}`,
  }))
  return { projects, total: projects.length, hasMore: false }
}

// ── media analysis / transcription ───────────────────────────────────

export function mockAnalyzedText(kind: 'analysis' | 'transcript'): string {
  if (kind === 'transcript') {
    return '[CatSpark mock] （转写占位）这是一段模拟转写文本：真实语音识别由 CatSpark 后端提供。'
  }
  return '[CatSpark mock] （分析占位）媒体分析尚未接入真实后端，此处为演示文本。'
}
