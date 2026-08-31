import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { mockCloudOrigin } from '@catoffice/catspark'
import {
  gskApiKey,
  gskConvertPdfToDocx,
  gskGenerateImage,
  gskImageSearch,
  gskListPastProjects,
  gskLoginInfo,
  gskTranscribe,
  gskWebSearch,
  hasGskAuth,
} from '../src/gsk'

// mock branches read the seam at call time, so setting the flag here is enough
process.env.CATSPARK_MOCK = '1'
// fresh auth dir: the mock key comes only from mock login / explicit env
const authDir = mkdtempSync(join(tmpdir(), 'gsk-mock-'))
process.env.GENOFFICE_AUTH_DIR = authDir

const savedEnv = new Map<string, string | undefined>()
function saveSet(key: string, value: string | undefined): void {
  if (!savedEnv.has(key)) savedEnv.set(key, process.env[key])
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}

afterAll(async () => {
  for (const [key, value] of savedEnv) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  delete process.env.CATSPARK_MOCK
  delete process.env.GENOFFICE_AUTH_DIR
  rmSync(authDir, { recursive: true, force: true })
})

describe('gsk in mock mode', () => {
  it('derives the key only from explicit sources — never the shared upstream CLI login', () => {
    saveSet('GSK_API_KEY', undefined)
    // even on a machine with a real ~/.genspark-tool-cli login, mock mode
    // reports logged-out until a mock login (or env) provides a key
    expect(gskApiKey()).toBe('')
    expect(hasGskAuth()).toBe(false)
  })

  it('accepts an explicit key and needs no CLI binary', () => {
    saveSet('GSK_API_KEY', 'gsk-mock-test-key')
    expect(gskApiKey()).toBe('gsk-mock-test-key')
    expect(hasGskAuth()).toBe(true)
  })

  it('returns canned web search results', async () => {
    const { results, answer } = await gskWebSearch('办公猫 排版', 2)
    expect(results).toHaveLength(2)
    expect(results[0]!.url).toContain('example.com')
    expect(answer).toContain('CatSpark mock')
  })

  it('returns canned image search results served by the mock server', async () => {
    const images = await gskImageSearch('cat', 2)
    expect(images).toHaveLength(2)
    for (const image of images) {
      expect(image.imageUrl.startsWith(`${mockCloudOrigin()}/mock-image/`)).toBe(true)
      expect(image.width).toBeGreaterThan(0)
      expect(image.height).toBeGreaterThan(0)
    }
  })

  it('generates a mock image URL without any network round trip', async () => {
    const generated = await gskGenerateImage({ prompt: 'a cat office' })
    expect(generated.url.startsWith(`${mockCloudOrigin()}/mock-image/`)).toBe(true)
    expect(generated.taskId).toBe('mock-task')
  })

  it('lists sample cloud projects with kind filtering and paging', async () => {
    const all = await gskListPastProjects()
    expect(all.total).toBeGreaterThan(0)
    expect(all.hasMore).toBe(false)

    const docs = await gskListPastProjects({ artifactTypes: ['docs', 'slides'] })
    expect(docs.projects.length).toBeGreaterThan(0)
    expect(docs.projects.length).toBeLessThan(all.projects.length)
    for (const project of docs.projects) {
      expect(project.type.startsWith('docs') || project.type.startsWith('slides')).toBe(true)
    }

    const paged = await gskListPastProjects({ limit: 2, offset: 1 })
    expect(paged.projects).toHaveLength(2)
    expect(paged.projects[0]!.projectId).toBe(all.projects[1]!.projectId)
  })

  it('reports the mock account only when a key exists', async () => {
    saveSet('GSK_API_KEY', undefined)
    await expect(gskLoginInfo()).resolves.toBeNull()
    saveSet('GSK_API_KEY', 'gsk-mock-test-key')
    await expect(gskLoginInfo()).resolves.toMatchObject({
      email: 'demo@catoffice.mock',
      plan: 'mock-pro',
      creditBalance: 9999,
    })
  })

  it('returns placeholder text for transcription', async () => {
    await expect(gskTranscribe({ audioUrls: ['/tmp/a.mp3'] })).resolves.toContain('CatSpark mock')
  })

  it('fails loudly on PDF→Word cloud conversion instead of faking it', async () => {
    await expect(gskConvertPdfToDocx('/tmp/never-read.pdf')).rejects.toThrow(/not part of the CatSpark mock/)
  })
})
