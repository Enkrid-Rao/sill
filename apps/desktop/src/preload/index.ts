import { contextBridge, ipcRenderer } from 'electron'
import type { TodoItem } from '../shared/data'

/**
 * 渲染进程只能看到这一层 API。
 * 没有 fs、没有 require、没有 Node —— 面板里跑的东西一律通过 IPC 要数据。
 */
const api = {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch: unknown) => ipcRenderer.invoke('settings:update', patch),
  setHotkey: (accel: string) => ipcRenderer.invoke('hotkey:set', accel),
  getVersion: () => ipcRenderer.invoke('app:version'),
  getDevWidget: () => ipcRenderer.invoke('widgets:dev-get'),
  getBuiltinWidgets: () => ipcRenderer.invoke('widgets:builtins'),
  getWidgetPreload: () => ipcRenderer.invoke('widgets:preload'),
  getInstalledWidgets: () => ipcRenderer.invoke('widgets:list'),
  getInstalledWidget: (id: string) => ipcRenderer.invoke('widgets:load', id),
  installWidget: () => ipcRenderer.invoke('widgets:install'),
  installWidgetFromUrl: (url: string) => ipcRenderer.invoke('widgets:install-url', url),
  getWidgetCatalog: (force?: boolean) => ipcRenderer.invoke('widgets:catalog', force === true),
  getWidgetUpdates: () => ipcRenderer.invoke('widgets:updates'),
  checkWidgetUpdates: () => ipcRenderer.invoke('widgets:check-updates'),
  onWidgetUpdates: (callback: (state: unknown) => void) => {
    const listener = (_event: unknown, state: unknown) => callback(state)
    ipcRenderer.on('widgets:updates', listener)
    return () => ipcRenderer.removeListener('widgets:updates', listener)
  },
  uninstallWidget: (id: string) => ipcRenderer.invoke('widgets:uninstall', id),
  openSkinsFolder: () => ipcRenderer.invoke('widgets:open-skins'),
  getComponentDiagnostics: () => ipcRenderer.invoke('widgets:diagnostics'),
  createWidget: () => ipcRenderer.invoke('widgets:create'),
  revealComponentFolder: (dir: string) => ipcRenderer.invoke('widgets:reveal', dir),
  getSillAssociation: () => ipcRenderer.invoke('widgets:assoc-get'),
  setSillAssociation: (enabled: boolean) => ipcRenderer.invoke('widgets:assoc-set', enabled),
  getWidgetData: (id: string) => ipcRenderer.invoke('widgets:data-get', id),
  setWidgetData: (id: string, value: unknown) =>
    ipcRenderer.invoke('widgets:data-set', id, value),
  getWidgetSettings: (id: string) => ipcRenderer.invoke('widgets:settings-get', id),
  setWidgetSettings: (id: string, values: unknown) =>
    ipcRenderer.invoke('widgets:settings-set', id, values),
  onWidgetSettingsChanged: (
    callback: (id: string, values: Record<string, unknown>) => void
  ) => {
    const listener = (
      _event: unknown,
      payload: { id: string; values: Record<string, unknown> }
    ) => callback(payload?.id, payload?.values ?? {})
    ipcRenderer.on('widgets:settings-changed', listener)
    return () => ipcRenderer.removeListener('widgets:settings-changed', listener)
  },
  onWidgetsChanged: (callback: () => void) => {
    const listener = (): void => callback()
    ipcRenderer.on('widgets:changed', listener)
    return () => ipcRenderer.removeListener('widgets:changed', listener)
  },
  getUninstallInfo: () => ipcRenderer.invoke('app:uninstall-info'),
  openDataFolder: () => ipcRenderer.invoke('app:open-data-folder'),
  uninstall: (deleteData: boolean) => ipcRenderer.invoke('app:uninstall', deleteData),
  getSnapshot: () => ipcRenderer.invoke('data:snapshot'),
  onSnapshot: (callback: (snapshot: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, snapshot: unknown): void =>
      callback(snapshot)
    ipcRenderer.on('data:changed', listener)
    return () => ipcRenderer.removeListener('data:changed', listener)
  },
  mediaCommand: (action: string, value?: number) => ipcRenderer.invoke('media:command', action, value),
  listShelf: () => ipcRenderer.invoke('shelf:list'),
  addShelf: () => ipcRenderer.invoke('shelf:add'),
  removeShelf: (id: string) => ipcRenderer.invoke('shelf:remove', id),
  openShelf: (id: string) => ipcRenderer.invoke('shelf:open', id),
  listTodos: () => ipcRenderer.invoke('todo:list'),
  addTodo: (text: string) => ipcRenderer.invoke('todo:add', text),
  toggleTodo: (id: string) => ipcRenderer.invoke('todo:toggle', id),
  updateTodo: (id: string, text: string) => ipcRenderer.invoke('todo:update', id, text),
  restoreTodo: (item: TodoItem, index: number) => ipcRenderer.invoke('todo:restore', item, index),
  removeTodo: (id: string) => ipcRenderer.invoke('todo:remove', id),
  getUpdateState: () => ipcRenderer.invoke('update:get'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  getLayout: () => ipcRenderer.invoke('layout:get'),
  setLayout: (layout: unknown) => ipcRenderer.invoke('layout:set', layout),
  resetLayout: () => ipcRenderer.invoke('layout:reset'),
  onSettingsChanged: (callback: (settings: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, settings: unknown): void =>
      callback(settings)
    ipcRenderer.on('settings:changed', listener)
    return () => ipcRenderer.removeListener('settings:changed', listener)
  },
  onLayoutChanged: (callback: (layout: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, layout: unknown): void => callback(layout)
    ipcRenderer.on('layout:changed', listener)
    return () => ipcRenderer.removeListener('layout:changed', listener)
  },
  onUpdateState: (callback: (state: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: unknown): void => callback(state)
    ipcRenderer.on('update:state', listener)
    return () => ipcRenderer.removeListener('update:state', listener)
  },
  hidePanel: () => ipcRenderer.invoke('panel:hide'),
  setTyping: (active: boolean) => ipcRenderer.invoke('panel:typing', active),
  onEscapeInput: (callback: () => void) => {
    const listener = (): void => callback()
    ipcRenderer.on('panel:escape-input', listener)
    return () => ipcRenderer.removeListener('panel:escape-input', listener)
  },
  togglePanel: () => ipcRenderer.invoke('panel:toggle'),
  isPanelVisible: () => ipcRenderer.invoke('panel:visible'),
  setOverlayOpen: (open: boolean) => ipcRenderer.invoke('panel:overlay', Boolean(open)),
  resizePanel: (width: number, height: number) =>
    ipcRenderer.invoke('panel:resize', width, height),
  commitPanelSize: (width?: number, height?: number) =>
    ipcRenderer.invoke('panel:resize-commit', width, height),
  getPanelSizeLimits: () => ipcRenderer.invoke('panel:limits'),
  openSettingsWindow: () => ipcRenderer.invoke('settings:open-window'),
  isSettingsWindowOpen: () => ipcRenderer.invoke('settings:window-open'),
  closeSettingsWindow: () => ipcRenderer.invoke('settings:close-window'),
  editLayout: () => ipcRenderer.invoke('panel:edit-layout'),
  onEditLayout: (callback: () => void) => {
    const listener = (): void => callback()
    ipcRenderer.on('panel:edit-layout', listener)
    return () => ipcRenderer.removeListener('panel:edit-layout', listener)
  },
  quit: () => ipcRenderer.invoke('app:quit'),
  onPanelState: (callback: (visible: boolean) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, visible: boolean): void => callback(visible)
    ipcRenderer.on('panel:state', listener)
    return () => ipcRenderer.removeListener('panel:state', listener)
  },
  onEscape: (callback: () => void) => {
    const listener = (): void => callback()
    ipcRenderer.on('panel:escape', listener)
    return () => ipcRenderer.removeListener('panel:escape', listener)
  },
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome
  }
}

contextBridge.exposeInMainWorld('sill', api)

export type SillApi = typeof api
