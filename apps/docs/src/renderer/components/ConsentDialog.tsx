/**
 * Upload-consent dialog (等保 C2): shown on the first online-AI use. Tiered
 * opt-in — AI content (t1) is the gate the ai:stream consent error points
 * at; crash logs (t2) and anonymous analytics (t3) are secondary toggles.
 * Rejecting everything is always allowed and keeps the app fully usable
 * (online AI stays unavailable until t1 is granted; mock mode is untouched).
 */
import { createElement, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'

type Tiers = 't1' | 't2' | 't3'

const TIER_INFO: Array<{ id: Tiers; title: string; detail: string; required: boolean }> = [
  {
    id: 't1',
    title: 'AI 对话内容',
    detail: '使用线上 AI 时，你的提问与 AI 回复会发送到 CatSpark 云端处理。关闭后线上 AI 不可用（本地/离线 AI 不受影响）。',
    required: true,
  },
  {
    id: 't2',
    title: '错误日志',
    detail: '程序异常时上传脱敏的错误堆栈（不含文档内容），帮助定位问题。',
    required: false,
  },
  {
    id: 't3',
    title: '匿名使用统计',
    detail: '仅记录功能使用次数，不含任何内容或个人信息。',
    required: false,
  },
]

function ConsentDialogInner({ onDone }: { onDone: (grantedAny: boolean) => void }) {
  const [grants, setGrants] = useState<Record<Tiers, boolean>>({ t1: false, t2: false, t3: false })

  const submit = () => {
    for (const tier of ['t1', 't2', 't3'] as Tiers[]) {
      void window.desktop.setUploadConsent(tier, grants[tier])
    }
    onDone(grants.t1)
  }

  return (
    <div className="modal-backdrop">
      <div className="consent-dialog" role="dialog" aria-label="数据授权">
        <h2>AI 数据授权</h2>
        <p className="consent-intro">
          使用线上 AI 前，请选择愿意上传的数据类别。你可以随时在「设置 →
          隐私」中修改或撤回。全部拒绝也可以继续使用（线上 AI 除外）。
        </p>
        {TIER_INFO.map((tier) => (
          <label key={tier.id} className="consent-tier">
            <input
              type="checkbox"
              checked={grants[tier.id]}
              onChange={(e) => setGrants((g) => ({ ...g, [tier.id]: e.target.checked }))}
            />
            <span className="consent-tier-text">
              <span className="consent-tier-title">
                {tier.title}
                {tier.required ? '' : '（可选）'}
              </span>
              <span className="consent-tier-detail">{tier.detail}</span>
            </span>
          </label>
        ))}
        <div className="consent-actions">
          <button className="btn-secondary" onClick={() => onDone(false)}>
            全部拒绝
          </button>
          <button className="btn-primary" onClick={submit}>
            保存选择
          </button>
        </div>
      </div>
    </div>
  )
}

let root: Root | null = null
let host: HTMLElement | null = null

/**
 * Mount the consent dialog imperatively (no host-app React tree wiring).
 * Resolves whether t1 ended up granted.
 */
export function showConsentDialog(): Promise<boolean> {
  return new Promise((resolve) => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    root.render(
      createElement(ConsentDialogInner, {
        onDone: (grantedAny) => {
          root?.unmount()
          host?.remove()
          root = null
          host = null
          resolve(grantedAny)
        },
      }),
    )
  })
}

