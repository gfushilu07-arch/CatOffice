import type { Editor } from '@tiptap/core'
import { runUiOps } from '../ai/ops'

/** Word's Ctrl+T / Ctrl+Shift+T: hanging indent one half-inch stop out or back (see the stepHangingIndent op) */
export function stepHangingIndent(editor: Editor, delta: 1 | -1): boolean {
<<<<<<< HEAD
  return editor
    .chain()
    .focus()
    .command(({ state, tr, dispatch }) => {
      const { from, to } = state.selection
      let changed = false
      state.doc.nodesBetween(from, to, (node, pos) => {
        if (!PARA_TYPES.has(node.type.name)) return
        const left = Number(node.attrs.indentLeft) || 0
        const nextLeft = Math.max(
          delta > 0 ? Math.floor(left / STEP) * STEP + STEP : Math.ceil(left / STEP) * STEP - STEP,
          0,
        )
        const nextHanging = nextLeft > 0 ? -Math.min(nextLeft, STEP) : 0
        if (nextLeft === left && nextHanging === (Number(node.attrs.indentFirstLine) || 0)) return
        tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          indentLeft: nextLeft || null,
          indentLeftChars: null, // a user twips step must win over the char-unit form
          indentFirstLine: nextHanging || null,
          indentFirstLineChars: null,
        })
        changed = true
      })
      if (changed && dispatch) dispatch(tr)
      return changed
    })
    .run()
=======
  return runUiOps(editor, [{ op: 'stepHangingIndent', target: { scope: 'selection' }, delta }])
>>>>>>> upstream/main
}

/** Ribbon increase/decrease indent: list items change level, paragraphs and headings snap to the next half-inch stop */
export function stepParagraphIndent(editor: Editor, delta: 1 | -1): boolean {
<<<<<<< HEAD
  if (editor.isActive('docListItem')) {
    const ilvl = Number(editor.getAttributes('docListItem').ilvl) || 0
    const next = Math.min(Math.max(ilvl + delta, 0), 8)
    return editor.chain().focus().updateAttributes('docListItem', { ilvl: next }).run()
  }
  return editor
    .chain()
    .focus()
    .command(({ state, tr, dispatch }) => {
      const { from, to } = state.selection
      let changed = false
      state.doc.nodesBetween(from, to, (node, pos) => {
        if (node.type.name !== 'docParagraph' && node.type.name !== 'docHeading') return
        const cur = Number(node.attrs.indentLeft) || 0
        const next =
          delta > 0
            ? Math.floor(cur / STEP) * STEP + STEP
            : Math.max(Math.ceil(cur / STEP) * STEP - STEP, 0)
        if (next === cur) return
        tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          indentLeft: next || null,
          indentLeftChars: null, // a user twips step must win over the char-unit form
        })
        changed = true
      })
      if (changed && dispatch) dispatch(tr)
      return changed
    })
    .run()
=======
  return runUiOps(editor, [{ op: 'stepIndent', target: { scope: 'selection' }, delta }])
>>>>>>> upstream/main
}
