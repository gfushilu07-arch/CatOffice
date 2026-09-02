/**
 * Linux desktop-session integration (L4 prep): on Wayland sessions the default
 * X11 backend (XWayland) works but shows blur/scale artifacts on fractional
 * scaling and loses native gestures. Electron supports the native Wayland
 * backend, but it must be opted in before app ready via the ozone switch, and
 * some compositors still have gaps (global menu, some IMEs) — so the default
 * stays X11/XWayland and native Wayland is an explicit per-user choice:
 *
 *   CATOFFICE_OZONE=auto  — follow the session (XDG_SESSION_TYPE)
 *   CATOFFICE_OZONE=wayland — force native Wayland
 *   CATOFFICE_OZONE=x11   — force X11/XWayland (also the default)
 *
 * Must run before app.whenReady(); the command-line switches are appended
 * idempotently by Chromium, so double invocation is harmless.
 */

/** The user's ozone knob: one of the three env values, x11 as the default. */
export function ozoneChoice(raw: string | undefined): 'auto' | 'wayland' | 'x11' {
  const v = raw?.trim().toLowerCase()
  if (v === 'auto' || v === 'wayland' || v === 'x11') return v
  return 'x11'
}

/** The composed decision: enable native Wayland for the given env values. */
export function shouldEnableWayland(
  rawChoice: string | undefined,
  sessionType: string | undefined,
): boolean {
  const choice = ozoneChoice(rawChoice)
  return choice === 'wayland' || (choice === 'auto' && sessionType?.trim().toLowerCase() === 'wayland')
}

/** Effectful half — only reached on a real Electron main process. */
export function applyLinuxOzoneSwitch(): void {
  if (process.platform !== 'linux') return
  if (!shouldEnableWayland(process.env.CATOFFICE_OZONE, process.env.XDG_SESSION_TYPE)) return
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- late-bound to keep this module importable outside Electron
  const { app } = require('electron') as typeof import('electron')
  // ozone-platform-hint (not -platform) lets Chromium keep its fallback
  // chain: a Wayland failure still lands on XWayland instead of a black
  // window. enable-wayland-ime covers fcitx5 on native Wayland.
  app.commandLine.appendSwitch('ozone-platform-hint', 'auto')
  app.commandLine.appendSwitch('enable-wayland-ime')
}
