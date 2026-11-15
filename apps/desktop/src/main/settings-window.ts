import { join } from 'node:path'
import { BrowserWindow, screen } from 'electron'
import { getPanelWindow } from './panel'
import { loadSettings } from './settings'

/**
 * 独立设置窗口。
 *
 * 与面板共用同一个 renderer 入口，通过 `?settings=1` 切到 SettingsWindow。
 * 它是普通窗口（不置顶、可拖动标题栏），位置尽量避开常驻置顶的面板。
 */
let win: BrowserWindow | null = null

/**
 * 设置窗口打开期间把面板从 screen-saver 层放下来，
 * 否则面板变宽后会直接盖住设置窗口（面板是置顶的）。
 */
function suspendPanelTop(): void {
  getPanelWindow()?.setAlwaysOnTop(false)
}

function restorePanelTop(): void {
  const panel = getPanelWindow()
  if (panel) panel.setAlwaysOnTop(true, 'screen-saver')
}

export function hasSettingsWindow(): boolean {
  return Boolean(win && !win.isDestroyed())
}

export function openSettingsWindow(): BrowserWindow {
  if (win && !win.isDestroyed()) {
    win.show()
    win.focus()
    return win
  }

  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const area = display.workArea
  const width = Math.min(760, Math.max(480, area.width - 64))
  const height = Math.min(820, Math.max(480, area.height - 48))

  // 面板常驻置顶，设置窗口尽量落在它旁边的可用区域
  let x = area.x + Math.round((area.width - width) / 2)
  const panel = getPanelWindow()
  if (panel?.isVisible()) {
    const pb = panel.getContentBounds()
    const side = loadSettings().side
    if (side === 'right') {
      const free = pb.x - area.x
      x = area.x + Math.round((free - width) / 2)
    } else {
      const freeStart = pb.x + pb.width
      const free = area.x + area.width - freeStart
      x = freeStart + Math.round((free - width) / 2)
    }
  }
  x = Math.min(area.x + area.width - width - 16, Math.max(area.x + 16, x))
  const y = area.y + Math.round((area.height - height) / 2)

  win = new BrowserWindow({
    x,
    y,
    width,
    height,
    useContentSize: true,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: false,
    roundedCorners: false,
    skipTaskbar: false,
    title: loadSettings().language === 'zh' ? 'Sill 设置' : 'Sill Settings',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: true
    }
  })
  const created = win

  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) {
    void created.loadURL(`${devUrl}?settings=1`)
  } else {
    void created.loadFile(join(__dirname, '../renderer/index.html'), { query: { settings: '1' } })
  }

  created.once('ready-to-show', () => {
    if (created.isDestroyed() || win !== created) return
    created.show()
    created.focus()
  })

  // close 后立刻又开一个新窗口时，旧窗口的 closed 事件不能把新引用清掉
  created.on('closed', () => {
    if (win !== created) return
    win = null
    restorePanelTop()
  })

  suspendPanelTop()
  return created
}

export function closeSettingsWindow(): void {
  if (!win || win.isDestroyed()) {
    win = null
    restorePanelTop()
    return
  }
  win.close()
  win = null
  restorePanelTop()
}
