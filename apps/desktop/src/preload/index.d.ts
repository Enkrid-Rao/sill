import type { PanelSnapshot, TodoItem } from '../shared/data'
import type { Language } from '../shared/i18n'
import type { PanelLayout, PanelShape } from '../shared/layout'
import type { Theme } from '../shared/theme'
import type { UpdateState } from '../shared/update'

export interface SillSettings {
  hotkey: string
  panelShape: PanelShape
  side: 'right' | 'left'
  edgeGap: number
  language: Language
  startAtLogin: boolean
  autoUpdate: boolean
  theme: Theme
}

export interface SillApi {
  getSettings: () => Promise<SillSettings>
  updateSettings: (patch: Partial<SillSettings>) => Promise<SillSettings>
  setHotkey: (accel: string) => Promise<{ ok: boolean; hotkey: string }>
  getVersion: () => Promise<string>
  getSnapshot: () => Promise<PanelSnapshot>
  listTodos: () => Promise<TodoItem[]>
  addTodo: (text: string) => Promise<TodoItem[]>
  toggleTodo: (id: string) => Promise<TodoItem[]>
  removeTodo: (id: string) => Promise<TodoItem[]>
  getUpdateState: () => Promise<UpdateState>
  checkForUpdates: () => Promise<UpdateState>
  onUpdateState: (callback: (state: UpdateState) => void) => () => void
  getLayout: () => Promise<PanelLayout>
  setLayout: (layout: PanelLayout) => Promise<PanelLayout>
  resetLayout: () => Promise<PanelLayout>
  hidePanel: () => Promise<void>
  togglePanel: () => Promise<void>
  setOverlayOpen: (open: boolean) => Promise<void>
  quit: () => Promise<void>
  onPanelState: (callback: (visible: boolean) => void) => () => void
  onEscape: (callback: () => void) => () => void
  versions: { electron: string; chrome: string }
}

declare global {
  interface Window {
    sill?: SillApi
  }
}

export {}
