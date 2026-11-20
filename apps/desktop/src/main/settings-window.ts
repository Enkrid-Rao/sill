import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { BrowserWindow, screen } from 'electron'
import { getPanelWindow } from './panel'
import { loadSettings } from './settings'
import { USER_DATA_DIR } from './paths'

/**
 * 独立设置窗口。
 *
 * 与面板共用同一个 renderer 入口，通过 `?settings=1` 切到 SettingsWindow。
 * 它是普通窗口（不置顶、可拖动标题栏），位置尽量避开常驻置顶的面板。
 */
let win: BrowserWindow | null = null
let boundsTimer: NodeJS.Timeout | null = null

const SETTINGS_WINDOW_FILE = join(USER_DATA_DIR, 'settings-window.json')

interface WindowPosition {
  x: number
  y: number
}

function loadPosition(): WindowPosition | null {
  try {
    const raw = JSON.parse(readFileSync(SETTINGS_WINDOW_FILE, 'utf8')) as unknown
    if (!raw || typeof raw !== 'object') return null
    const item = raw as Record<string, unknown>
    const x = Number(item.x)
    const y = Number(item.y)
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null
    return { x: Math.round(x), y: Math.round(y) }
  } catch {
    return null
  }
}

function savePosition(bounds: Electron.Rectangle): void {
  try {
    mkdirSync(USER_DATA_DIR, { recursive: true })
    const tmp = `${SETTINGS_WINDOW_FILE}.tmp`
    writeFileSync(tmp, `${JSON.stringify({ x: bounds.x, y: bounds.y }, null, 2)}\n`, 'utf8')
    renameSync(tmp, SETTINGS_WINDOW_FILE)
  } catch (error) {
    console.error('[sill] 无法保存设置窗口位置：', error)
  }
}

function rememberPosition(target: BrowserWindow): void {
  if (boundsTimer) clearTimeout(boundsTimer)
  boundsTimer = setTimeout(() => {
    boundsTimer = null
    if (target.isDestroyed()) return
    savePosition(target.getBounds())
  }, 180)
}

function flushPosition(target: BrowserWindow): void {
  if (boundsTimer) {
    clearTimeout(boundsTimer)
    boundsTimer = null
  }
  if (!target.isDestroyed()) savePosition(target.getBounds())
}

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

  const saved = loadPosition()
  const display = saved
    ? screen.getDisplayNearestPoint(saved)
    : screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const area = display.workArea
  const width = Math.min(760, Math.max(480, area.width - 64))
  const height = Math.min(820, Math.max(480, area.height - 48))

  let x: number
  let y: number
  if (saved) {
    x = saved.x
    y = saved.y
  } else {
    x = area.x + Math.round((area.width - width) / 2)
    y = area.y + Math.round((area.height - height) / 2)

    // 面板常驻置顶，首次打开时设置窗口尽量落在它旁边的可用区域
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
  }
  x = Math.min(
    Math.max(area.x, area.x + area.width - width - 16),
    Math.max(area.x, x)
  )
  y = Math.min(
    Math.max(area.y, area.y + area.height - height - 16),
    Math.max(area.y, y)
  )

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

  created.on('move', () => rememberPosition(created))
  created.on('moved', () => rememberPosition(created))
  created.on('close', () => flushPosition(created))

  // close 后立刻又开一个新窗口时，旧窗口的 closed 事件不能把新引用清掉
  created.on('closed', () => {
    if (win !== created) return
    if (boundsTimer) {
      clearTimeout(boundsTimer)
      boundsTimer = null
    }
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
