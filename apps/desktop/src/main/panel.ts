import { join } from 'node:path'
import { BrowserWindow, screen, shell } from 'electron'
import { bindEscape, unbindEscape } from './hotkey'
import { startData, stopData } from './data'
import { startMouseWatch, stopMouseWatch } from './mouse-watch'
import { getTrayBounds } from './tray'
import { loadSettings, updateSettings, type Settings } from './settings'
import {
  PANEL_MAX_WIDTH,
  PANEL_MIN_HEIGHT,
  PANEL_MIN_WIDTH,
  columnsForWidth
} from '../shared/layout'

/** 上下留白：面板可以长到几乎整块工作区，同时仍能看见壁纸的呼吸 */
const PANEL_MARGIN_Y = 40
const SLIDE_IN_MS = 240
const SLIDE_OUT_MS = 160
const TICK_MS = 10

let panel: BrowserWindow | null = null
let visible = false
let ticker: NodeJS.Timeout | null = null
/** 面板里是否盖着一层自绘表面（Customize / 布局编辑）；此时 Esc 先交给它关自己 */
let overlayOpen = false
/** 面板里有文本输入框聚焦：Esc 先交给输入框取消，不收起面板 */
let typing = false
/** 主进程级的 Esc 拦截（例如独立设置窗口开着时先关它） */
let escapeInterceptor: (() => boolean) | null = null

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface PanelSize {
  width: number
  height: number
  maxWidth: number
  maxHeight: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** 当前屏幕允许的最大面板尺寸：贴边 + 上下留白之后的部分就是全部可用空间 */
function sizeLimits(area: Electron.Rectangle, edgeGap: number): { maxWidth: number; maxHeight: number } {
  const maxWidth = Math.max(
    PANEL_MIN_WIDTH,
    Math.min(PANEL_MAX_WIDTH, area.width - edgeGap * 2 - 16)
  )
  const maxHeight = Math.max(PANEL_MIN_HEIGHT, area.height - PANEL_MARGIN_Y * 2)
  return { maxWidth, maxHeight }
}

/** 设置里的宽高 → 当前屏幕上的实际宽高；height = 0 表示撑满 */
function resolveSize(settings: Settings, area: Electron.Rectangle): { width: number; height: number; maxWidth: number; maxHeight: number } {
  const limits = sizeLimits(area, settings.edgeGap)
  const width = clamp(Math.round(settings.panelWidth), PANEL_MIN_WIDTH, limits.maxWidth)
  const height =
    settings.panelHeight > 0
      ? clamp(Math.round(settings.panelHeight), PANEL_MIN_HEIGHT, limits.maxHeight)
      : limits.maxHeight
  return { width, height, ...limits }
}

/** 停靠位：鼠标所在屏的边缘，尺寸来自 settings.panelWidth / panelHeight */
function targetBounds(): Rect {
  const settings = loadSettings()
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const area = display.workArea
  const { width, height } = resolveSize(settings, area)
  const centeredY = area.y + Math.round((area.height - height) / 2)
  const y = clamp(
    centeredY + settings.panelOffsetY,
    area.y + PANEL_MARGIN_Y,
    area.y + area.height - height - PANEL_MARGIN_Y
  )
  const x =
    settings.side === 'left'
      ? area.x + settings.edgeGap
      : area.x + area.width - width - settings.edgeGap

  return { x, y, width, height }
}

/** 屏幕外一屏宽的位置：动画的起点/终点（多让出 edgeGap，避免停靠留白露一条边） */
function offscreenX(target: Rect, side: 'left' | 'right'): number {
  const gap = loadSettings().edgeGap
  return side === 'left' ? target.x - target.width - gap : target.x + target.width + gap
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
    panel.setContentBounds({ x, y: to.y, width: to.width, height: to.height }, false)
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
    // 尺寸由渲染进程的拖拽把手发起（panel:resize），原生 resizable 会让
    // 透明无边框窗口露出系统边框，所以保持 false，只走 setContentBounds。
    resizable: false,
    // 宽度/高度一律按「网页内容尺寸」理解，避免 Windows 把 1px 边框算进 bounds
    useContentSize: true,
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
      // Web widgets are sandboxed guests; the host only creates the tag and
      // talks through a preload bridge. No Node is exposed to the guest.
      webviewTag: true,
      spellcheck: false,
      // 面板隐藏/重新唤出时不冻结渲染进程：否则 panel:state 和首帧数据
      // 会排队到用户点击面板才处理，表现为“唤出后必须先点一下才刷新”。
      backgroundThrottling: false
    }
  })

  panel.setAlwaysOnTop(true, 'screen-saver')

  // Web widgets are guests. Force the bridge and reject anything that is not
  // the inline HTML we generated for this card.
  panel.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    // Only the host sets the partition; widget HTML cannot escalate itself.
    const trusted = params.partition === 'sill-trusted'
    webPreferences.preload = join(__dirname, '../preload/widget.js')
    webPreferences.nodeIntegration = trusted
    webPreferences.contextIsolation = !trusted
    webPreferences.sandbox = !trusted
    if (!params.src.startsWith('data:text/html')) event.preventDefault()
  })

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
  panel.setContentBounds(target, false)
}

export function isPanelVisible(): boolean {
  return visible
}

function contains(bounds: Electron.Rectangle, x: number, y: number): boolean {
  return x >= bounds.x && x < bounds.x + bounds.width && y >= bounds.y && y < bounds.y + bounds.height
}

/** 独立设置窗口 / DevTools 等任何第二个窗口存在时，外部点击不收起面板 */
function hasOtherWindow(): boolean {
  return BrowserWindow.getAllWindows().some((win) => win !== panel && !win.isDestroyed())
}

export function showPanel(): void {
  const win = createPanel()
  if (visible) return

  const target = targetBounds()
  const side = loadSettings().side
  const from = offscreenX(target, side)

  stopTicker()
  win.setContentBounds({ x: from, y: target.y, width: target.width, height: target.height }, false)
  if (!win.isVisible()) win.showInactive()
  visible = true
  overlayOpen = false
  typing = false
  startData((next) => {
    if (!win.isDestroyed()) win.webContents.send('data:changed', next)
  })
  win.webContents.send('panel:state', true)
  // 面板不抢焦点，收不到 blur；用一个轻量全局左键监视器判断“点了 Sill 外面”。
  // 设置 / 布局编辑打开时不收；托盘图标点击也不收（托盘自己会 toggle）。
  startMouseWatch(() => {
    if (!visible || overlayOpen || !panel || panel.isDestroyed()) return
    if (hasOtherWindow()) return
    const point = screen.getCursorScreenPoint()
    const tray = getTrayBounds()
    if (tray && contains(tray, point.x, point.y)) return
    if (contains(panel.getContentBounds(), point.x, point.y)) return
    hidePanel()
  })
  // 面板不抢焦点，Esc 只能靠全局临时接管；收起时立刻解绑。
  // 面板里盖着设置面板时，Esc 先关那一层，再按一次才收面板。
  bindEscape(() => {
    if (escapeInterceptor?.()) return
    if (typing) {
      panel?.webContents.send('panel:escape-input')
      return
    }
    if (overlayOpen) panel?.webContents.send('panel:escape')
    else hidePanel()
  })
  slideTo(from, target, SLIDE_IN_MS)
}

/** 渲染进程告知「有覆盖层开着」，Esc 的优先级据此切换 */
export function setOverlayOpen(open: boolean): void {
  overlayOpen = Boolean(open)
}

/** 文本输入框聚焦时由 renderer 调用：Esc 先取消输入，不收起面板 */
export function setTyping(active: boolean): void {
  typing = Boolean(active)
}

/** 主进程注册一个优先于面板覆盖层的 Esc 处理（返回 true 表示已消费） */
export function setEscapeInterceptor(handler: (() => boolean) | null): void {
  escapeInterceptor = handler
}

export function hidePanel(done?: () => void): void {
  const win = panel
  stopMouseWatch()
  if (!win || !visible) {
    stopData()
    done?.()
    return
  }

  const current = win.getContentBounds()
  const side = loadSettings().side
  const to = offscreenX(current, side)
  unbindEscape()
  visible = false
  overlayOpen = false
  typing = false
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

/** 停靠方向 / 尺寸来自设置时：面板开着就直接落到新位置（不播动画，避免设置面板被收起） */
export function reanchor(): void {
  if (!visible || !panel || panel.isDestroyed()) return
  stopTicker()
  panel.setContentBounds(targetBounds(), false)
}

/**
 * 拖拽把手发起的实时改尺寸。
 * 宽度：贴着停靠边改（右侧停靠时右边缘不动，向左长）；
 * 高度：顶边不动（底边跟着指针走），并夹在上下留白之间。
 */
export function resizePanel(width: unknown, height: unknown): PanelSize | null {
  const win = panel
  if (!win || win.isDestroyed() || !visible) return null
  const settings = loadSettings()
  const current = win.getContentBounds()
  const display = screen.getDisplayMatching(current)
  const area = display.workArea
  const limits = sizeLimits(area, settings.edgeGap)
  const nextWidth = clamp(
    Math.round(Number.isFinite(Number(width)) ? Number(width) : current.width),
    PANEL_MIN_WIDTH,
    limits.maxWidth
  )
  const nextHeight = clamp(
    Math.round(Number.isFinite(Number(height)) ? Number(height) : current.height),
    PANEL_MIN_HEIGHT,
    limits.maxHeight
  )
  const x =
    settings.side === 'left'
      ? area.x + settings.edgeGap
      : area.x + area.width - nextWidth - settings.edgeGap
  const y = clamp(
    current.y,
    area.y + PANEL_MARGIN_Y,
    area.y + area.height - nextHeight - PANEL_MARGIN_Y
  )

  stopTicker()
  win.setContentBounds({ x, y, width: nextWidth, height: nextHeight }, false)
  return { width: nextWidth, height: nextHeight, maxWidth: limits.maxWidth, maxHeight: limits.maxHeight }
}

/**
 * 拖拽结束：把当前尺寸与垂直偏移写进 settings。
 * 高度已经顶到工作区上限时存 0（= 以后都撑满），换到更大的屏幕也还是撑满。
 * 可选地先落一次尺寸，避免最后一次 move 的 IPC 还没到就直接 commit。
 */
export function commitPanelSize(width?: unknown, height?: unknown): Settings {
  const win = panel
  if (!win || win.isDestroyed()) return loadSettings()
  if (Number.isFinite(Number(width)) && Number.isFinite(Number(height))) {
    resizePanel(width, height)
  }
  const current = win.getContentBounds()
  const area = screen.getDisplayMatching(current).workArea
  const settings = loadSettings()
  const limits = sizeLimits(area, settings.edgeGap)
  const centeredY = area.y + Math.round((area.height - current.height) / 2)
  const minY = area.y + PANEL_MARGIN_Y - centeredY
  const maxY = area.y + area.height - current.height - PANEL_MARGIN_Y - centeredY
  const offsetY = clamp(current.y - centeredY, Math.min(minY, maxY), Math.max(minY, maxY))
  const storedHeight = current.height >= limits.maxHeight ? 0 : current.height

  return updateSettings({
    panelWidth: current.width,
    panelHeight: storedHeight,
    panelOffsetY: offsetY
  })
}

/** 设置面板用它给尺寸滑杆取上限 */
export function getPanelSizeLimits(): { maxWidth: number; maxHeight: number; columns: number } {
  const settings = loadSettings()
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const limits = sizeLimits(display.workArea, settings.edgeGap)
  return {
    ...limits,
    columns: columnsForWidth(Math.min(settings.panelWidth, limits.maxWidth))
  }
}

export function getPanelWindow(): BrowserWindow | null {
  return panel && !panel.isDestroyed() ? panel : null
}
