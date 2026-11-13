import { app, ipcMain } from 'electron'
import { hidePanel, setOverlayOpen, togglePanel } from './panel'
import { loadSettings, updateSettings, type Settings } from './settings'

export interface IpcDeps {
  /** 设置变更后需要重新贴到系统上的副作用（热键、自启、置顶、托盘菜单） */
  apply: (settings: Settings, patch: Partial<Settings>) => void
}

export function registerIpc(deps: IpcDeps): void {
  ipcMain.handle('settings:get', () => loadSettings())

  ipcMain.handle('settings:update', (_event, patch: Partial<Settings>) => {
    const next = updateSettings(patch ?? {})
    deps.apply(next, patch ?? {})
    return next
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

  ipcMain.handle('app:quit', () => {
    app.quit()
  })
}
