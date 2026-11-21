import type { MediaControlState, PanelSnapshot, TodoItem } from '../shared/data'
import type { DevWidgetPayload } from '../shared/dev-widget'
import type { PanelOrigin } from '../shared/glass'
import type { Language } from '../shared/i18n'
import type { PanelLayout } from '../shared/layout'
import type { ShelfShortcut } from '../shared/shelf'
import type { WeatherCustomLocation } from '../shared/weather'
import type { Theme } from '../shared/theme'
import type { UninstallInfo, UninstallResult } from '../shared/uninstall'
import type { UpdateState } from '../shared/update'
import type {
  ComponentDiagnostics,
  CreateWidgetResult,
  InstallOutcome,
  InstalledWidgetInfo
} from '../shared/widgets'
import type { CatalogResult, CatalogUpdatesState } from '../shared/catalog'

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
  weatherCustom: WeatherCustomLocation | null
  privacyAsked: boolean
  networkConsent: boolean
  weatherNetwork: boolean
  lyricsOffsetMs: number
  catalogSources: string[]
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
  refreshWeather: () => Promise<unknown>
  setHotkey: (accel: string) => Promise<{ ok: boolean; hotkey: string }>
  getVersion: () => Promise<string>
  copyDiagnostics: () => Promise<string>
  resetAllSettings: () => Promise<{ ok: boolean; backupDir: string }>
  getDevWidget: () => Promise<DevWidgetPayload | null>
  getBuiltinWidgets: () => Promise<DevWidgetPayload[]>
  getWidgetPreload: () => Promise<string>
  getInstalledWidgets: () => Promise<InstalledWidgetInfo[]>
  getInstalledWidget: (id: string) => Promise<DevWidgetPayload | null>
  installWidget: () => Promise<InstallOutcome>
  installWidgetFromUrl: (url: string, sha256?: string) => Promise<InstallOutcome>
  getWidgetCatalog: (force?: boolean) => Promise<CatalogResult>
  getWidgetUpdates: () => Promise<CatalogUpdatesState>
  checkWidgetUpdates: () => Promise<CatalogUpdatesState>
  onWidgetUpdates: (callback: (state: CatalogUpdatesState) => void) => () => void
  uninstallWidget: (id: string) => Promise<InstallOutcome>
  openSkinsFolder: () => Promise<string>
  getComponentDiagnostics: () => Promise<ComponentDiagnostics>
  createWidget: () => Promise<CreateWidgetResult>
  revealComponentFolder: (dir: string) => Promise<{ ok: boolean; error?: string }>
  getSillAssociation: () => Promise<boolean>
  setSillAssociation: (enabled: boolean) => Promise<{ ok: boolean; enabled?: boolean; error?: string }>
  getWidgetData: (id: string) => Promise<Record<string, unknown>>
  setWidgetData: (id: string, value: unknown) => Promise<Record<string, unknown>>
  getWidgetSettings: (id: string) => Promise<Record<string, unknown>>
  setWidgetSettings: (id: string, values: unknown) => Promise<Record<string, unknown>>
  onWidgetSettingsChanged: (
    callback: (id: string, values: Record<string, unknown>) => void
  ) => () => void
  onWidgetsChanged: (callback: () => void) => () => void
  getUninstallInfo: () => Promise<UninstallInfo>
  openDataFolder: () => Promise<string>
  uninstall: (deleteData: boolean) => Promise<UninstallResult>
  getSnapshot: () => Promise<PanelSnapshot>
  onSnapshot: (callback: (snapshot: PanelSnapshot) => void) => () => void
  mediaCommand: (action: string, value?: number) => Promise<MediaControlState | null>
  listShelf: () => Promise<ShelfShortcut[]>
  addShelf: () => Promise<ShelfShortcut[]>
  addShelfPaths: (paths: string[]) => Promise<ShelfShortcut[]>
  getPathForFile: (file: File) => string
  removeShelf: (id: string) => Promise<ShelfShortcut[]>
  openShelf: (id: string) => Promise<{ ok: boolean; error?: string }>
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
  /** 液态玻璃：要一帧桌面快照（有缓存就直接给） */
  requestBackdrop: () => Promise<unknown>
  /** 实时档握手：先让主进程打开 WDA，再开屏幕流 */
  beginLive: () => Promise<boolean>
  /** 告诉主进程实时流到底跑起来没有（没跑起来就按静态帧的节奏补帧） */
  setLiveActive: (active: boolean) => Promise<void>
  getLiveActive: () => Promise<boolean>
  onBackdrop: (callback: (payload: unknown) => void) => () => void
  onPanelOrigin: (callback: (bounds: PanelOrigin) => void) => () => void
  setTyping: (active: boolean) => Promise<void>
  onEscapeInput: (callback: () => void) => () => void
  togglePanel: () => Promise<void>
  isPanelVisible: () => Promise<boolean>
  setOverlayOpen: (open: boolean) => Promise<void>
  resizePanel: (width: number, height: number) => Promise<PanelSizeInfo | null>
  commitPanelSize: (width?: number, height?: number) => Promise<SillSettings>
  getPanelSizeLimits: () => Promise<{ maxWidth: number; maxHeight: number; columns: number }>
  openSettingsWindow: () => Promise<void>
  onOpenSettings: (callback: () => void) => () => void
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



