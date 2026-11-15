import { app } from 'electron'
import { IS_PORTABLE, PORTABLE_EXECUTABLE } from './paths'

/**
 * 开机自启。开发态需要显式给 path + args，否则注册的是 electron.exe 本身。
 * 便携版必须注册原始 portable exe，不能注册临时解压目录里的进程。
 */
export function applyAutostart(enabled: boolean): void {
  try {
    if (app.isPackaged) {
      if (IS_PORTABLE && PORTABLE_EXECUTABLE) {
        app.setLoginItemSettings({ openAtLogin: enabled, path: PORTABLE_EXECUTABLE })
        return
      }
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
