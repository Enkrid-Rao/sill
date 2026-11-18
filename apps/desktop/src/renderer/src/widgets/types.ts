import type { ReactNode } from 'react'
import type { MediaControlState, PanelSnapshot, TodoItem } from '../../../shared/data'
import type { Language, TranslationKey } from '../../../shared/i18n'

/**
 * 渲染层看到的组件上下文。
 *
 * 它是 App 与组件之间唯一的合同：组件不直接碰 IPC、不直接读 settings，
 * 只吃这份数据 + 回调。
 */
export interface WidgetContext {
  language: Language
  now: Date
  snapshot: PanelSnapshot | null
  todos: TodoItem[]
  mediaPosition: number
  mediaProgress: number
  mediaCommand: (
    action: 'playpause' | 'next' | 'prev' | 'mute' | 'volume',
    value?: number
  ) => Promise<MediaControlState | null>
  onAddTodo: (text: string) => Promise<void>
  onToggleTodo: (id: string) => Promise<void>
  onUpdateTodo: (id: string, text: string) => Promise<void>
  onRestoreTodo: (item: TodoItem, index: number) => Promise<void>
  onRemoveTodo: (id: string) => Promise<void>
}

export interface WidgetDefinition {
  id: string
  /** 内置组件的 i18n 名称 */
  nameKey?: TranslationKey
  /** 第三方组件自带的名字；优先于 nameKey */
  label?: string
  /** 额外的卡片 class（card--hero / card--grow） */
  className?: string
  /** 当前列数下默认跨几列；用户手动设过 spans 时以 layout 为准 */
  spanFor: (columns: number) => number
  render: (context: WidgetContext) => ReactNode
}
