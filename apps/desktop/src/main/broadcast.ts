import { BrowserWindow } from 'electron'

/** 把主进程的变更推给所有渲染窗口（面板 + 独立设置窗口） */
export function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue
    win.webContents.send(channel, payload)
  }
}
