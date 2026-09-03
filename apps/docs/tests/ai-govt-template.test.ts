/**
 * apply_govt_template tool (asset center AI skill): the executor validates
 * kind/title, forwards only the fields the model filled (untouched fields
 * keep their xx placeholders), and lands the render through the injected
 * apply callback — full generator fidelity, never an HTML round-trip.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Editor } from '@tiptap/core'
import { editorExtensions } from '../src/renderer/editor/extensions'
import { executeTool } from '../src/renderer/ai/tools'

const editors = new Set<Editor>()
afterEach(() => {
  for (const editor of editors) editor.destroy()
  editors.clear()
})

function createEditor(): Editor {
  const editor = new Editor({
    element: document.createElement('div'),
    extensions: editorExtensions,
    content: {
      type: 'doc',
      content: [
        {
          type: 'docParagraph',
          attrs: { docxIndex: null },
          content: [{ type: 'text', text: 'x' }],
        },
      ],
    },
  })
  editors.add(editor)
  return editor
}

const NUM_IDS = { bullet: null, ordered: null }

async function runApply(
  input: Record<string, unknown>,
  apply?: import('../src/renderer/ai/tools').ApplyGovtTemplate,
  withoutCallback = false,
) {
  const editor = createEditor()
  return executeTool(
    editor,
    { id: 't1', name: 'apply_govt_template', input },
    NUM_IDS,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    withoutCallback ? undefined : (apply ?? (async () => true)),
  )
}

describe('apply_govt_template tool', () => {
  it('forwards only filled fields and lands through the apply callback', async () => {
    const apply = vi.fn(async () => true)
    const exec = await runApply(
      {
        kind: 'notice',
        title: '关于春季植树的通知',
        recipients: '各区县人民政府：',
        paragraphs: ['一、各单位要高度重视。', '二、按时完成任务。'],
      },
      apply,
    )
    expect(exec.isError).toBeUndefined()
    expect(apply).toHaveBeenCalledWith({
      templateId: 'notice',
      fields: {
        title: '关于春季植树的通知',
        recipients: '各区县人民政府：',
        paragraphs: ['一、各单位要高度重视。', '二、按时完成任务。'],
      },
    })
  })

  it('rejects an unknown kind and an empty title', async () => {
    const apply = vi.fn(async () => true)
    const badKind = await runApply({ kind: 'memo', title: 'x' }, apply)
    expect(badKind.isError).toBe(true)
    const noTitle = await runApply({ kind: 'notice' }, apply)
    expect(noTitle.isError).toBe(true)
    expect(apply).not.toHaveBeenCalled()
  })

  it('fails cleanly when the apply path is unavailable', async () => {
    const exec = await runApply({ kind: 'notice', title: 'x' }, undefined, true)
    expect(exec.isError).toBe(true)
  })

  it('propagates an apply failure as an error result', async () => {
    const exec = await runApply(
      { kind: 'letter', title: '关于××的函' },
      vi.fn(async () => false),
    )
    expect(exec.isError).toBe(true)
  })
})
