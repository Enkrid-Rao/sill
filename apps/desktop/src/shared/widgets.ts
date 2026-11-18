export interface InstalledWidgetInfo {
  id: string
  name: string
  version: string
  author: string
  permissions: string[]
  span: number
  kind: 'template' | 'web'
  trust: 'sandboxed' | 'trusted'
}

export interface InstallOutcome {
  ok: boolean
  error?: string
  widget?: InstalledWidgetInfo
}
