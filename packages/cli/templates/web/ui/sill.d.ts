// 可选：放进项目根目录，编辑器会给 ui/main.js 里的 sill / root 补全。
declare const root: ShadowRoot
declare const sill: {
  id: string
  root: ShadowRoot
  host: unknown
  data: () => Record<string, unknown>
  onData: (callback: (payload: {
    data: Record<string, unknown>
    language: string
    tokens: Record<string, string>
  }) => void) => void
  onDispose: (callback: () => void) => void
  command: (action: string, arg?: unknown) => void
  storage: {
    get: () => Promise<Record<string, unknown>>
    set: (value: unknown) => Promise<Record<string, unknown>>
    patch: (value: Record<string, unknown>) => Promise<Record<string, unknown>>
  }
  settings: {
    get: () => Promise<Record<string, unknown>>
    set: (patch: Record<string, unknown>) => Promise<Record<string, unknown>>
  }
}
