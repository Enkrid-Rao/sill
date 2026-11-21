import { app, BrowserWindow, clipboard, dialog, ipcMain, shell, type OpenDialogOptions, type SaveDialogOptions } from 'electron'
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { broadcast } from './broadcast'
import { listBuiltinWidgets } from './builtin-widgets'
import { checkComponentUpdates, fetchCatalog, getComponentUpdates, invalidateCatalogCache } from './catalog'
import { diagnosticsText } from './diagnostics'
import { DEFAULTS } from './settings'
import { downloadPackage } from './widget-download'
import {
  isSillAssociation,
  registerSillAssociation,
  unregisterSillAssociation
} from './file-assoc'
import { getSnapshot, refreshDataCadence } from './data'
import { mediaCommand } from './data/media-control'
import { addShelfPaths, listShelf, openShelf, removeShelf } from './data/shelf'
import { addTodo, listTodos, removeTodo, restoreTodo, toggleTodo, updateTodo } from './data/todo'
import { getDevWidget } from './dev-widget'
import { COMPONENTS_DIR, getLayout, resetLayout, setLayout } from './layout'
import { ensureSkinsDir, SKINS_DIR } from './skins'
import { readWidgetData, writeWidgetData } from './widget-data'
import { readWidgetSettings, writeWidgetSettings } from './widget-settings'
import { afterWidgetsChanged, installWidgetFile } from './widget-install'
import { createWidgetFolder, idFromFolder, nameFromId } from './widget-scaffold'
import {
  getComponentDiagnostics,
  listInstalled,
  listSkins,
  loadInstalled,
  loadSkin,
  uninstallPackage
} from './widgets/package'
import {
  commitPanelSize,
  getPanelSizeLimits,
  getPanelWindow,
  hidePanel,
  beginLive,
  isLiveActive,
  isPanelVisible,
  requestBackdrop,
  setLiveActive,
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
import { refreshWeather, resetAutoLocation, getWeather } from './weather'

export interface IpcDeps {
  /** 设置变更后需要重新贴到系统上的副作用（自启、置顶、停靠边、托盘菜单） */
  apply: (settings: Settings, patch: Partial<Settings>) => void
  /** 换热键：试注册成功才写盘，失败保留旧键 */
  setHotkey: (accel: string) => { ok: boolean; hotkey: string }
}

export function registerIpc(deps: IpcDeps): void {
  ipcMain.handle('settings:get', () => loadSettings())
  ipcMain.handle('app:diagnostics', () => {
    const text = diagnosticsText()
    clipboard.writeText(text)
    return text
  })
  ipcMain.handle('app:reset-all', () => {
    const current = loadSettings()
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupDir = join(app.getPath('userData'), 'backups', `reset-${stamp}`)
    try {
      mkdirSync(backupDir, { recursive: true })
      for (const name of ['settings.json', 'layout.json', 'settings-window.json']) {
        const source = join(app.getPath('userData'), name)
        if (existsSync(source)) copyFileSync(source, join(backupDir, name))
      }
    } catch (error) {
      console.error('[sill] 重置前备份失败：', error)
    }
    rmSync(join(app.getPath('userData'), 'settings-window.json'), { force: true })
    const next = updateSettings({
      ...DEFAULTS,
      language: current.language,
      privacyAsked: current.privacyAsked,
      networkConsent: current.networkConsent,
      weatherNetwork: current.weatherNetwork
    })
    deps.apply(next, next)
    const layout = resetLayout()
    broadcast('layout:changed', layout)
    invalidateCatalogCache()
    broadcast('settings:changed', next)
    return { ok: true, backupDir }
  })
  ipcMain.handle('weather:refresh', async () => {
    resetAutoLocation()
    await refreshWeather()
    return getWeather()
  })

  ipcMain.handle('settings:update', (_event, patch: Partial<Settings>) => {
    const next = updateSettings(patch ?? {})
    deps.apply(next, patch ?? {})
    // 换城市 / 切回自动定位：不等 15 分钟，立刻重新取一次天气
    if ('weatherLocation' in (patch ?? {}) || 'weatherCustom' in (patch ?? {})) void refreshWeather()
    // 隐私同意 / 天气联网开关：立刻生效（关闭时只停请求，不清缓存）
    if (
      'networkConsent' in (patch ?? {}) ||
      'weatherNetwork' in (patch ?? {}) ||
      'privacyAsked' in (patch ?? {})
    ) {
      void refreshWeather()
    }
    // 监测间隔变了：当前可见的采样器立即换节拍
    if ('monitorIntervalMs' in (patch ?? {})) refreshDataCadence()
    if ('catalogSources' in (patch ?? {})) {
      invalidateCatalogCache()
      void checkComponentUpdates(true)
    }
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

  // 液态玻璃：渲染进程挂载时如果有缓存帧就直接拿，没有就顺手再抓一次
  ipcMain.handle('glass:request', () => requestBackdrop())
  // 实时档握手：先开 WDA 再开流
  ipcMain.handle('glass:begin-live', () => {
    beginLive()
    return true
  })
  ipcMain.handle('glass:live-active', (_event, active: unknown) => {
    setLiveActive(active === true)
  })
  ipcMain.handle('glass:live-status', () => isLiveActive())

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
  ipcMain.handle('widgets:builtins', () => listBuiltinWidgets())

  ipcMain.handle('widgets:preload', () => join(__dirname, '../preload/widget.js'))

  ipcMain.handle('widgets:list', () => {
    const seen = new Set<string>()
    return [...listInstalled(COMPONENTS_DIR), ...listSkins(SKINS_DIR)]
      .filter((item) => {
        if (seen.has(item.id)) return false
        seen.add(item.id)
        return true
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  })

  ipcMain.handle('widgets:load', (_event, id: unknown) => {
    if (typeof id !== 'string') return null
    return loadInstalled(COMPONENTS_DIR, id) ?? loadSkin(SKINS_DIR, id)
  })

  // Rainmeter 式：把组件文件夹直接摆进去，改完自动刷新
  ipcMain.handle('widgets:open-skins', async () => {
    ensureSkinsDir()
    return shell.openPath(SKINS_DIR)
  })

  // 哪些 skins / 已安装目录读不出来（manifest 坏、缺 index.html…）
  ipcMain.handle('widgets:diagnostics', () => getComponentDiagnostics(COMPONENTS_DIR, SKINS_DIR))

  // 设置 → 组件 → 新建组件：在 skins 里生成脚手架并打开文件夹
  ipcMain.handle('widgets:create', async (event) => {
    ensureSkinsDir()
    const win = BrowserWindow.fromWebContents(event.sender)
    const options: SaveDialogOptions = {
      title: '新建 Sill 组件',
      defaultPath: join(SKINS_DIR, 'my-widget'),
      buttonLabel: '创建',
      properties: ['createDirectory']
    }
    const picked = win
      ? await dialog.showSaveDialog(win, options)
      : await dialog.showSaveDialog(options)
    if (picked.canceled || !picked.filePath) return { ok: false, error: '已取消' }

    const target = resolve(picked.filePath)
    const id = idFromFolder(basename(target))
    if (!id) {
      return { ok: false, error: '文件夹名只能用小写字母、数字、点、下划线、短横线（2–64 字符）' }
    }
    const result = createWidgetFolder(target, 'template', id, nameFromId(id))
    if (result.ok) {
      afterWidgetsChanged()
      if (result.dir) void shell.openPath(result.dir)
    }
    return result
  })

  // 在资源管理器里打开组件目录（诊断列表用），只接受组件目录内的路径
  ipcMain.handle('widgets:reveal', (_event, dir: unknown) => {
    if (typeof dir !== 'string') return { ok: false, error: '无效路径' }
    const target = resolve(dir)
    const inside = (root: string): boolean => {
      const base = resolve(root)
      return target === base || target.startsWith(`${base}\\`) || target.startsWith(`${base}/`)
    }
    if (!inside(SKINS_DIR) && !inside(COMPONENTS_DIR)) {
      return { ok: false, error: '路径不在组件目录里' }
    }
    void shell.openPath(target)
    return { ok: true }
  })

  ipcMain.handle('widgets:data-get', (_event, id: unknown) =>
    typeof id === 'string' ? readWidgetData(id) : {}
  )

  ipcMain.handle('widgets:data-set', (_event, id: unknown, value: unknown) =>
    typeof id === 'string' ? writeWidgetData(id, value) : {}
  )

  ipcMain.handle('widgets:settings-get', (_event, id: unknown) => {
    if (typeof id !== 'string') return {}
    const payload = loadInstalled(COMPONENTS_DIR, id) ?? loadSkin(SKINS_DIR, id)
    return readWidgetSettings(id, payload?.settings ?? [])
  })

  ipcMain.handle('widgets:settings-set', (_event, id: unknown, values: unknown) => {
    if (typeof id !== 'string') return {}
    const payload = loadInstalled(COMPONENTS_DIR, id) ?? loadSkin(SKINS_DIR, id)
    if (!payload?.settings?.length) return {}
    const next = writeWidgetSettings(id, payload.settings, values)
    // 组件（模板 main.js / web guest）靠这个即时看到设置变化
    broadcast('widgets:settings-changed', { id, values: next })
    return next
  })

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
    return installWidgetFile(picked.filePaths[0], win)
  })

  ipcMain.handle('widgets:install-url', async (event, raw: unknown) => {
    const payload =
      typeof raw === 'string'
        ? { url: raw }
        : raw && typeof raw === 'object'
          ? (raw as { url?: unknown; sha256?: unknown })
          : null
    const url = typeof payload?.url === 'string' ? payload.url : ''
    if (!url.trim()) return { ok: false, error: '无效链接' }
    if (!loadSettings().networkConsent) {
      return { ok: false, error: '联网功能已关闭；请先在设置中开启。' }
    }
    const sha256 = typeof payload?.sha256 === 'string' ? payload.sha256 : undefined
    const win = BrowserWindow.fromWebContents(event.sender)
    const downloaded = await downloadPackage(url, sha256)
    if (!downloaded.ok || !downloaded.file) {
      return { ok: false, error: downloaded.error ?? '下载失败' }
    }
    try {
      return await installWidgetFile(downloaded.file, win)
    } finally {
      try {
        rmSync(downloaded.file, { force: true })
      } catch {
        // 临时文件清不掉不影响安装结果
      }
    }
  })

  ipcMain.handle('widgets:catalog', (_event, force: unknown) => fetchCatalog(force === true))
  ipcMain.handle('widgets:updates', () => getComponentUpdates())
  ipcMain.handle('widgets:check-updates', () => checkComponentUpdates(true))

  ipcMain.handle('widgets:assoc-get', async () => isSillAssociation())

  ipcMain.handle('widgets:assoc-set', async (_event, enabled: unknown) => {
    if (typeof enabled !== 'boolean') return { ok: false }
    try {
      if (enabled) await registerSillAssociation(app.getPath('exe'))
      else await unregisterSillAssociation()
      return { ok: true, enabled }
    } catch (error) {
      return { ok: false, error: String(error) }
    }
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
  ipcMain.handle('shelf:add-paths', (_event, paths: unknown) => {
    if (!Array.isArray(paths)) return listShelf()
    return addShelfPaths(
      paths.filter((path): path is string => typeof path === 'string').slice(0, 32)
    )
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


