/**
 * Linux ozone switch decision (src/linux-ozone.ts): env knob parsing and the
 * session-type fallback. The effectful half (Electron commandLine switches)
 * is exercised by the L4 desktop walkthrough; the decision is what can drift.
 */
import { describe, expect, it } from 'vitest'
import { ozoneChoice, shouldEnableWayland } from '../src/main/linux-ozone'

describe('ozone choice parsing', () => {
  it('accepts the three explicit values case-insensitively', () => {
    expect(ozoneChoice('wayland')).toBe('wayland')
    expect(ozoneChoice(' AUTO ')).toBe('auto')
    expect(ozoneChoice('X11')).toBe('x11')
  })

  it('defaults to x11 for garbage and unset', () => {
    expect(ozoneChoice(undefined)).toBe('x11')
    expect(ozoneChoice('mutter')).toBe('x11')
    expect(ozoneChoice('')).toBe('x11')
  })
})

describe('wayland enablement', () => {
  it('follows the session only in auto mode', () => {
    expect(shouldEnableWayland('auto', 'wayland')).toBe(true)
    expect(shouldEnableWayland('auto', 'x11')).toBe(false)
    expect(shouldEnableWayland('x11', 'wayland')).toBe(false)
    // forced wayland ignores the session (e.g. XDG_SESSION_TYPE unset under a wrapper)
    expect(shouldEnableWayland('wayland', 'x11')).toBe(true)
    expect(shouldEnableWayland('auto', undefined)).toBe(false)
    expect(shouldEnableWayland(undefined, 'wayland')).toBe(false)
  })
})
