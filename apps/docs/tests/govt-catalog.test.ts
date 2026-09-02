/**
 * Asset center A1: the built-in GB/T 9704 template catalog. Each preset must
 * render a complete scaffold (banner, doc number, red rule, title, body,
 * signature) through the same govtDocBlocks the engine round-trip tests
 * exercise — the catalog is a thin parameter table, but a broken entry here
 * is a broken New-Document flow.
 */
import { describe, expect, it } from 'vitest'
import { GOVT_TEMPLATES, govtTemplateById } from '../src/renderer/govt-catalog'
import { govtDocBlocks } from '../src/renderer/govt-template'

describe('govt template catalog', () => {
  it('ships the five GB/T 9704 kinds with unique ids and filenames', () => {
    const ids = GOVT_TEMPLATES.map((entry) => entry.id)
    expect(ids).toEqual(['notice', 'request', 'report', 'letter', 'minutes'])
    expect(new Set(ids).size).toBe(ids.length)
    for (const entry of GOVT_TEMPLATES) {
      expect(entry.fileName).toBeTruthy()
      expect(entry.options.title).toContain('××')
    }
  })

  it('renders every preset into a complete scaffold', () => {
    for (const entry of GOVT_TEMPLATES) {
      const blocks = govtDocBlocks(entry.options)
      const texts = blocks.map((b) => (b.runs ?? []).map((r) => r.text).join('')).join('')
      expect(texts).toContain(entry.options.title!)
      // the default banner and doc number are part of every scaffold
      expect(texts).toContain('××××文件')
      expect(texts).toContain('〔2026〕1号')
      // every preset carries the GB signature block
      expect(blocks.some((b) => b.format?.align === 'right')).toBe(true)
    }
  })

  it('resolves ids through govtTemplateById', () => {
    expect(govtTemplateById('notice')?.label).toBe('通知')
    expect(govtTemplateById('no-such')).toBeUndefined()
  })
})
