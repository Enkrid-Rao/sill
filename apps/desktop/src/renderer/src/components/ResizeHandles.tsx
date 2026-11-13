import { useCallback, useEffect, useRef, useState } from 'react'
import { t, type Language } from '../../../shared/i18n'
import {
  columnsForWidth,
  PANEL_MAX_WIDTH,
  PANEL_MIN_HEIGHT,
  PANEL_MIN_WIDTH,
  PANEL_PRESETS
} from '../../../shared/layout'

type Axis = 'width' | 'height' | 'both'

interface Props {
  side: 'left' | 'right'
  language: Language
  onCommitted: (width: number, height: number) => void
}

interface DragState {
  axis: Axis
  pointerId: number
  startX: number
  startY: number
  startW: number
  startH: number
}

interface Hud {
  width: number
  height: number
  maxWidth: number
  maxHeight: number
  /** 吸附到的预设名，或 'fill' */
  snap: string | null
}

interface Request {
  width: number
  height: number
  snap: string | null
}

const SNAP_PX = 11

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** 宽度吸附到四个预设之一；高度吸附到预设固定高度或工作区上限 */
function snapSize(
  width: number,
  height: number,
  maxHeight: number,
  axis: Axis
): { width: number; height: number; snap: string | null } {
  let nextWidth = width
  let nextHeight = height
  let snap: string | null = null

  if (axis !== 'height') {
    const hit = PANEL_PRESETS.find((preset) => Math.abs(preset.width - width) <= SNAP_PX)
    if (hit) {
      nextWidth = hit.width
      snap = hit.id
    }
  }
  if (axis !== 'width') {
    if (Math.abs(maxHeight - height) <= SNAP_PX) {
      nextHeight = maxHeight
      snap = snap ?? 'fill'
    } else {
      const hit = PANEL_PRESETS.filter((preset) => preset.height > 0).find(
        (preset) => Math.abs(preset.height - height) <= SNAP_PX
      )
      if (hit) {
        nextHeight = hit.height
        snap = snap ?? hit.id
      }
    }
  }
  return { width: nextWidth, height: nextHeight, snap }
}

/**
 * 面板边缘的缩放把手。窗口是透明无边框的，原生 resizable 会露出系统边框，
 * 所以尺寸完全由这里驱动：pointermove → IPC → setBounds，松手写一次 settings。
 */
export function ResizeHandles({ side, language, onCommitted }: Props): React.JSX.Element {
  const [hud, setHud] = useState<Hud | null>(null)
  const [active, setActive] = useState(false)
  const dragRef = useRef<DragState | null>(null)
  const lastRef = useRef<Request>({ width: 0, height: 0, snap: null })
  const pendingRef = useRef<Request | null>(null)
  const inFlightRef = useRef(false)
  const hideTimer = useRef<number | null>(null)
  const commitTimer = useRef<number | null>(null)
  const limitsRef = useRef({
    maxWidth: PANEL_MAX_WIDTH,
    maxHeight: Math.max(PANEL_MIN_HEIGHT, window.screen.availHeight - 80)
  })

  const flush = useCallback(async function run(): Promise<void> {
    if (inFlightRef.current) return
    const next = pendingRef.current
    if (!next) return
    pendingRef.current = null
    inFlightRef.current = true
    try {
      const result = await window.sill?.resizePanel(next.width, next.height)
      if (result) {
        limitsRef.current = { maxWidth: result.maxWidth, maxHeight: result.maxHeight }
        setHud({
          width: result.width,
          height: result.height,
          maxWidth: result.maxWidth,
          maxHeight: result.maxHeight,
          snap: next.snap
        })
      }
    } finally {
      inFlightRef.current = false
      if (pendingRef.current) void run()
    }
  }, [])

  const request = useCallback(
    (width: number, height: number, snap: string | null) => {
      lastRef.current = { width, height, snap }
      pendingRef.current = { width, height, snap }
      void flush()
    },
    [flush]
  )

  const showHud = useCallback((next: Partial<Hud>) => {
    setHud((current) => ({
      width: current?.width ?? window.innerWidth,
      height: current?.height ?? window.innerHeight,
      maxWidth: current?.maxWidth ?? limitsRef.current.maxWidth,
      maxHeight: current?.maxHeight ?? limitsRef.current.maxHeight,
      snap: current?.snap ?? null,
      ...next
    }))
    if (hideTimer.current) window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => setHud(null), 2200)
  }, [])

  useEffect(() => {
    void window.sill?.getPanelSizeLimits().then((limits) => {
      if (limits) limitsRef.current = { maxWidth: limits.maxWidth, maxHeight: limits.maxHeight }
    })
    return () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current)
      if (commitTimer.current) window.clearTimeout(commitTimer.current)
    }
  }, [])

  // 拖动期间 HUD 一直可见：showHud 的自动隐藏只服务于松手之后
  useEffect(() => {
    if (active && hideTimer.current) {
      window.clearTimeout(hideTimer.current)
      hideTimer.current = null
    }
  }, [active])

  const begin = (axis: Axis) => (event: React.PointerEvent<HTMLDivElement>): void => {
    event.preventDefault()
    event.stopPropagation()
    if (dragRef.current) return
    const maxima = limitsRef.current
    const width = clamp(window.innerWidth, PANEL_MIN_WIDTH, maxima.maxWidth)
    const height = clamp(window.innerHeight, PANEL_MIN_HEIGHT, maxima.maxHeight)
    dragRef.current = {
      axis,
      pointerId: event.pointerId,
      // 窗口本身在拖动中会移动/改变尺寸，clientX 会跟着窗口原点漂移；
      // 屏幕坐标才是稳定的。
      startX: event.screenX,
      startY: event.screenY,
      startW: width,
      startH: height
    }
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // 合成事件（自动化测试）没有真实指针，capture 会失败；逻辑不依赖它
    }
    lastRef.current = { width, height, snap: null }
    setActive(true)
    showHud({ width, height, snap: null })
    void window.sill?.getPanelSizeLimits().then((limits) => {
      if (limits) limitsRef.current = { maxWidth: limits.maxWidth, maxHeight: limits.maxHeight }
    })
  }

  const move = (event: React.PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const maxima = limitsRef.current
    const dx = event.screenX - drag.startX
    const dy = event.screenY - drag.startY
    let width = drag.startW
    let height = drag.startH
    if (drag.axis !== 'height') {
      width = drag.startW + (side === 'right' ? -dx : dx)
    }
    if (drag.axis !== 'width') {
      height = drag.startH + dy
    }
    width = clamp(width, PANEL_MIN_WIDTH, maxima.maxWidth)
    height = clamp(height, PANEL_MIN_HEIGHT, maxima.maxHeight)
    const snapped = snapSize(width, height, maxima.maxHeight, drag.axis)
    request(snapped.width, snapped.height, snapped.snap)
  }

  const end = async (event: React.PointerEvent<HTMLDivElement>): Promise<void> => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // 指针已经释放
    }
    setActive(false)
    const final = lastRef.current
    const settings = await window.sill?.commitPanelSize(final.width, final.height)
    if (settings) onCommitted(settings.panelWidth, settings.panelHeight)
    showHud({ snap: final.snap })
  }

  const onKeyDown = (axis: Axis) => (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const step = event.shiftKey ? 64 : 16
    let width = window.innerWidth
    let height = window.innerHeight
    let handled = false
    if (axis !== 'height') {
      if (event.key === 'ArrowLeft') {
        width -= step
        handled = true
      } else if (event.key === 'ArrowRight') {
        width += step
        handled = true
      }
    }
    if (axis !== 'width') {
      if (event.key === 'ArrowUp') {
        height -= step
        handled = true
      } else if (event.key === 'ArrowDown') {
        height += step
        handled = true
      }
    }
    if (!handled) return
    event.preventDefault()
    const maxima = limitsRef.current
    width = clamp(width, PANEL_MIN_WIDTH, maxima.maxWidth)
    height = clamp(height, PANEL_MIN_HEIGHT, maxima.maxHeight)
    const snapped = snapSize(width, height, maxima.maxHeight, axis)
    request(snapped.width, snapped.height, snapped.snap)
    showHud({ width: snapped.width, height: snapped.height, snap: snapped.snap })
    if (commitTimer.current) window.clearTimeout(commitTimer.current)
    commitTimer.current = window.setTimeout(() => {
      void window.sill?.commitPanelSize(lastRef.current.width, lastRef.current.height).then((settings) => {
        if (settings) onCommitted(settings.panelWidth, settings.panelHeight)
      })
    }, 420)
  }

  const label = (axis: Axis): string =>
    axis === 'width'
      ? t(language, 'resize.widthGrip')
      : axis === 'height'
        ? t(language, 'resize.heightGrip')
        : t(language, 'resize.cornerGrip')

  const grip = (axis: Axis, className: string): React.JSX.Element => (
    <div
      className={`resize-handle ${className}`}
      role="separator"
      aria-orientation={axis === 'height' ? 'horizontal' : 'vertical'}
      aria-label={label(axis)}
      tabIndex={0}
      title={label(axis)}
      onPointerDown={begin(axis)}
      onPointerMove={move}
      onPointerUp={(event) => void end(event)}
      onPointerCancel={(event) => void end(event)}
      onKeyDown={onKeyDown(axis)}
    >
      <i aria-hidden="true" />
    </div>
  )

  const snapLabel = (() => {
    if (!hud) return ''
    const preset =
      PANEL_PRESETS.find(
        (item) =>
          Math.abs(item.width - hud.width) <= 2 &&
          (item.height === 0
            ? hud.height >= hud.maxHeight - 2
            : Math.abs(item.height - hud.height) <= 2)
      ) ?? null
    if (preset) return t(language, `shape.${preset.id}`)
    if (hud.height >= hud.maxHeight - 2) return t(language, 'size.fill')
    return `${columnsForWidth(hud.width)} ${t(language, 'size.columns')}`
  })()

  return (
    <div className="resize-layer" data-side={side} data-active={active}>
      {grip('width', 'resize-handle--width')}
      {grip('height', 'resize-handle--height')}
      {grip('both', 'resize-handle--corner')}
      {hud ? (
        <div className="resize-hud" role="status">
          <span className="resize-hud__dim">
            {hud.width} × {hud.height}
          </span>
          <span className="resize-hud__caps">{snapLabel}</span>
        </div>
      ) : null}
    </div>
  )
}
