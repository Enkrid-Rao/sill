interface SillWidgetPayload {
  data: Record<string, unknown>
  language: 'zh' | 'en'
  tokens: Record<string, string>
}

interface Window {
  sill: {
    ready: (callback: (payload: SillWidgetPayload) => void) => void
    onData: (callback: (payload: SillWidgetPayload) => void) => void
    command: (action: string, arg?: unknown) => void
  }
}
