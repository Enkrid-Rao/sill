import { contextBridge, ipcRenderer } from 'electron'

interface WidgetData {
  data: Record<string, unknown>
  language: string
  tokens?: Record<string, string>
  /** Trusted components only: package/dev folder. */
  dir?: string
}

let latest: WidgetData | null = null
const listeners = new Set<(payload: WidgetData) => void>()

ipcRenderer.on('sill:data', (_event, payload: WidgetData) => {
  const root = (globalThis as unknown as { document?: { documentElement: { style: { setProperty: (name: string, value: string) => void } } } }).document?.documentElement
  if (payload.tokens && root) {
    for (const [name, value] of Object.entries(payload.tokens)) {
      root.style.setProperty(name, value)
    }
  }
  latest = payload
  for (const listener of listeners) listener(payload)
})

const api = {
  ready: (callback: (payload: WidgetData) => void) => {
    listeners.add(callback)
    if (latest) callback(latest)
  },
  onData: (callback: (payload: WidgetData) => void) => {
    listeners.add(callback)
    if (latest) callback(latest)
  },
  command: (action: string, arg?: unknown) => {
    ipcRenderer.sendToHost('sill:command', action, arg)
  }
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('sill', api)
} else {
  ;(globalThis as unknown as { sill: typeof api }).sill = api
}

/**
 * 把 guest 的内容高度报给宿主：flow 布局据此长高，free 布局由 CSS 铺满卡片。
 * webview 不能像 iframe 那样靠父容器自动撑开，所以必须主动上报。
 */
interface GuestDocument {
  documentElement: { scrollHeight: number; offsetHeight: number } | null
  body: {
    scrollHeight: number
    offsetHeight: number
    getBoundingClientRect: () => { height: number }
  } | null
  fonts?: { ready: Promise<unknown> }
}

let scheduled = false

function reportHeight(): void {
  const doc = (globalThis as unknown as { document?: GuestDocument }).document
  if (!doc?.documentElement) return
  /**
   * 不能用 documentElement.scrollHeight：它至少等于 webview 视口高度，
   * 组件永远「缩不小」。量 body 的盒子才是内容高度。
   */
  const height = Math.max(
    doc.body?.scrollHeight ?? 0,
    doc.body?.offsetHeight ?? 0,
    doc.body?.getBoundingClientRect?.().height ?? 0
  )
  if (height > 0) ipcRenderer.sendToHost('sill:height', Math.ceil(height))
}

function scheduleHeight(): void {
  if (scheduled) return
  scheduled = true
  ;(globalThis as unknown as { requestAnimationFrame: (cb: () => void) => void })
    .requestAnimationFrame(() => {
      scheduled = false
      reportHeight()
    })
}

function watchHeight(): void {
  const view = globalThis as unknown as {
    document?: GuestDocument & { readyState?: string }
    ResizeObserver?: new (cb: () => void) => { observe: (target: unknown) => void }
    MutationObserver?: new (cb: () => void) => { observe: (target: unknown, init: unknown) => void }
    addEventListener: (name: string, cb: () => void) => void
  }
  const doc = view.document
  if (!doc) return

  const start = (): void => {
    reportHeight()
    if (view.ResizeObserver) {
      const observer = new view.ResizeObserver(scheduleHeight)
      if (doc.documentElement) observer.observe(doc.documentElement)
      if (doc.body) observer.observe(doc.body)
    }
    if (view.MutationObserver && doc.body) {
      new view.MutationObserver(scheduleHeight).observe(doc.body, {
        subtree: true,
        childList: true,
        characterData: true
      })
    }
    void doc.fonts?.ready.then(scheduleHeight)
  }

  if (doc.readyState === 'loading') {
    view.addEventListener('DOMContentLoaded', start)
  } else {
    start()
  }
  view.addEventListener('resize', scheduleHeight)
}

watchHeight()
