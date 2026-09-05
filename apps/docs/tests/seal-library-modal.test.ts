/**
 * Seal management panel (asset-center SA2 stamp tier, the management UI over
 * seal-library.ts): mounts the modal against a mocked desktop API and locks
 * the CRUD interactions — list rendering, insert flow, rename commit, remove
 * confirm, and the tier badge that keeps the stamp/signature model legible.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { SealLibraryModal } from '../src/renderer/components/SealLibraryModal'
import type { SealLibraryEntry } from '../src/renderer/seal-library'

const entry = (over: Partial<SealLibraryEntry> = {}): SealLibraryEntry => ({
  id: 'seal-1',
  name: '公司公章',
  shape: 'circle',
  sizeMm: { width: 40, height: 40 },
  mode: 'stamp',
  createdAt: '2026-09-04T00:00:00.000Z',
  image: 'seal-1.png',
  ...over,
})

const PNG_1PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const sealsList = vi.fn<() => Promise<SealLibraryEntry[]>>()
const desktop = {
  sealsList,
  sealsAdd: vi.fn(),
  sealsRename: vi.fn(),
  sealsRemove: vi.fn(),
  sealsImage: vi.fn().mockResolvedValue({ base64: PNG_1PX.slice(22), mime: 'image/png' }),
}

vi.stubGlobal('window', {
  ...window,
  desktop,
  confirm: vi.fn(() => true),
})

let host: HTMLDivElement
let root: Root
let onInsert: ReturnType<typeof vi.fn>
let onClose: ReturnType<typeof vi.fn>

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  onInsert = vi.fn()
  onClose = vi.fn()
  sealsList.mockResolvedValue([entry()])
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.clearAllMocks()
})

const mount = async () => {
  await act(async () => {
    root = createRoot(host)
    root.render(
      createElement(SealLibraryModal, { onInsert, onClose } as never),
    )
  })
  await act(async () => new Promise((r) => setTimeout(r, 0)))
  return host
}

describe('SealLibraryModal', () => {
  it('lists entries with name, tier badge and detected metadata', async () => {
    const el = await mount()
    expect(el.textContent).toContain('公司公章')
    expect(el.textContent).toContain('素材章')
    expect(el.textContent).toContain('圆形')
    expect(el.textContent).toContain('40×40 mm')
  })

  it('insert resolves the image and forwards the data url', async () => {
    const el = await mount()
    const insert = [...el.querySelectorAll('button')].find((b) => b.textContent === '插入')!
    await act(async () => {
      insert.click()
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(desktop.sealsImage).toHaveBeenCalledWith('seal-1')
    expect(onInsert).toHaveBeenCalledWith(expect.stringMatching(/^data:image\/png;base64,/), expect.objectContaining({ id: 'seal-1' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('rename commits through the API and refreshes the list', async () => {
    desktop.sealsRename.mockResolvedValue({ ok: true })
    const el = await mount()
    const rename = [...el.querySelectorAll('button')].find((b) => b.textContent === '重命名')!
    await act(async () => {
      rename.click()
    })
    const input = el.querySelector('.seal-card input')! as HTMLInputElement
    expect(input.value).toBe('公司公章')
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    await act(async () => {
      setter.call(input, '合同专用章')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(desktop.sealsRename).toHaveBeenCalledWith('seal-1', '合同专用章')
    expect(sealsList).toHaveBeenCalledTimes(2) // initial + refresh
  })

  it('remove asks for confirmation and deletes', async () => {
    desktop.sealsRemove.mockResolvedValue({ ok: true })
    const el = await mount()
    const remove = [...el.querySelectorAll('button')].find((b) => b.textContent === '删除')!
    await act(async () => {
      remove.click()
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(window.confirm).toHaveBeenCalled()
    expect(desktop.sealsRemove).toHaveBeenCalledWith('seal-1')
  })

  it('an empty library shows the hint', async () => {
    sealsList.mockResolvedValue([])
    const el = await mount()
    expect(el.textContent).toContain('暂无印章')
  })
})
