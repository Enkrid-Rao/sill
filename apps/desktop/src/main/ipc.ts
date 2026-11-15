import { app, ipcMain } from 'electron'
import { broadcast } from './broadcast'
import { getSnapshot } from './data'
import { mediaCommand } from './data/media-control'
import { addTodo, listTodos, removeTodo, restoreTodo, toggleTodo, updateTodo } from './data/todo'
import { getLayout, resetLayout, setLayout } from './layout'
import {
  commitPanelSize,
  getPanelSizeLimits,
  getPanelWindow,
  hidePanel,
  isPanelVisible,
  resizePanel,
  setOverlayOpen,
  setTyping,
  showPanel,
  togglePanel
} from './panel'
import { loadSettings, updateSettings, type Settings } from './settings'
import { closeSettingsWindow, hasSettingsWindow, openSettingsWindow } from './settings-window'
import { checkForUpdates, getUpdateState } from './updates'
import { refreshWeather } from './weather'

export interface IpcDeps {
  /** 设置变更后需要重新贴到系统上的副作用（自启、置顶、停靠边、托盘菜单） */
  apply: (settings: Settings, patch: Partial<Settings>) => void
  /** 换热键：试注册成功才写盘，失败保留旧键 */
  setHotkey: (accel: string) => { ok: boolean; hotkey: string }
}

export function registerIpc(deps: IpcDeps): void {
  ipcMain.handle('settings:get', () => loadSettings())

  ipcMain.handle('settings:update', (_event, patch: Partial<Settings>) => {
    const next = updateSettings(patch ?? {})
    deps.apply(next, patch ?? {})
    // 换城市 / 切回自动定位：不等 15 分钟，立刻重新取一次天气
    if ('weatherLocation' in (patch ?? {})) void refreshWeather()
    // 设置窗口和面板共用一份状态：谁改的都广播出去
    broadcast('settings:changed', next)
    return next
  })

  ipcMain.handle('hotkey:set', (_event, accel: unknown) => {
    if (typeof accel !== 'string') return { ok: false, hotkey: loadSettings().hotkey }
    const result = deps.setHotkey(accel)
    if (result.ok) broadcast('settings:changed', loadSettings())
    return result
  })

  ipcMain.handle('settings:open-window', () => {
    openSettingsWindow()
  })

  ipcMain.handle('settings:window-open', () => hasSettingsWindow())

  ipcMain.handle('settings:close-window', () => {
    closeSettingsWindow()
  })

  // 设置窗口里的「编辑布局」：关掉设置窗口、唤出面板、进入编辑态
  ipcMain.handle('panel:edit-layout', () => {
    closeSettingsWindow()
    showPanel()
    getPanelWindow()?.webContents.send('panel:edit-layout')
  })

  ipcMain.handle('panel:hide', () => {
    hidePanel()
  })

  ipcMain.handle('panel:toggle', () => {
    togglePanel()
  })

  // 渲染进程挂载时问一次：如果在它监听 panel:state 之前面板已经唤出，事件会丢
  ipcMain.handle('panel:visible', () => isPanelVisible())

  ipcMain.handle('panel:overlay', (_event, open: unknown) => {
    setOverlayOpen(open === true)
  })

  ipcMain.handle('panel:typing', (_event, active: unknown) => {
    setTyping(active === true)
  })

  // 拖拽把手：实时改窗口尺寸（不写盘），松手后再 commit 一次
  ipcMain.handle('panel:resize', (_event, width: unknown, height: unknown) =>
    resizePanel(width, height)
  )
  ipcMain.handle('panel:resize-commit', (_event, width: unknown, height: unknown) => {
    const next = commitPanelSize(width, height)
    broadcast('settings:changed', next)
    return next
  })
  ipcMain.handle('panel:limits', () => getPanelSizeLimits())

  ipcMain.handle('media:command', (_event, action: unknown, value?: unknown) =>
    mediaCommand(action, value)
  )

  ipcMain.handle('app:version', () => app.getVersion())

  ipcMain.handle('data:snapshot', () => getSnapshot())

  ipcMain.handle('todo:list', () => listTodos())
  ipcMain.handle('todo:add', (_event, text: unknown) =>
    typeof text === 'string' ? addTodo(text) : listTodos()
  )
  ipcMain.handle('todo:toggle', (_event, id: unknown) =>
    typeof id === 'string' ? toggleTodo(id) : listTodos()
  )
  ipcMain.handle('todo:update', (_event, id: unknown, text: unknown) =>
    typeof id === 'string' && typeof text === 'string' ? updateTodo(id, text) : listTodos()
  )
  ipcMain.handle('todo:restore', (_event, item: unknown, index: unknown) =>
    restoreTodo(item, index)
  )
  ipcMain.handle('todo:remove', (_event, id: unknown) =>
    typeof id === 'string' ? removeTodo(id) : listTodos()
  )

  ipcMain.handle('update:get', () => getUpdateState())
  ipcMain.handle('update:check', async () => {
    const next = await checkForUpdates()
    broadcast('update:state', next)
    return next
  })

  ipcMain.handle('layout:get', () => getLayout())
  ipcMain.handle('layout:set', (_event, layout: unknown) => {
    const next = setLayout(layout)
    broadcast('layout:changed', next)
    return next
  })
  ipcMain.handle('layout:reset', () => {
    const next = resetLayout()
    broadcast('layout:changed', next)
    return next
  })

  ipcMain.handle('app:quit', () => {
    app.quit()
  })
}
