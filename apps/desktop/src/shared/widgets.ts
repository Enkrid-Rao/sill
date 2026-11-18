export interface InstalledWidgetInfo {
  id: string
  name: string
  version: string
  author: string
  permissions: string[]
  span: number
}

export interface InstallOutcome {
  ok: boolean
  error?: string
  widget?: InstalledWidgetInfo
}
