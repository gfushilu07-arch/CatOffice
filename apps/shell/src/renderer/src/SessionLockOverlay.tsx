/**
 * Idle session lock overlay (compliance C3): covers the shell when the main
 * process flips the lock. Unlocking is a click (re-arming the idle timer);
 * encrypted documents re-prompt their passwords through the normal open
 * flow — this overlay only guards the surface, it never holds secrets.
 */
import { useEffect, useState } from 'react'

declare global {
  interface Window {
    sessionLock?: {
      getState(): Promise<boolean>
      unlock(): void
      notifyActivity(): void
    }
    addEventListener(type: string, listener: (e: Event) => void): void
  }
}

export function SessionLockOverlay() {
  const [locked, setLocked] = useState(false)

  useEffect(() => {
    void window.sessionLock?.getState().then(setLocked)
    const onLock = (e: Event) => setLocked((e as CustomEvent<boolean>).detail)
    window.addEventListener('session-lock', onLock)
    return () => window.removeEventListener('session-lock', onLock)
  }, [])

  // activity beacon: any interaction resets the main process's idle clock
  useEffect(() => {
    if (!locked) {
      const notify = () => window.sessionLock?.notifyActivity()
      window.addEventListener('keydown', notify)
      window.addEventListener('mousemove', notify)
      return () => {
        window.removeEventListener('keydown', notify)
        window.removeEventListener('mousemove', notify)
      }
    }
  }, [locked])

  if (!locked) return null

  const unlock = () => {
    window.sessionLock?.unlock()
    setLocked(false)
  }

  return (
    <div className="session-lock-overlay" onClick={unlock} role="presentation">
      <div className="session-lock-card">
        <div className="session-lock-icon">🔒</div>
        <h2>会话已锁定</h2>
        <p>空闲时间过长，系统已自动锁定以保护文档安全。</p>
        <p className="session-lock-hint">加密文档需要重新输入密码后才能继续编辑。</p>
        <button className="btn-primary" onClick={unlock}>
          点击解锁
        </button>
      </div>
    </div>
  )
}
