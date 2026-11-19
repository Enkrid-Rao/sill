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

/** skins / components 里读取失败的目录：给「设置 → 组件」展示，开发时能看见哪里写错了。 */
export interface ComponentProblem {
  source: 'skins' | 'installed'
  folder: string
  dir: string
  error: string
}

export interface ComponentDiagnostics {
  skins: number
  installed: number
  problems: ComponentProblem[]
}

export interface CreateWidgetResult {
  ok: boolean
  error?: string
  id?: string
  dir?: string
}

