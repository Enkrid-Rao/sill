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

/** sill.storage：请求/响应走宿主，落盘在 <userData>/widget-data/<id>.json。 */
type StorageValue = Record<string, unknown>
const storagePending = new Map<number, (value: StorageValue) => void>()
let storageSeq = 0

ipcRenderer.on('sill:storage-reply', (_event, payload: { id?: number; value?: unknown }) => {
  if (!payload || typeof payload.id !== 'number') return
  const resolve = storagePending.get(payload.id)
  if (!resolve) return
  storagePending.delete(payload.id)
  resolve(
    payload.value && typeof payload.value === 'object'
      ? (payload.value as StorageValue)
      : {}
  )
})

function storageCall(op: 'get' | 'set' | 'patch', value?: unknown): Promise<StorageValue> {
  return new Promise((resolve) => {
    const id = ++storageSeq
    storagePending.set(id, resolve)
    try {
      ipcRenderer.sendToHost('sill:storage', { id, op, value })
    } catch {
      storagePending.delete(id)
      resolve({})
      return
    }
    setTimeout(() => {
      if (!storagePending.delete(id)) return
      resolve({})
    }, 5000)
  })
}

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
  },
  storage: {
    get: () => storageCall('get'),
    set: (value: unknown) => storageCall('set', value),
    patch: (value: Record<string, unknown>) => storageCall('patch', value)
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
