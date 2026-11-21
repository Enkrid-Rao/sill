import { readFileSync } from 'node:fs'
import {
  desktopCapturer,
  nativeImage,
  screen,
  session,
  webContents,
  type BrowserWindow,
  type DesktopCapturerSource
} from 'electron'
import type { BackdropPayload } from '../shared/glass'

/**
 * 桌面像素的两种取法。
 *
 * **frame 档**（`captureBackdrop`）：`win.hide()` 之后抓一帧。
 * 窗口隐藏就不参与 DWM 合成，抓到的图里没有自己，所以不需要 WDA，
 * 面板照常能被截图 / 录屏 / 远控捕获。代价是背景冻结。
 *
 * **live 档**（`installDisplayMediaHandler`）：`getDisplayMedia` 拿一路持续的屏幕流，
 * 每帧 `texImage2D(video)` 更新纹理 —— 背景真的会动。
 * 代价是**必须** `setContentProtection(true)`（WDA_EXCLUDEFROMCAPTURE）把自己的窗口
 * 从采集里摘掉，否则流里会看到自己的上一帧，形成反馈；副作用是面板从此在截图里消失。
 *
 * 实测（scripts/probe/live-probe.cjs）：流是 2560×1600@30fps，`texImage2D(video)` 中位 0.1ms；
 * WDA 开时窗口在采集里占比 0，关时 12.9%。
 */

const CAPTURE_DIVISOR = 2

/** 开发用：SILL_GLASS_BACKDROP 指向一张图，跳过真实抓屏，截图可复现 */
function fakeBackdrop(win: BrowserWindow): BackdropPayload | null {
  const file = process.env.SILL_GLASS_BACKDROP?.trim()
  if (!file) return null
  try {
    const image = nativeImage.createFromBuffer(readFileSync(file))
    const size = image.getSize()
    if (!size.width || !size.height) return null
    const bounds = win.getContentBounds()
    // 把图当成一整块「屏幕」，面板按真实宽高贴在右侧 —— 只为视觉验证
    const displayWidth = size.width
    const displayHeight = size.height
    return {
      data: new Uint8Array(image.toBitmap()),
      width: size.width,
      height: size.height,
      displayWidth,
      displayHeight,
      panelX: Math.max(0, displayWidth - bounds.width - 40),
      panelY: Math.max(0, Math.round((displayHeight - bounds.height) / 2)),
      bgra: process.platform !== 'darwin',
      source: 'mock',
      at: Date.now()
    }
  } catch (error) {
    console.error('[sill] 读取 SILL_GLASS_BACKDROP 失败：', error)
    return null
  }
}

export async function captureBackdrop(win: BrowserWindow): Promise<BackdropPayload | null> {
  if (win.isDestroyed()) return null

  const fake = fakeBackdrop(win)
  if (fake) return fake

  const bounds = win.getContentBounds()
  const display = screen.getDisplayMatching(bounds)
  const thumbnailSize = {
    width: Math.max(1, Math.round(display.size.width / CAPTURE_DIVISOR)),
    height: Math.max(1, Math.round(display.size.height / CAPTURE_DIVISOR))
  }

  let sources: Electron.DesktopCapturerSource[]
  try {
    sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize })
  } catch (error) {
    console.error('[sill] 抓屏失败：', error)
    return null
  }
  if (!sources.length) return null

  // 多屏：挑面板所在的那一块
  const source =
    sources.find((item) => item.display_id === String(display.id)) ?? sources[0]
  if (!source || source.thumbnail.isEmpty()) return null

  const size = source.thumbnail.getSize()
  if (!size.width || !size.height) return null

  return {
    data: new Uint8Array(source.thumbnail.toBitmap()),
    width: size.width,
    height: size.height,
    displayWidth: display.size.width,
    displayHeight: display.size.height,
    panelX: bounds.x - display.bounds.x,
    panelY: bounds.y - display.bounds.y,
    // Windows / Linux 的 toBitmap 是 BGRA；换通道交给着色器做
    bgra: process.platform !== 'darwin',
    source: 'desktop',
    at: Date.now()
  }
}

/** 面板在哪块屏上（showPanel / 改尺寸时算一次就够，不必每 tick 都算） */
export function displayRectFor(win: BrowserWindow): {
  x: number
  y: number
  width: number
  height: number
} {
  const display = screen.getDisplayMatching(win.getContentBounds())
  return {
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.size.width,
    height: display.size.height
  }
}

/**
 * live 档的 WDA 开关。
 *
 * 开着的时候面板不会被任何屏幕采集看到（Win10 2004+ 的 WDA_EXCLUDEFROMCAPTURE），
 * 换来的是屏幕流里没有自己 —— 这是实时背景的前提。
 * 关掉就恢复正常：截图 / 录屏 / 远控都能拍到面板。
 */
export function setCaptureExcluded(win: BrowserWindow, excluded: boolean): void {
  if (win.isDestroyed()) return
  try {
    win.setContentProtection(excluded)
  } catch (error) {
    console.error('[sill] 设置采集排除失败：', error)
  }
}

let handlerInstalled = false

/**
 * 注册 getDisplayMedia 的授权回调。
 *
 * 只有**面板自己的 webContents** 能拿到屏幕：组件是跑在同一 session 里的 webview guest，
 * 如果不校验来源，一个恶意组件就能 `getDisplayMedia()` 把整块屏录走。
 */
export function installDisplayMediaHandler(getPanel: () => BrowserWindow | null): void {
  if (handlerInstalled) return
  handlerInstalled = true

  session.defaultSession.setDisplayMediaRequestHandler(
    async (request, callback) => {
      const owner = getPanel()
      const ownerContents = owner && !owner.isDestroyed() ? owner.webContents : null
      const requester = request.frame ? webContents.fromFrame(request.frame) : null
      if (!owner || !ownerContents || !requester || requester.id !== ownerContents.id) {
        console.warn('[sill] 拒绝非面板来源的屏幕采集请求：', request.securityOrigin)
        callback({})
        return
      }

      let source: DesktopCapturerSource | undefined
      try {
        const bounds = owner.getContentBounds()
        const display = bounds
          ? screen.getDisplayMatching(bounds)
          : screen.getPrimaryDisplay()
        const sources = await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: { width: 16, height: 16 }
        })
        source =
          sources.find((item) => item.display_id === String(display.id)) ?? sources[0]
      } catch (error) {
        console.error('[sill] 屏幕采集取源失败：', error)
        callback({})
        return
      }

      if (!source) {
        callback({})
        return
      }
      callback({ video: source })
    },
    { useSystemPicker: false }
  )
}
