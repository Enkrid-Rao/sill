import type { MediaControlState, PanelSnapshot, TodoItem } from '../shared/data'
import type { Language } from '../shared/i18n'
import type { PanelLayout } from '../shared/layout'
import type { Theme } from '../shared/theme'
import type { UpdateState } from '../shared/update'

export interface SillSettings {
  hotkey: string
  panelWidth: number
  /** 0 = 撑满可用高度 */
  panelHeight: number
  panelOffsetY: number
  side: 'right' | 'left'
  edgeGap: number
  language: Language
  startAtLogin: boolean
  autoUpdate: boolean
  settingsInWindow: boolean
  weatherLocation: string
  monitorIntervalMs: number
  theme: Theme
}

export interface PanelSizeInfo {
  width: number
  height: number
  maxWidth: number
  maxHeight: number
}

export interface SillApi {
  getSettings: () => Promise<SillSettings>
  updateSettings: (patch: Partial<SillSettings>) => Promise<SillSettings>
  setHotkey: (accel: string) => Promise<{ ok: boolean; hotkey: string }>
  getVersion: () => Promise<string>
  getSnapshot: () => Promise<PanelSnapshot>
  onSnapshot: (callback: (snapshot: PanelSnapshot) => void) => () => void
  mediaCommand: (action: string, value?: number) => Promise<MediaControlState | null>
  listTodos: () => Promise<TodoItem[]>
  addTodo: (text: string) => Promise<TodoItem[]>
  toggleTodo: (id: string) => Promise<TodoItem[]>
  updateTodo: (id: string, text: string) => Promise<TodoItem[]>
  restoreTodo: (item: TodoItem, index: number) => Promise<TodoItem[]>
  removeTodo: (id: string) => Promise<TodoItem[]>
  getUpdateState: () => Promise<UpdateState>
  checkForUpdates: () => Promise<UpdateState>
  downloadUpdate: () => Promise<UpdateState>
  installUpdate: () => Promise<boolean>
  onUpdateState: (callback: (state: UpdateState) => void) => () => void
  getLayout: () => Promise<PanelLayout>
  setLayout: (layout: PanelLayout) => Promise<PanelLayout>
  resetLayout: () => Promise<PanelLayout>
  onSettingsChanged: (callback: (settings: SillSettings) => void) => () => void
  onLayoutChanged: (callback: (layout: PanelLayout) => void) => () => void
  hidePanel: () => Promise<void>
  setTyping: (active: boolean) => Promise<void>
  onEscapeInput: (callback: () => void) => () => void
  togglePanel: () => Promise<void>
  isPanelVisible: () => Promise<boolean>
  setOverlayOpen: (open: boolean) => Promise<void>
  resizePanel: (width: number, height: number) => Promise<PanelSizeInfo | null>
  commitPanelSize: (width?: number, height?: number) => Promise<SillSettings>
  getPanelSizeLimits: () => Promise<{ maxWidth: number; maxHeight: number; columns: number }>
  openSettingsWindow: () => Promise<void>
  isSettingsWindowOpen: () => Promise<boolean>
  closeSettingsWindow: () => Promise<void>
  editLayout: () => Promise<void>
  onEditLayout: (callback: () => void) => () => void
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
