/**
 * Idle session lock (compliance C3, compliance-plan.md section 4): after a configurable
 * idle timeout the shell locks the session — every cached encrypted-document
 * password is dropped and the window is covered by an unlock overlay until
 * the user clicks back in (the normal per-document password prompt then
 * re-arms encryption transparently). Plain documents are unaffected: locking
 * only clears secrets, never content.
 *
 * The timer is enabled via app-settings `sessionLockMinutes` (0 = off,
 * default 15). Input activity = any keydown/mousemove/click on any app
 * window.
 */

import { BrowserWindow, ipcMain } from 'electron'

type IdleState = {
  timer: NodeJS.Timeout | null
  lastActivity: number
  locked: boolean
}

const state: IdleState = { timer: null, lastActivity: Date.now(), locked: false }

let getMinutes: () => number = () => 15

export function configureIdleLock(minutes: number): void {
  getMinutes = () => minutes
  restartTimer()
}

export function isSessionLocked(): boolean {
  return state.locked
}

export function setSessionLocked(locked: boolean): void {
  state.locked = locked
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('session-lock', locked)
  }
}

function lockNow(reason: 'idle' | 'manual'): void {
  if (state.locked) return
  state.locked = true
  // drop every cached encrypted-document password BEFORE covering the window:
  // the unlock path re-prompts per document (normal open flow)
  void import('../../../docs/src/main/docx-encryption')
    .then(({ lockSession }) => {
      const dropped = lockSession()
      void import('./audit-log').then(({ auditLog }) =>
        auditLog('app.session.lock', reason, { droppedPasswords: dropped }),
      )
    })
    .catch(() => {})
  setSessionLocked(true)
}

function restartTimer(): void {
  if (state.timer) clearInterval(state.timer)
  state.timer = setInterval(() => {
    const minutes = getMinutes()
    if (minutes <= 0 || state.locked) return
    if (Date.now() - state.lastActivity >= minutes * 60_000) {
      lockNow('idle')
    }
  }, 30_000)
}

/** unlock + record the manual re-entry */
export function unlockSession(): void {
  state.locked = false
  state.lastActivity = Date.now()
  setSessionLocked(false)
}

/** register the IPC surface + activity tracking; call once after ready */
export function installIdleLock(): void {
  ipcMain.handle('session-lock:state', () => state.locked)
  ipcMain.on('session-lock:unlock', () => unlockSession())
  ipcMain.on('session-lock:activity', () => {
    state.lastActivity = Date.now()
  })
  restartTimer()
}
