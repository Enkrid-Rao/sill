import { join } from 'node:path'
import { BrowserWindow, screen, shell } from 'electron'
import { bindEscape, unbindEscape } from './hotkey'
import { startData, stopData } from './data'
import { loadSettings } from './settings'
import { getPanelShape } from '../shared/layout'

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

/** 停靠位：鼠标所在屏的边缘，尺寸由 panelShape 决定 */
function targetBounds(): Rect {
  const settings = loadSettings()
  const shape = getPanelShape(settings.panelShape)
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const area = display.workArea
  const maxHeight = area.height - PANEL_VERTICAL_MARGIN * 2
  const height = shape.height > 0 ? Math.min(shape.height, maxHeight) : Math.min(maxHeight, MAX_HEIGHT)
  const y = area.y + Math.round((area.height - height) / 2)
  const x = settings.side === 'left'
    ? area.x + settings.edgeGap
    : area.x + area.width - shape.width - settings.edgeGap

  return { x, y, width: shape.width, height }
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
    // 面板必须浮在最上层：不开置顶的话，热键唤出也会被其他窗口压住。
    // 所以这个行为不可配置，托盘和设置里都不再提供开关。
    alwaysOnTop: true,
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

  panel.setAlwaysOnTop(true, 'screen-saver')

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

  stopTicker()
  win.setBounds({ x: from, y: target.y, width: target.width, height: target.height }, false)
  if (!win.isVisible()) win.showInactive()
  visible = true
  overlayOpen = false
  startData()
  win.webContents.send('panel:state', true)
  // 面板不抢焦点，Esc 只能靠全局临时接管；收起时立刻解绑。
  // 面板里盖着设置面板时，Esc 先关那一层，再按一次才收面板。
  bindEscape(() => {
    if (overlayOpen) panel?.webContents.send('panel:escape')
    else hidePanel()
  })
  slideTo(from, target, SLIDE_IN_MS)
}

/** 渲染进程告知「有覆盖层开着」，Esc 的优先级据此切换 */
export function setOverlayOpen(open: boolean): void {
  overlayOpen = Boolean(open)
}

export function hidePanel(done?: () => void): void {
  const win = panel
  if (!win || !visible) {
    stopData()
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
    stopData()
    done?.()
  })
}

export function togglePanel(): void {
  if (visible) hidePanel()
  else showPanel()
}

/** 停靠方向变了：面板开着就直接挪到新一侧（不播动画，避免设置面板被收起） */
export function reanchor(): void {
  if (!visible || !panel || panel.isDestroyed()) return
  stopTicker()
  panel.setBounds(targetBounds(), false)
}

export function getPanelWindow(): BrowserWindow | null {
  return panel && !panel.isDestroyed() ? panel : null
}
