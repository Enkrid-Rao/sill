/** 安装提示的档位：由包内容算出来，不由作者声明。 */
export type WidgetTier = 'static' | 'script' | 'isolated' | 'node'

export interface InstalledWidgetInfo {
  id: string
  name: string
  version: string
  author: string
  permissions: string[]
  span: number
  kind: 'template' | 'web'
  trust: 'sandboxed' | 'trusted'
  tier: WidgetTier
}

export interface InstallOutcome {
  ok: boolean
  error?: string
  widget?: InstalledWidgetInfo
  /** 覆盖了同 id 的旧版本（布局槽位保留）。 */
  upgraded?: boolean
  replacedVersion?: string
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

