import { join } from 'node:path'
import { Menu, Tray, app, nativeImage, shell } from 'electron'
import { t } from '../shared/i18n'
import { RESOURCES_DIR, SETTINGS_FILE } from './paths'
import { loadSettings } from './settings'

let tray: Tray | null = null
let rebuild: () => void = () => {}

interface TrayActions {
  toggle: () => void
  setSide: (side: 'left' | 'right') => void
  setAutostart: (enabled: boolean) => void
  openSettings: () => void
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
    const tr = (key: Parameters<typeof t>[1]): string => t(current.language, key)
    const menu = Menu.buildFromTemplate([
      { label: `sill · ${current.hotkey}`, enabled: false },
      { type: 'separator' },
      { label: `${tr('tray.showHide')} · ${current.hotkey}`, click: actions.toggle },
      { type: 'separator' },
      {
        label: tr('tray.slideLeft'),
        type: 'checkbox',
        checked: current.side === 'left',
        click: (item) => actions.setSide(item.checked ? 'left' : 'right')
      },
      {
        label: tr('tray.autostart'),
        type: 'checkbox',
        checked: current.startAtLogin,
        click: (item) => actions.setAutostart(item.checked)
      },
      { type: 'separator' },
      { label: tr('tray.settings'), click: () => void shell.openPath(SETTINGS_FILE) },
      { type: 'separator' },
      { label: tr('tray.quit'), click: () => app.quit() }
    ])
    tray.setContextMenu(menu)
    tray.setToolTip(`sill · ${current.hotkey}`)
  }

  tray = new Tray(icon())
  tray.on('click', actions.toggle)
  // 更新提醒的气泡：点一下直接打开设置
  tray.on('balloon-click', () => actions.openSettings())
  rebuild()

  return tray
}

/** Windows 托盘气泡：面板收着、用户没开设置时也能看到更新提醒。 */
export function notifyUpdate(title: string, content: string): void {
  if (!tray || tray.isDestroyed()) return
  try {
    tray.displayBalloon({ title, content, iconType: 'info', respectQuietTime: true })
  } catch (error) {
    console.error('[sill] 无法显示更新提醒：', error)
  }
}

export function refreshTray(): void {
  rebuild()
}

/** 托盘图标在屏幕上的矩形；外部点击监视器用它排除托盘点击 */
export function getTrayBounds(): Electron.Rectangle | null {
  if (!tray || tray.isDestroyed()) return null
  return tray.getBounds()
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}
