import { join } from 'node:path'
import { Menu, Tray, app, nativeImage, shell } from 'electron'
import { RESOURCES_DIR, SETTINGS_FILE } from './paths'
import { loadSettings } from './settings'

let tray: Tray | null = null
let rebuild: () => void = () => {}

interface TrayActions {
  toggle: () => void
  setSide: (side: 'left' | 'right') => void
  setAutostart: (enabled: boolean) => void
  setPinned: (pinned: boolean) => void
}

function icon(): Electron.NativeImage {
  const ico = nativeImage.createFromPath(join(RESOURCES_DIR, 'tray.ico'))
  const image = ico.isEmpty() ? nativeImage.createFromPath(join(RESOURCES_DIR, 'tray.png')) : ico
  if (image.isEmpty()) console.error('[sill] 托盘图标为空，检查 RESOURCES_DIR：', RESOURCES_DIR)
  return image
}

export function createTray(actions: TrayActions): Tray {
  rebuild = () => {
    if (!tray) return
    const current = loadSettings()
    const menu = Menu.buildFromTemplate([
      { label: `sill · ${current.hotkey}`, enabled: false },
      { type: 'separator' },
      { label: current.hotkey === '' ? '显示面板' : `显示 / 隐藏（${current.hotkey}）`, click: actions.toggle },
      { type: 'separator' },
      {
        label: '从左侧滑出',
        type: 'checkbox',
        checked: current.side === 'left',
        click: (item) => actions.setSide(item.checked ? 'left' : 'right')
      },
      {
        label: '开机自启',
        type: 'checkbox',
        checked: current.startAtLogin,
        click: (item) => actions.setAutostart(item.checked)
      },
      {
        label: '置顶',
        type: 'checkbox',
        checked: current.pinned,
        click: (item) => actions.setPinned(item.checked)
      },
      { type: 'separator' },
      { label: '打开设置文件', click: () => void shell.openPath(SETTINGS_FILE) },
      { type: 'separator' },
      { label: '退出', click: () => app.quit() }
    ])
    tray.setContextMenu(menu)
    tray.setToolTip(`sill · ${current.hotkey}`)
  }

  tray = new Tray(icon())
  tray.on('click', actions.toggle)
  rebuild()

  return tray
}

export function refreshTray(): void {
  rebuild()
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}
