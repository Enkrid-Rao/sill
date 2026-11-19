/** 安装提示的档位：由包内容算出来，不由作者声明。 */
export type WidgetTier = 'static' | 'script' | 'isolated' | 'node'

export type WidgetSettingType = 'text' | 'number' | 'switch' | 'select'

export interface WidgetSettingOption {
  value: string
  /** 纯文本，或 { en, zh } 文案表。 */
  label?: string | Record<string, string>
}

/** widget.json 里声明的组件设置项；宿主渲染成表单，值存在 widget-settings/<id>.json。 */
export interface WidgetSettingField {
  key: string
  type: WidgetSettingType
  label?: string | Record<string, string>
  description?: string | Record<string, string>
  default?: string | number | boolean
  placeholder?: string
  min?: number
  max?: number
  options?: WidgetSettingOption[]
}

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
  settings: WidgetSettingField[]
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

