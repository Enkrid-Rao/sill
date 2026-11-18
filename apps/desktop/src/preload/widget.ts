import { contextBridge, ipcRenderer } from 'electron'

interface WidgetData {
  data: Record<string, unknown>
  language: string
  tokens?: Record<string, string>
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
