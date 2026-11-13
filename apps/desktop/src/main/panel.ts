import { join } from 'node:path'
import { BrowserWindow, screen, shell } from 'electron'
import { bindEscape, unbindEscape } from './hotkey'
import { loadSettings, updateSettings } from './settings'

const PANEL_MARGIN = 30
const PANEL_VERTICAL_MARGIN = 100
const MAX_HEIGHT = 900
const SLIDE_IN_MS = 240
const SLIDE_OUT_MS = 160
const TICK_MS = 10

let panel: BrowserWindow | null = null
let visible = false
let ticker: NodeJS.Timeout | null = null
/** 面板里是否盖着一层自绘表面（Customize）；此时 Esc 先交给它关自己 */
let overlayOpen = false

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** 停靠位：鼠标所在屏的右侧（或左侧），上下各留 PANEL_VERTICAL_MARGIN */
function targetBounds(): Rect {
  const settings = loadSettings()
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const area = display.workArea
  const width = settings.panelWidth
  const height = Math.min(area.height - PANEL_VERTICAL_MARGIN * 2, MAX_HEIGHT)
  const y = area.y + Math.round((area.height - height) / 2)
  const x = settings.side === 'left'
    ? area.x + PANEL_MARGIN
    : area.x + area.width - width - PANEL_MARGIN

  return { x, y, width, height }
}

/** 屏幕外一屏宽的位置：动画的起点/终点 */
function offscreenX(target: Rect, side: 'left' | 'right'): number {
  return side === 'left' ? target.x - target.width : target.x + target.width
}

function stopTicker(): void {
  if (ticker) {
    clearTimeout(ticker)
    ticker = null
  }
}

/**
 * 只移动窗口的 x，不改变尺寸 —— 内容不做位移，
 * 所以玻璃永远不会被窗口边界裁切；观感是「整块玻璃从屏幕外滑进来」。
 */
function slideTo(fromX: number, to: Rect, duration: number, done?: () => void): void {
  stopTicker()
  const start = performance.now()
  const run = (): void => {
    if (!panel || panel.isDestroyed()) return
    const t = Math.min(1, (performance.now() - start) / duration)
    const eased = 1 - Math.pow(1 - t, 3)
    const x = Math.round(fromX + (to.x - fromX) * eased)
    panel.setBounds({ x, y: to.y, width: to.width, height: to.height }, false)
    if (t < 1) {
      ticker = setTimeout(run, TICK_MS)
    } else {
      ticker = null
      done?.()
    }
  }
  run()
}

export function createPanel(): BrowserWindow {
  if (panel && !panel.isDestroyed()) return panel

  const initial = targetBounds()

  panel = new BrowserWindow({
    ...initial,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: loadSettings().pinned,
    roundedCorners: false,
    title: 'Sill',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: true
    }
  })

  panel.setAlwaysOnTop(loadSettings().pinned, 'screen-saver')

  // 外链一律交给系统浏览器，面板本身不导航
  panel.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  panel.webContents.on('will-navigate', (event, url) => {
    if (url !== panel?.webContents.getURL()) event.preventDefault()
  })

  // 崩溃只影响面板：重载一次（覆盖层状态一并复位，避免 Esc 被卡在旧状态）
  panel.webContents.on('render-process-gone', () => {
    console.error('[sill] 渲染进程退出，重载面板')
    overlayOpen = false
    panel?.webContents.reload()
  })

  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) {
    void panel.loadURL(devUrl)
  } else {
    void panel.loadFile(join(__dirname, '../renderer/index.html'))
  }

  screen.on('display-metrics-changed', () => snapIfVisible())
  screen.on('display-added', () => snapIfVisible())
  screen.on('display-removed', () => snapIfVisible())

  return panel
}

/** 换屏/改分辨率后，不播动画，直接落到新停靠位 */
function snapIfVisible(): void {
  if (!visible || !panel) return
  stopTicker()
  const target = targetBounds()
  panel.setBounds(target, false)
}

export function isPanelVisible(): boolean {
  return visible
}

export function showPanel(): void {
  const win = createPanel()
  if (visible) return

  const target = targetBounds()
  const side = loadSettings().side
  const from = offscreenX(target, side)
  const height = Math.min(target.height, Math.max(200, target.height))

  stopTicker()
  win.setBounds({ x: from, y: target.y, width: target.width, height }, false)
  if (!win.isVisible()) win.showInactive()
  visible = true
  overlayOpen = false
  win.webContents.send('panel:state', true)
  // 面板不抢焦点，Esc 只能靠全局临时接管；收起时立刻解绑。
  // 面板里盖着 Customize 时，Esc 先关那一层，再按一次才收面板。
  bindEscape(() => {
    if (overlayOpen) panel?.webContents.send('panel:escape')
    else hidePanel()
  })
  slideTo(from, { ...target, height }, SLIDE_IN_MS)
}

/** 渲染进程告知「有覆盖层开着」，Esc 的优先级据此切换 */
export function setOverlayOpen(open: boolean): void {
  overlayOpen = Boolean(open)
}

export function hidePanel(done?: () => void): void {
  const win = panel
  if (!win || !visible) {
    done?.()
    return
  }

  const current = win.getBounds()
  const side = loadSettings().side
  const to = offscreenX(current, side)
  unbindEscape()
  visible = false
  overlayOpen = false
  win.webContents.send('panel:state', false)
  slideTo(current.x, { ...current, x: to }, SLIDE_OUT_MS, () => {
    if (win.isDestroyed()) return
    win.hide()
    done?.()
  })
}

export function togglePanel(): void {
  if (visible) hidePanel()
  else showPanel()
}

/** 面板置顶开关（托盘菜单用） */
export function applyPinned(pinned: boolean): void {
  panel?.setAlwaysOnTop(pinned, 'screen-saver')
}

/** 记住停靠位置（M5 多屏细化时真正使用） */
export function rememberPosition(): void {
  if (!panel || panel.isDestroyed()) return
  const { x, y } = panel.getBounds()
  updateSettings({ panel: { x, y } })
}

export function getPanelWindow(): BrowserWindow | null {
  return panel && !panel.isDestroyed() ? panel : null
}
