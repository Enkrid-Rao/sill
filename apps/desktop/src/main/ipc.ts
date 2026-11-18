import { app, BrowserWindow, dialog, ipcMain, type MessageBoxOptions, type OpenDialogOptions } from 'electron'
import { join } from 'node:path'
import { broadcast } from './broadcast'
import { getSnapshot, refreshDataCadence } from './data'
import { mediaCommand } from './data/media-control'
import { addShelfPaths, listShelf, openShelf, removeShelf } from './data/shelf'
import { addTodo, listTodos, removeTodo, restoreTodo, toggleTodo, updateTodo } from './data/todo'
import { getDevWidget } from './dev-widget'
import { COMPONENTS_DIR, getLayout, invalidateLayout, resetLayout, setLayout } from './layout'
import {
  inspectPackage,
  installPackage,
  listInstalled,
  loadInstalled,
  uninstallPackage
} from './widgets/package'
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
import { getUninstallInfo, openDataFolder, startUninstall } from './uninstall'
import { checkForUpdates, downloadUpdate, getUpdateState, installUpdate } from './updates'
import { refreshWeather } from './weather'

export interface IpcDeps {
  /** 设置变更后需要重新贴到系统上的副作用（自启、置顶、停靠边、托盘菜单） */
  apply: (settings: Settings, patch: Partial<Settings>) => void
  /** 换热键：试注册成功才写盘，失败保留旧键 */
  setHotkey: (accel: string) => { ok: boolean; hotkey: string }
}

/** 组件安装/卸载后，布局与组件列表一起刷新。 */
function afterWidgetsChanged(): void {
  invalidateLayout()
  broadcast('widgets:changed', null)
  broadcast('layout:changed', getLayout())
}

export function registerIpc(deps: IpcDeps): void {
  ipcMain.handle('settings:get', () => loadSettings())

  ipcMain.handle('settings:update', (_event, patch: Partial<Settings>) => {
    const next = updateSettings(patch ?? {})
    deps.apply(next, patch ?? {})
    // 换城市 / 切回自动定位：不等 15 分钟，立刻重新取一次天气
    if ('weatherLocation' in (patch ?? {})) void refreshWeather()
    // 监测间隔变了：当前可见的采样器立即换节拍
    if ('monitorIntervalMs' in (patch ?? {})) refreshDataCadence()
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

  ipcMain.handle('app:uninstall-info', () => getUninstallInfo())

  ipcMain.handle('app:open-data-folder', () => openDataFolder())

  // 卸载会退出应用：先把 IPC 结果送回去，再让 helper 在退出后动手
  ipcMain.handle('app:uninstall', (_event, deleteData: unknown) => {
    const result = startUninstall(deleteData === true)
    if (result.ok) setTimeout(() => app.quit(), 900)
    return result
  })

  ipcMain.handle('data:snapshot', () => getSnapshot())

  // Spike: read SILL_DEV_WIDGET once. Returns null in a normal launch.
  ipcMain.handle('widgets:dev-get', () => getDevWidget())

  ipcMain.handle('widgets:preload', () => join(__dirname, '../preload/widget.js'))

  ipcMain.handle('widgets:list', () => listInstalled(COMPONENTS_DIR))

  ipcMain.handle('widgets:load', (_event, id: unknown) =>
    typeof id === 'string' ? loadInstalled(COMPONENTS_DIR, id) : null
  )

  ipcMain.handle('widgets:install', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const openOptions: OpenDialogOptions = {
      title: '安装 Sill 组件',
      properties: ['openFile'],
      filters: [{ name: 'Sill 组件', extensions: ['sill', 'zip'] }]
    }
    const picked = win
      ? await dialog.showOpenDialog(win, openOptions)
      : await dialog.showOpenDialog(openOptions)
    if (picked.canceled || !picked.filePaths[0]) return { ok: false, error: '已取消' }

    const inspected = inspectPackage(picked.filePaths[0])
    if (!inspected.ok || !inspected.widget) return inspected
    const widget = inspected.widget
    const permissions = widget.permissions.length ? widget.permissions.join('\n') : '无'
    const detail = [
      `id: ${widget.id}`,
      `版本: ${widget.version}`,
      `作者: ${widget.author}`,
      `类型: ${widget.kind === 'web' ? 'web' : 'template'}`,
      `信任: ${
        widget.trust === 'trusted'
          ? '完全信任（可读写文件、执行命令、访问网络）'
          : '沙箱（只通过组件桥）'
      }`,
      `权限: ${permissions}`,
      '',
      widget.trust === 'trusted'
        ? '这个组件拥有和 Sill 相同的本机权限。只安装你信任的来源。'
        : '只安装你信任的组件。'
    ].join('\n')
    const confirmOptions: MessageBoxOptions = {
      type: 'question',
      title: '安装组件',
      message: `${widget.name} ${widget.version}`,
      detail,
      buttons: ['安装', '取消'],
      defaultId: 0,
      cancelId: 1,
      noLink: true
    }
    const confirmed = win
      ? await dialog.showMessageBox(win, confirmOptions)
      : await dialog.showMessageBox(confirmOptions)
    if (confirmed.response !== 0) return { ok: false, error: '已取消' }

    const result = installPackage(picked.filePaths[0], COMPONENTS_DIR)
    if (result.ok) afterWidgetsChanged()
    return result
  })

  ipcMain.handle('widgets:uninstall', (_event, id: unknown) => {
    if (typeof id !== 'string') return { ok: false, error: '无效的组件 id' }
    const result = uninstallPackage(COMPONENTS_DIR, id)
    if (result.ok) afterWidgetsChanged()
    return result
  })

  ipcMain.handle('shelf:list', () => listShelf())
  ipcMain.handle('shelf:add', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options: OpenDialogOptions = {
      title: '添加快捷方式',
      properties: ['openFile', 'multiSelections']
    }
    const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (picked.canceled) return listShelf()
    return addShelfPaths(picked.filePaths)
  })
  ipcMain.handle('shelf:remove', (_event, id: unknown) =>
    typeof id === 'string' ? removeShelf(id) : listShelf()
  )
  ipcMain.handle('shelf:open', (_event, id: unknown) =>
    typeof id === 'string' ? openShelf(id) : { ok: false, error: '无效 id' }
  )

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
  ipcMain.handle('update:download', async () => {
    const next = await downloadUpdate()
    broadcast('update:state', next)
    return next
  })
  ipcMain.handle('update:install', () => installUpdate())

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
