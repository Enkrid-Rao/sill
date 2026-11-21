/**
 * 液态玻璃：主进程与渲染进程共用的事实。
 *
 * 两条取景路线：
 *  - `frame`：窗口隐藏后抓一帧静态桌面（不需要 WDA，面板照常能被截图）；
 *  - `live` ：`getDisplayMedia` 拿一路持续的屏幕流，每隔一帧更新纹理（**必须 WDA**，
 *             面板在截图 / 录屏里会消失）。实测 2560×1600@30fps，`texImage2D(video)` 0.1ms。
 *
 * 像素走原始字节（静态帧）或 VideoFrame（实时），都不经过 PNG。
 */

/** 一帧静态桌面快照 */
export interface BackdropPayload {
  /** 抓的是哪块屏（DIP）；data 的尺寸除以它就是每个 DIP 占几个抓帧像素 */
  displayWidth: number
  displayHeight: number
  /** 抓帧那一刻面板在这块屏里的 DIP 位置（排查用；采样靠 PanelOrigin 现算） */
  panelX: number
  panelY: number
  /** 位图是 BGRA（Windows）还是 RGBA */
  bgra: boolean
  /** 帧来自哪：真实抓屏 / SILL_GLASS_BACKDROP 的假桌面（排查用） */
  source: 'desktop' | 'mock'
  at: number
  /** 原始字节，RGBA 或 BGRA 顺序，见 bgra */
  data: Uint8Array
  /** 纹理像素尺寸 */
  width: number
  height: number
}

/** 窗口此刻的位置 + 它所在那块屏的 DIP 矩形（滑入/拖宽时连续推给渲染进程） */
export interface PanelOrigin {
  x: number
  y: number
  width: number
  height: number
  /** 窗口所在显示器的 DIP 矩形（虚拟桌面坐标） */
  displayX: number
  displayY: number
  displayWidth: number
  displayHeight: number
}

/**
 * 玻璃材质档位：
 *  - `film`  v0.7 的四层静态贴膜（没有真背景）
 *  - `frame` 静态帧 + WebGL 折射（背景冻结，但不影响截图）
 *  - `live`  实时流 + WebGL 折射（背景会动，代价是面板从截图/录屏里消失）
 */
export type GlassMode = 'film' | 'frame' | 'live'
