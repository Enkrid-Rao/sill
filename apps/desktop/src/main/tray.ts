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
      {
        label: tr('tray.pinned'),
        type: 'checkbox',
        checked: current.pinned,
        click: (item) => actions.setPinned(item.checked)
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
