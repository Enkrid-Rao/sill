import { useCallback, useEffect, useRef, useState } from 'react'
import type { BackdropPayload, PanelOrigin } from '../../../../shared/glass'
import type { Theme } from '../../../../shared/theme'
import { GlassMotion, type MotionState } from './motion'
import {
  cornerExtent,
  DEFAULT_LOOK,
  GlassRenderer,
  type BackdropFrame,
  type GlassLook
} from './renderer'

/**
 * 液态玻璃在 React 里的挂载点。
 *
 * 只有两种状态，任何一步失败都能整块退回 v0.7 的贴膜：
 *  - 'film'   ：没有桌面帧 / WebGL2 不可用 / 用户关了 → 原来的四层静态玻璃；
 *  - 'liquid' ：帧与上下文都就绪 → canvas 接管，`.rail` 背景转透明。
 *
 * 每帧只有一次全屏 pass（模糊在换帧时就算完了）；有运动时 60fps，
 * 只剩呼吸时 30fps，把 glassMotion 拉到 0 则静止后彻底停画。
 */

export type GlassStatus = 'film' | 'liquid'

const IDLE_FPS = 30
const ACTIVE_FPS = 60

/** Theme → 着色器参数。玻璃的颜色语义（hue / tint-s / glass-alpha）继续成立。 */
export function lookFromTheme(theme: Theme): GlassLook {
  const tint = hslToRgb(theme.hue, theme.tintSat / 100, 0.07)
  return {
    ...DEFAULT_LOOK,
    blur: theme.glassBlur,
    displace: (theme.glassRefraction / 100) * 2.2,
    dispersion: (theme.glassDispersion / 100) * 0.5,
    tint: [tint[0] / 255, tint[1] / 255, tint[2] / 255],
    // glassOpacity 越大 → 色膜越厚 → 桌面越不显。
    // 注意这里比贴膜档的 alpha 低得多：贴膜盖的是*清晰*桌面，得压死；
    // 液态档盖的是*模糊*桌面，压太狠就变成一块死色板，玻璃感全丢。
    tintAlpha: clamp(0.16 + (theme.glassOpacity / 100) * 0.44, 0.14, 0.74),
    // 亮背景把色膜吸上来：白字才扛得住，面板也不会在浅色窗口前变成一块灰板
    legibility: clamp(0.45 * (theme.glassOpacity / 52), 0.16, 0.62),
    saturation: 1.18 + theme.tintSat / 160
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** HSL → RGB（0–255），明度固定 7%，和 CSS 里 `hsl(var(--hue) var(--tint-s) 7%)` 同色 */
function hslToRgb(hue: number, saturation: number, lightness: number): [number, number, number] {
  const h = ((((hue % 360) + 360) % 360) / 360)
  if (saturation <= 0) {
    const value = Math.round(lightness * 255)
    return [value, value, value]
  }
  const q =
    lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation
  const p = 2 * lightness - q
  const channel = (t: number): number => {
    let value = t
    if (value < 0) value += 1
    if (value > 1) value -= 1
    if (value < 1 / 6) return p + (q - p) * 6 * value
    if (value < 1 / 2) return q
    if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6
    return p
  }
  return [
    Math.round(channel(h + 1 / 3) * 255),
    Math.round(channel(h) * 255),
    Math.round(channel(h - 1 / 3) * 255)
  ]
}

function toFrame(payload: BackdropPayload): BackdropFrame {
  return {
    data: payload.data,
    width: payload.width,
    height: payload.height,
    displayWidth: payload.displayWidth,
    displayHeight: payload.displayHeight,
    panelX: payload.panelX,
    panelY: payload.panelY,
    bgra: payload.bgra,
    source: payload.source
  }
}

/** IPC 过来的字节可能是 Uint8Array，也可能是被结构化克隆降级的普通对象 */
function toBytes(raw: unknown): Uint8Array {
  if (raw instanceof Uint8Array) return raw
  if (raw instanceof ArrayBuffer) return new Uint8Array(raw)
  if (Array.isArray(raw)) return new Uint8Array(raw as number[])
  return new Uint8Array(0)
}

export interface LiquidGlassOptions {
  theme: Theme
  /** 面板当前是否可见（主进程 panel:state） */
  visible: boolean
  /** 面板圆角（CSS px），和 --radius 对齐 */
  radius: number
}

export interface LiquidGlassController {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  status: GlassStatus
  /** 主动踢一下（点按钮、换主题） */
  excite: (strength?: number) => void
  /** 调试快照，设置页 / 冒烟脚本可以读 */
  debug: () => Record<string, unknown>
}

export function useLiquidGlass({ theme, visible, radius }: LiquidGlassOptions): LiquidGlassController {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rendererRef = useRef<GlassRenderer | null>(null)
  const motionRef = useRef<GlassMotion | null>(null)
  const frameRef = useRef<BackdropFrame | null>(null)
  const originRef = useRef<PanelOrigin | null>(null)
  const lookRef = useRef<GlassLook>(lookFromTheme(theme))
  const statusRef = useRef<GlassStatus>('film')
  const [status, setStatus] = useState<GlassStatus>('film')
  const blurRef = useRef(-1)
  const themeRef = useRef(theme)
  const radiusRef = useRef(radius)
  const visibleRef = useRef(visible)
  const rafRef = useRef(0)
  const lastDrawRef = useRef(0)
  const runningRef = useRef(false)
  const scrollTopRef = useRef(0)
  const videoStateRef = useRef<Record<string, number> | null>(null)
  const lastMotionRef = useRef<MotionState | null>(null)
  /** 每帧合成耗时的滑动平均（ms） */
  const drawCostRef = useRef(0)
  /** 静态帧档「预滚」流的状态，给 debug() 看 */
  const preRollRef = useRef<{
    phase: 'idle' | 'wait' | 'starting' | 'running' | 'failed'
    frames: number
    error: string | null
  }>({ phase: 'idle', frames: 0, error: null })

  themeRef.current = theme
  radiusRef.current = radius
  visibleRef.current = visible
  lookRef.current = lookFromTheme(theme)
  if (!motionRef.current) motionRef.current = new GlassMotion()

  const setStatusBoth = useCallback((next: GlassStatus) => {
    if (statusRef.current === next) return
    statusRef.current = next
    setStatus(next)
  }, [])

  const drawFrame = useCallback((dt: number) => {
    const renderer = rendererRef.current
    const canvas = canvasRef.current
    const motion = motionRef.current
    if (!renderer || !canvas || !motion || !renderer.available) return
    const state = motion.update(dt)
    lastMotionRef.current = state

    // 三个开关各管一件事，互不牵连：
    //   glassMotion  → 只缩放「呼吸」（静止时的慢漂移）
    //   glassWobble  → 滑入那一下的抖动（pulse 一族）
    //   glassScrollFlow → 滚动时的背景视差（flow）
    // 系统开了「减少动态效果」则全部归零。
    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const breathing = reduced ? 0 : themeRef.current.glassMotion / 100
    state.breath *= breathing
    if (reduced || !themeRef.current.glassWobble) {
      state.pulse = 0
      state.stretch = 0
      state.squash = 0
    }
    if (reduced || !themeRef.current.glassScrollFlow) {
      state.flowX = 0
      state.flowY = 0
    }
    if (reduced) state.spark = 0

    renderer.resize(canvas.clientWidth, canvas.clientHeight, window.devicePixelRatio || 1)
    const started = performance.now()
    renderer.draw({
      look: lookRef.current,
      motion: state,
      radius: radiusRef.current,
      origin: originRef.current
    })
    // 帧耗时滑动平均（毫秒）；设置页 / 冒烟脚本可以读它判断成本
    const cost = performance.now() - started
    drawCostRef.current = drawCostRef.current * 0.9 + cost * 0.1
  }, [])

  const stopLoop = useCallback(() => {
    runningRef.current = false
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = 0
  }, [])

  const tick = useCallback(
    (ts: number) => {
      if (!runningRef.current) {
        rafRef.current = 0
        return
      }
      rafRef.current = requestAnimationFrame(tick)

      const motion = motionRef.current
      // 上下文丢了（Chromium 长时间隐藏面板后可能回收）：直接退回贴膜，别留一块黑 canvas
      if (!rendererRef.current?.available) {
        setStatusBoth('film')
        stopLoop()
        return
      }
      // 与 drawFrame 保持一致：减少动态效果时当作「没有呼吸」
      const reduced =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const amount = reduced ? 0 : themeRef.current.glassMotion / 100
      const moving = motion ? motion.active : false
      // 只有「呼吸」需要常驻渲染循环；滑动冲击、滚动视差、新视频帧都会自己把循环叫醒
      const breathing = amount > 0.01
      // 实时档有新帧就按满帧率画：玻璃的「跟手」程度直接取决于这行
      const live = rendererRef.current?.liveReady ?? false
      const interval = 1000 / (moving || live ? ACTIVE_FPS : IDLE_FPS)
      if (ts - lastDrawRef.current < interval - 0.5) return

      const dt = lastDrawRef.current ? (ts - lastDrawRef.current) / 1000 : 1 / 60
      lastDrawRef.current = ts
      drawFrame(dt)

      // 既不呼吸也没有运动 → 画完这一帧就停，等到下一个事件再醒
      if (!breathing && !moving) {
        runningRef.current = false
        cancelAnimationFrame(rafRef.current)
        rafRef.current = 0
      }
    },
    [drawFrame, setStatusBoth, stopLoop]
  )

  const startLoop = useCallback(() => {
    if (runningRef.current) return
    runningRef.current = true
    lastDrawRef.current = 0
    rafRef.current = requestAnimationFrame(tick)
  }, [tick])

  // ---- 挂载：建上下文、接 IPC、拿缓存帧 ----------------------------------
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let renderer: GlassRenderer | null = null
    try {
      renderer = new GlassRenderer(canvas)
    } catch (error) {
      console.warn('[sill] 液态玻璃不可用，回退贴膜：', error)
      setStatusBoth('film')
      return
    }
    rendererRef.current = renderer

    const applyFrame = (payload: BackdropPayload): void => {
      const data = toBytes(payload.data)
      if (!data.length || !payload.width || !payload.height) return
      const frame = toFrame({ ...payload, data })
      frameRef.current = frame
      const current = rendererRef.current
      if (!current || !current.available) return
      current.setBackdrop(frame, lookRef.current.blur)
      blurRef.current = lookRef.current.blur
      setStatusBoth('liquid')
      startLoop()
    }

    const unsubscribeBackdrop = window.sill?.onBackdrop((raw) => {
      const payload = raw as BackdropPayload | null
      if (payload && payload.data) applyFrame(payload)
    })

    const unsubscribeOrigin = window.sill?.onPanelOrigin((bounds) => {
      const previous = originRef.current
      originRef.current = bounds
      // 窗口位置变了 = 玻璃里的桌面要留在原地；速度顺便喂给弹簧（滑动时的那一下震）
      if (previous && visibleRef.current) {
        const delta = bounds.x - previous.x
        if (Math.abs(delta) > 0.5) motionRef.current?.onSlide(delta)
      }
      startLoop()
    })

    void window.sill?.requestBackdrop().then((raw) => {
      const payload = raw as BackdropPayload | null
      if (payload && payload.data) applyFrame(payload)
    })

    return () => {
      stopLoop()
      unsubscribeBackdrop?.()
      unsubscribeOrigin?.()
      rendererRef.current = null
      renderer?.dispose()
    }
  }, [setStatusBoth, startLoop, stopLoop])

  // ---- 模糊变了：像素没变，重跑一遍高斯 ----------------------------------
  useEffect(() => {
    const current = rendererRef.current
    const blur = lookFromTheme(theme).blur
    if (theme.glassMode === 'live') {
      // 实时档每帧都会重跑模糊，这里只记下来
      blurRef.current = blur
      return
    }
    const frame = frameRef.current
    if (!current || !frame || !current.available) return
    if (Math.abs(blur - blurRef.current) < 0.35) return
    current.setBackdrop(frame, blur)
    blurRef.current = blur
    startLoop()
  }, [theme.glassBlur, theme.glassMode, startLoop])

  // ---- 静态帧档的「预滚」：隐藏时持续取最新一帧 --------------------------
  //
  // 抓帧原本发生在收起之后，于是「静态帧」永远是上一次收起那一刻的桌面 ——
  // 收起期间换了窗口、翻了页，再唤出还是旧画面。
  // 现在面板隐藏期间挂一路低帧率的屏幕流，把最新帧直接灌进纹理；
  // 唤出瞬间手上就是当前桌面，唤出后停流派，语义仍是「冻结的一帧」。
  //
  // 只在不显示时跑，所以不需要 WDA：窗口此时不在任何画面里，流里不会有自己。
  useEffect(() => {
    if (theme.glassMode !== 'frame' || visible) return
    let cancelled = false
    let stream: MediaStream | null = null
    let reader: ReadableStreamDefaultReader<VideoFrame> | null = null
    let started = false

    const stop = (): void => {
      if (reader) {
        void reader.cancel().catch(() => {})
        reader = null
      }
      stream?.getTracks().forEach((track) => track.stop())
      stream = null
      if (started) {
        started = false
        void window.sill?.setLiveActive(false)
      }
    }

    const start = async (): Promise<void> => {
      preRollRef.current = { phase: 'wait', frames: 0, error: null }
      // 收起动画 160ms：等面板真的滑出屏幕再开流，否则第一帧会拍到它自己
      await new Promise((resolve) => window.setTimeout(resolve, 260))
      if (cancelled || visibleRef.current) return
      preRollRef.current = { phase: 'starting', frames: 0, error: null }
      const Processor = (window as unknown as {
        MediaStreamTrackProcessor?: new (init: { track: MediaStreamTrack }) => {
          readable: ReadableStream<VideoFrame>
        }
      }).MediaStreamTrackProcessor
      if (!Processor || !navigator.mediaDevices?.getDisplayMedia) return
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({
          // 隐藏期间不需要流畅，6fps 足够让「打开时是当前画面」，代价也可忽略
          video: { frameRate: 6 },
          audio: false
        })
      } catch (error) {
        console.warn('[sill] 静态帧预滚拿不到屏幕流：', error)
        preRollRef.current = { phase: 'failed', frames: 0, error: String(error) }
        return
      }
      if (cancelled || visibleRef.current) {
        stop()
        return
      }
      started = true
      preRollRef.current = { phase: 'running', frames: 0, error: null }
      // 告诉主进程「有实时来源在跑」，别再走 1.2s 的静态抓帧
      void window.sill?.setLiveActive(true)
      let frames: { readable: ReadableStream<VideoFrame> } | null = null
      try {
        frames = new Processor({ track: stream.getVideoTracks()[0] })
      } catch {
        frames = null
      }
      if (!frames) return
      reader = frames.readable.getReader()
      for (;;) {
        try {
          const { value, done } = await reader.read()
          if (done) break
          if (!value) continue
          if (visibleRef.current) {
            value.close()
            break
          }
          // 只上传 + 模糊，不合成：窗口此时不可见
          rendererRef.current?.ingestFrame(value, lookRef.current.blur)
          preRollRef.current = { ...preRollRef.current, frames: preRollRef.current.frames + 1 }
        } catch {
          break
        }
      }
    }

    void start()
    return () => {
      cancelled = true
      stop()
    }
  }, [theme.glassMode, visible])

  // ---- 实时档：拿一路持续的屏幕流 ----------------------------------------
  useEffect(() => {
    if (theme.glassMode !== 'live') return
    let cancelled = false
    let stream: MediaStream | null = null
    let video: HTMLVideoElement | null = null
    let handle = 0
    let reader: ReadableStreamDefaultReader<VideoFrame> | null = null
    let watchdog = 0
    let stalledChecks = 0
    let attempts = 0
    let lastFrames = -1

    const reportLive = (active: boolean): void => {
      // 告诉主进程「实时到底有没有跑起来」：没跑起来就得退回静态帧的刷新节奏
      void window.sill?.setLiveActive(active)
    }

    const teardown = (): void => {
      if (handle && video?.cancelVideoFrameCallback) video.cancelVideoFrameCallback(handle)
      handle = 0
      if (reader) {
        void reader.cancel().catch(() => {})
        reader = null
      }
      if (video) {
        video.pause()
        video.srcObject = null
        video.remove()
        video = null
      }
      stream?.getTracks().forEach((track) => track.stop())
      stream = null
      rendererRef.current?.detachLive()
    }

    /**
     * 首选路径：MediaStreamTrackProcessor。
     * 拿到的是**采集出来的原始帧**，不经过 <video> 的呈现队列 —— 少 1–2 帧抖动缓冲，
     * 这是延迟的主要来源之一。延迟实测见 docs/GLASS.md §12.5。
     */
    const startFrames = (track: MediaStreamTrack): boolean => {
      const Processor = (window as unknown as {
        MediaStreamTrackProcessor?: new (init: { track: MediaStreamTrack }) => {
          readable: ReadableStream<VideoFrame>
        }
      }).MediaStreamTrackProcessor
      if (!Processor) return false
      const renderer = rendererRef.current
      if (!renderer) return false
      let processor: { readable: ReadableStream<VideoFrame> }
      try {
        processor = new Processor({ track })
      } catch (error) {
        console.warn('[sill] MediaStreamTrackProcessor 不可用：', error)
        return false
      }
      renderer.attachLive(null)
      reader = processor.readable.getReader()
      const pump = async (): Promise<void> => {
        while (!cancelled) {
          try {
            const { value, done } = await reader!.read()
            if (done) break
            if (!value) continue
            rendererRef.current?.pushVideoFrame(value)
            startLoop()
          } catch {
            break
          }
        }
      }
      void pump()
      return true
    }

    /** 回退路径：<video> + requestVideoFrameCallback */
    const startVideo = async (element: HTMLVideoElement, mediaStream: MediaStream): Promise<void> => {
      element.muted = true
      element.playsInline = true
      // 必须在视口里、并且「看起来可见」，否则 Chromium 会挂起解码
      element.style.cssText =
        'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.01;pointer-events:none;z-index:-1'
      element.srcObject = mediaStream
      document.body.appendChild(element)
      try {
        await element.play()
      } catch (error) {
        console.warn('[sill] 屏幕流播放失败：', error)
      }
      if (cancelled) return
      rendererRef.current?.attachLive(element)
      const pump = (): void => {
        if (cancelled) return
        rendererRef.current?.markLiveFrame()
        if (rendererRef.current?.ready) setStatusBoth('liquid')
        if (element.videoWidth) {
          videoStateRef.current = {
            t: Math.round(element.currentTime * 100) / 100,
            w: element.videoWidth,
            h: element.videoHeight,
            rs: element.readyState,
            paused: element.paused ? 1 : 0
          }
        }
        startLoop()
        handle = element.requestVideoFrameCallback(pump)
      }
      handle = element.requestVideoFrameCallback(pump)
    }

    const start = async (): Promise<void> => {
      attempts++
      if (!navigator.mediaDevices?.getDisplayMedia) {
        console.warn('[sill] 没有 getDisplayMedia，实时背景不可用，保留静态帧')
        reportLive(false)
        return
      }
      // 先让主进程把 WDA 打开，再开流：反过来的话流里可能先抓到面板自己
      await window.sill?.beginLive()
      if (cancelled) return
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({
          // 60fps：屏幕本身是 60Hz，压到 30 会先丢一半的运动信息
          video: { frameRate: 60 },
          audio: false
        })
      } catch (error) {
        console.warn('[sill] 屏幕流被拒绝，保留静态帧：', error)
        reportLive(false)
        return
      }
      if (cancelled) {
        stream.getTracks().forEach((track) => track.stop())
        stream = null
        return
      }

      const track = stream.getVideoTracks()[0]
      track?.addEventListener('ended', () => {
        // 用户从系统那边停了共享：退掉实时纹理，回到静态帧
        console.warn('[sill] 屏幕流已结束，退回静态帧')
        reportLive(false)
        rendererRef.current?.detachLive()
      })

      if (!startFrames(track)) {
        video = document.createElement('video')
        await startVideo(video, stream)
      }
      lastFrames = -1
      stalledChecks = 0
      reportLive(true)
    }

    // 看门狗：实时档开着却一直没新帧（元素被挂起 / 流没真正开始）就重建流
    watchdog = window.setInterval(() => {
      if (cancelled) return
      const frames = rendererRef.current?.liveFrames ?? 0
      if (frames !== lastFrames) {
        lastFrames = frames
        stalledChecks = 0
        return
      }
      stalledChecks++
      if (stalledChecks < 3) return
      stalledChecks = 0
      if (attempts >= 4) {
        console.warn('[sill] 实时背景连续拿不到帧，放弃并停在静态帧')
        reportLive(false)
        window.clearInterval(watchdog)
        watchdog = 0
        return
      }
      console.warn('[sill] 实时背景没有新帧，重开屏幕流（第', attempts + 1, '次）')
      teardown()
      void start()
    }, 1200)

    void start()
    return () => {
      cancelled = true
      if (watchdog) window.clearInterval(watchdog)
      teardown()
      reportLive(false)
    }
  }, [theme.glassMode, setStatusBoth, startLoop])

  // ---- 显隐 ---------------------------------------------------------------
  useEffect(() => {
    const motion = motionRef.current
    if (!motion) return
    if (theme.glassMode === 'film') {
      // 用户切回贴膜：立刻停画，别让一块看不见的 canvas 继续烧 GPU
      stopLoop()
      return
    }
    if (visible) {
      motion.onShow()
      startLoop()
      return
    }
    motion.onHide()
    // 收起的 200ms 里玻璃还在滑出，继续画；滑完再停
    const timer = window.setTimeout(() => {
      if (!visibleRef.current) stopLoop()
    }, 280)
    return () => window.clearTimeout(timer)
  }, [visible, theme.glassMode, startLoop, stopLoop])

  // ---- 滚动 → 背景视差（默认关，theme.glassScrollFlow 显式打开才生效） ----
  useEffect(() => {
    const onScroll = (event: Event): void => {
      const target = event.target
      if (!(target instanceof HTMLElement)) return
      if (!target.closest('.rail__scroll')) return
      const top = target.scrollTop
      const delta = top - scrollTopRef.current
      // scrollTop 的记账永远做：中途打开开关时才不会因为旧值算出一个巨大的 delta
      scrollTopRef.current = top
      if (!delta) return
      // 关掉时彻底不参与：背景只跟窗口位置和桌面像素有关，不跟滚动位置
      if (!themeRef.current.glassScrollFlow) return
      motionRef.current?.onScroll(delta)
      startLoop()
    }
    document.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () => document.removeEventListener('scroll', onScroll, { capture: true })
  }, [startLoop])

  // ---- 指针 → 光源方向 ----------------------------------------------------
  useEffect(() => {
    const onMove = (event: PointerEvent): void => {
      if (!visibleRef.current) return
      const width = window.innerWidth || 1
      const height = window.innerHeight || 1
      motionRef.current?.onPointerMove(event.clientX / width, event.clientY / height)
      startLoop()
    }
    const onLeave = (): void => motionRef.current?.onPointerLeave()
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerleave', onLeave)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerleave', onLeave)
    }
  }, [startLoop])

  // ---- 尺寸变化 -----------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const observer = new ResizeObserver(() => startLoop())
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [startLoop])

  const excite = useCallback(
    (strength = 1) => {
      motionRef.current?.tap(strength)
      startLoop()
    },
    [startLoop]
  )

  const debug = useCallback(
    () => ({
      status: statusRef.current,
      hasFrame: Boolean(frameRef.current),
      ready: rendererRef.current?.ready ?? false,
      webgl: rendererRef.current?.available ?? false,
      live: rendererRef.current?.liveReady ?? false,
      liveFrames: rendererRef.current?.liveFrames ?? 0,
      liveUploads: rendererRef.current?.liveUploads ?? 0,
      preRoll: preRollRef.current,
      visible: visibleRef.current,
      latency: rendererRef.current?.latency ?? null,
      videoState: videoStateRef.current,
      drawMs: Math.round(drawCostRef.current * 100) / 100,
      mode: themeRef.current.glassMode,
      frame: frameRef.current
        ? {
            width: frameRef.current.width,
            height: frameRef.current.height,
            displayWidth: frameRef.current.displayWidth,
            displayHeight: frameRef.current.displayHeight,
            panelX: frameRef.current.panelX,
            panelY: frameRef.current.panelY,
            bgra: frameRef.current.bgra,
            source: frameRef.current.source
          }
        : null,
      origin: originRef.current,
      motion: lastMotionRef.current,
      corner: cornerExtent(radiusRef.current, lookRef.current.cornerExp),
      look: lookRef.current
    }),
    []
  )

  // 冒烟脚本 / DevTools 里读一下玻璃到底有没有接管
  useEffect(() => {
    const host = window as Window & { __sillGlass?: unknown }
    host.__sillGlass = { debug, status }
    return () => {
      delete host.__sillGlass
    }
  }, [debug, status])

  return { canvasRef, status, excite, debug }
}
