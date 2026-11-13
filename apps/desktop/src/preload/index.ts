import { contextBridge, ipcRenderer } from 'electron'

/**
 * 渲染进程只能看到这一层 API。
 * 没有 fs、没有 require、没有 Node —— 面板里跑的东西一律通过 IPC 要数据。
 */
const api = {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch: unknown) => ipcRenderer.invoke('settings:update', patch),
  hidePanel: () => ipcRenderer.invoke('panel:hide'),
  togglePanel: () => ipcRenderer.invoke('panel:toggle'),
  setOverlayOpen: (open: boolean) => ipcRenderer.invoke('panel:overlay', Boolean(open)),
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
