import { app } from 'electron'

/**
 * 开机自启。开发态需要显式给 path + args，否则注册的是 electron.exe 本身。
 * 打包后 Electron 自己知道路径，不要覆盖。
 */
export function applyAutostart(enabled: boolean): void {
  try {
    if (app.isPackaged) {
      app.setLoginItemSettings({ openAtLogin: enabled })
      return
    }
    app.setLoginItemSettings({
      openAtLogin: enabled,
      path: process.execPath,
      args: [app.getAppPath()]
    })
  } catch (error) {
    console.error('[sill] 开机自启设置失败：', error)
  }
}
