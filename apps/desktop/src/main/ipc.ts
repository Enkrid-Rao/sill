import { app, ipcMain } from 'electron'
import { hidePanel, setOverlayOpen, togglePanel } from './panel'
import { loadSettings, updateSettings, type Settings } from './settings'

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
    return next
  })

  ipcMain.handle('hotkey:set', (_event, accel: unknown) => {
    if (typeof accel !== 'string') return { ok: false, hotkey: loadSettings().hotkey }
    return deps.setHotkey(accel)
  })

  ipcMain.handle('panel:hide', () => {
    hidePanel()
  })

  ipcMain.handle('panel:toggle', () => {
    togglePanel()
  })

  ipcMain.handle('panel:overlay', (_event, open: unknown) => {
    setOverlayOpen(open === true)
  })

  ipcMain.handle('app:version', () => app.getVersion())

  ipcMain.handle('app:quit', () => {
    app.quit()
  })
}
