/**
 * Punctuation compression (T5 phase 1): the rule module, its application in
 * the offline line-break simulation, and the canvas decorations must agree.
 * Word's CJK default: inside a run of adjacent fullwidth closing marks every
 * member except the last gives up its trailing half width.
 */

import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { editorExtensions } from '../src/renderer/editor/extensions'
import {
  isCompressibleClose,
  punctuationCompressionEnabled,
  setPunctuationCompressionEnabled,
  squeezeRightsEm,
} from '../src/renderer/punctuation-squeeze'
import { simulateLines, type FontMetricsProvider } from '../src/renderer/line-metrics'

describe('squeezeRightsEm rule', () => {
  it('compresses every member of a run except the last', () => {
    expect(squeezeRightsEm('。。。')).toEqual([-0.5, -0.5, 0])
  })

  it('leaves single marks and mixed text untouched', () => {
    expect(squeezeRightsEm('一。二')).toEqual([0, 0, 0])
    expect(squeezeRightsEm('中文，逗号。')).toEqual([0, 0, 0, 0, 0, 0])
  })

  it('compresses each run independently', () => {
    expect(squeezeRightsEm('。。一。。')).toEqual([-0.5, 0, 0, -0.5, 0])
  })

  it('covers the main fullwidth closing classes', () => {
    expect(isCompressibleClose('、')).toBe(true)
    expect(isCompressibleClose('」')).toBe(true)
    expect(isCompressibleClose('）')).toBe(true)
    expect(isCompressibleClose('（')).toBe(false)
    expect(isCompressibleClose('一')).toBe(false)
  })
})

const stubMetrics: FontMetricsProvider = {
  metrics: () => ({ ascent: 8, descent: 4, lineHeight: 12 }),
  measure: (text: string) => [...text].length * 10,
}

describe('simulateLines applies the same rule', () => {
  it('fits one more full stop on the line than uncompressed math', () => {
    // 8 chars of 10px on a 70px line: plain per-char math overflows at 7;
    // with the first two of 「。。。」 compressed (8px each at 12pt), the run
    // measures 64px and fits on one line.
    const lines = simulateLines([{ text: '一二三四五。。。' }], 70, stubMetrics, 12, 'SimSun')
    expect(lines).toHaveLength(1)
    expect(lines[0]!.text).toBe('一二三四五。。。')
  })

  it('keeps the uncompressed line break for non-run text', () => {
    expect(simulateLines([{ text: '一二三四五六七八' }], 70, stubMetrics, 12, 'SimSun')).toHaveLength(2)
  })
})

describe('document-level compression gate (w:characterSpacingControl)', () => {
  it('doNotCompress disables pagination squeeze; the default restores it', () => {
    // 8 chars on a 70px line: with squeeze the run measures 64px and fits one
    // line; with doNotCompress the third full stop hits 80px, and kinsoku (a
    // full stop must not start a line) pulls the hanzi before it down as well.
    setPunctuationCompressionEnabled(false)
    try {
      expect(punctuationCompressionEnabled()).toBe(false)
      const off = simulateLines([{ text: '一二三四五。。。' }], 70, stubMetrics, 12, 'SimSun')
      expect(off.map((l) => l.text)).toEqual(['一二三四', '五。。。'])
      // and the squeeze-driven one-line fit is gone
      expect(off).toHaveLength(2)
    } finally {
      setPunctuationCompressionEnabled(true)
    }
    expect(punctuationCompressionEnabled()).toBe(true)
    expect(simulateLines([{ text: '一二三四五。。。' }], 70, stubMetrics, 12, 'SimSun')).toHaveLength(1)
  })

  it('doNotCompress also suppresses the canvas decorations', () => {
    const build = () =>
      new Editor({
        element: document.createElement('div'),
        extensions: editorExtensions,
        content: {
          type: 'doc',
          content: [
            {
              type: 'docParagraph',
              attrs: { docxIndex: null },
              content: [{ type: 'text', text: '一。。。二' }],
            },
          ],
        } as never,
      })
    const pluginOf = (editor: Editor) =>
      editor.state.plugins.find((p) => String((p as { key?: unknown }).key).includes('punctSqueeze'))!
    const editor = build()
    try {
      expect(pluginOf(editor).getState(editor.state)!.find()).toHaveLength(2)
      setPunctuationCompressionEnabled(false)
      const off = build()
      try {
        expect(pluginOf(off).getState(off.state)!.find()).toHaveLength(0)
      } finally {
        off.destroy()
      }
    } finally {
      setPunctuationCompressionEnabled(true)
      editor.destroy()
    }
  })
})

describe('canvas decorations mark exactly the compressed chars', () => {
  const editors = new Set<Editor>()

  function editorWith(text: string): Editor {
    const editor = new Editor({
      element: document.createElement('div'),
      extensions: editorExtensions,
      content: {
        type: 'doc',
        content: [
          { type: 'docParagraph', attrs: { docxIndex: null }, content: [{ type: 'text', text }] },
        ],
      } as never,
    })
    editors.add(editor)
    return editor
  }

  function punctSqueezePlugin(editor: Editor) {
    const plugin = editor.state.plugins.find((p) =>
      String((p as { key?: unknown }).key).includes('punctSqueeze'),
    )
    expect(plugin).toBeDefined()
    return plugin!
  }

  function markedTexts(editor: Editor): string[] {
    const out: string[] = []
    punctSqueezePlugin(editor)
      .getState(editor.state)!
      .find()
      .forEach((d: { from: number; to: number }) => {
        out.push(editor.state.doc.textBetween(d.from, d.to))
      })
    return out
  }

  function decoCount(editor: Editor): number {
    let count = 0
    punctSqueezePlugin(editor)
      .getState(editor.state)!
      .find()
      .forEach(() => count++)
    return count
  }

  it('decorates the members of a closing-mark run except the last', () => {
    const editor = editorWith('一。。。二')
    // the run is 。。。: the first two carry -0.5, the third does not
    expect(markedTexts(editor)).toEqual(['。', '。'])
  })

  it('recomputes after an edit joins two runs', () => {
    const editor = editorWith('一。二。')
    expect(decoCount(editor)).toBe(0)
    // append a third mark at the end: the previous final 。 becomes compressed
    editor.commands.insertContentAt(editor.state.doc.content.size - 1, '。')
    expect(decoCount(editor)).toBe(1)
  })
})
