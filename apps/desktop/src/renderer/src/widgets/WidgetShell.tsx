import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { t, type Language } from '../../../shared/i18n'
import { clampSpan, type PanelLayout, type WidgetBox } from '../../../shared/layout'
import type { WidgetDefinition } from './types'

interface Props {
  definition: WidgetDefinition
  layout: PanelLayout
  columns: number
  editing: boolean
  free: boolean
  box?: WidgetBox
  dragId: string | null
  language: Language
  onMove: (id: string, direction: -1 | 1) => void
  onSpan: (id: string, span: number) => void
  onBox: (box: WidgetBox) => void
  onDragStart: (id: string) => void
  onDragEnd: () => void
  onDrop: (from: string, to: string) => void
  onGuides: (guides: { x: number | null; y: number | null } | null) => void
  children: ReactNode
}

/** 键盘移动 / 缩放步长；Shift 加速 */
const KEY_STEP = 4
const KEY_STEP_FAST = 16
const MIN_BOX_WIDTH = 150
const MIN_BOX_HEIGHT = 48
const SNAP_PX = 6

interface SnapResult {
  box: WidgetBox
  guideX: number | null
  guideY: number | null
}

function closestSnap(edges: readonly number[], targets: readonly number[]): { delta: number; line: number } | null {
  let best: { delta: number; line: number } | null = null
  for (const edge of edges) {
    for (const target of targets) {
      const delta = target - edge
      if (Math.abs(delta) > SNAP_PX) continue
      if (!best || Math.abs(delta) < Math.abs(best.delta)) best = { delta, line: target }
    }
  }
  return best
}

/** 吸附到面板边缘 / 中线和其他卡片的边、中线；返回相对 sheet 的辅助线位置。 */
function snapBox(
  box: WidgetBox,
  mode: 'move' | 'resize',
  id: string,
  card: HTMLElement | null
): SnapResult {
  const sheet = card?.closest<HTMLElement>('.sheet')
  if (!sheet) return { box, guideX: null, guideY: null }
  const base = sheet.getBoundingClientRect()
  const targetsX = [0, base.width / 2, base.width]
  const targetsY = [0, base.height / 2, base.height]

  for (const element of sheet.querySelectorAll<HTMLElement>('.card')) {
    if (element === card || element.dataset.card === id) continue
    const rect = element.getBoundingClientRect()
    const left = rect.left - base.left
    const top = rect.top - base.top
    targetsX.push(left, left + rect.width / 2, left + rect.width)
    targetsY.push(top, top + rect.height / 2, top + rect.height)
  }

  if (mode === 'move') {
    const x = closestSnap([box.x, box.x + box.w / 2, box.x + box.w], targetsX)
    const y = closestSnap([box.y, box.y + box.h / 2, box.y + box.h], targetsY)
    return {
      box: {
        ...box,
        x: Math.max(0, Math.round(box.x + (x?.delta ?? 0))),
        y: Math.max(0, Math.round(box.y + (y?.delta ?? 0)))
      },
      guideX: x?.line ?? null,
      guideY: y?.line ?? null
    }
  }

  const w = closestSnap([box.x + box.w], targetsX)
  const h = closestSnap([box.y + box.h], targetsY)
  return {
    box: {
      ...box,
      w: Math.max(MIN_BOX_WIDTH, Math.round(box.w + (w?.delta ?? 0))),
      h: Math.max(MIN_BOX_HEIGHT, Math.round(box.h + (h?.delta ?? 0)))
    },
    guideX: w?.line ?? null,
    guideY: h?.line ?? null
  }
}

/**
 * 一张卡的容器。flow 模式走网格；free 模式走绝对定位。
 * 内容完全来自 WidgetDefinition.render()。
 */
export function WidgetShell({
  definition,
  layout,
  columns,
  editing,
  free,
  box,
  dragId,
  language,
  onMove,
  onSpan,
  onBox,
  onDragStart,
  onDragEnd,
  onDrop,
  onGuides,
  children
}: Props): React.JSX.Element {
  const id = definition.id
  const cardRef = useRef<HTMLElement>(null)
  const configured = layout.spans[id]
  const span =
    configured === undefined
      ? Math.min(columns, definition.spanFor(columns))
      : clampSpan(configured, columns)
  // 拖动 / 缩放期间只更新本地草稿，松手才 onBox 一次；避免每个 pointermove 都写盘
  const [draft, setDraft] = useState<WidgetBox | null>(null)
  const draftRef = useRef<WidgetBox | null>(null)
  const stopRef = useRef<(() => void) | null>(null)

  useEffect(
    () => () => {
      stopRef.current?.()
      stopRef.current = null
    },
    []
  )

  const track = (start: WidgetBox, mode: 'move' | 'resize', event: ReactPointerEvent): void => {
    if (!editing || !free) return
    event.preventDefault()
    event.stopPropagation()
    stopRef.current?.()
    const originX = event.clientX
    const originY = event.clientY
    let frame = 0
    let pending: WidgetBox | null = null
    let pendingGuides: { x: number | null; y: number | null } | null = null

    const flush = (): void => {
      frame = 0
      if (!pending) return
      draftRef.current = pending
      setDraft(pending)
      onGuides(pendingGuides)
      pending = null
    }

    const move = (next: PointerEvent): void => {
      const dx = next.clientX - originX
      const dy = next.clientY - originY
      const raw: WidgetBox =
        mode === 'move'
          ? {
              ...start,
              x: Math.max(0, start.x + dx),
              y: Math.max(0, start.y + dy)
            }
          : {
              ...start,
              w: Math.max(MIN_BOX_WIDTH, start.w + dx),
              h: Math.max(MIN_BOX_HEIGHT, start.h + dy)
            }
      const snapped = snapBox(raw, mode, id, cardRef.current)
      pending = snapped.box
      pendingGuides = { x: snapped.guideX, y: snapped.guideY }
      if (!frame) frame = window.requestAnimationFrame(flush)
    }

    const stop = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      stopRef.current = null
    }

    const finish = (): void => {
      if (frame) window.cancelAnimationFrame(frame)
      if (pending) {
        draftRef.current = pending
        setDraft(pending)
        pending = null
      }
      const next = draftRef.current
      draftRef.current = null
      setDraft(null)
      onGuides(null)
      stop()
      if (next) onBox(next)
    }

    stopRef.current = stop
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
  }

  const nudge = (event: KeyboardEvent<HTMLElement>, mode: 'move' | 'resize'): void => {
    if (!box || !editing || !free) return
    const step = event.shiftKey ? KEY_STEP_FAST : KEY_STEP
    const delta = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step]
    } as const
    const change = delta[event.key as keyof typeof delta]
    if (!change) return
    event.preventDefault()
    event.stopPropagation()
    const [dx, dy] = change
    if (mode === 'move') {
      onBox({ ...box, x: Math.max(0, box.x + dx), y: Math.max(0, box.y + dy) })
      return
    }
    onBox({
      ...box,
      w: Math.max(MIN_BOX_WIDTH, box.w + dx),
      h: Math.max(MIN_BOX_HEIGHT, box.h + dy)
    })
  }

  const absolute = free && box
  const shown = draft ?? box
  return (
    <section
      ref={cardRef}
      className={`card ${definition.className ?? ''}`.trim()}
      data-card={id}
      data-free={absolute ? 'true' : undefined}
      data-dragging={draft ? 'true' : undefined}
      style={
        absolute && shown
          ? {
              position: 'absolute',
              left: shown.x,
              top: shown.y,
              width: shown.w,
              height: shown.h,
              order: undefined,
              gridColumn: undefined,
              overflow: 'hidden'
            }
          : {
              order: layout.order.indexOf(id),
              ...(columns > 1 ? { gridColumn: `span ${span}` } : {})
            }
      }
      draggable={editing && !free}
      onDragStart={(event) => {
        if (!editing || free) return
        event.dataTransfer.setData('text/plain', id)
        event.dataTransfer.effectAllowed = 'move'
        onDragStart(id)
      }}
      onDragOver={(event) => {
        if (!editing || free || !dragId) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
      }}
      onDrop={(event) => {
        if (!editing || free) return
        event.preventDefault()
        const from = event.dataTransfer.getData('text/plain') || dragId
        if (from) onDrop(from, id)
        onDragEnd()
      }}
      onDragEnd={onDragEnd}
    >
      {editing ? (
        <div className="card-tools" draggable={false} onDragStart={(event) => event.preventDefault()}>
          <button
            type="button"
            className="card-tools__grip"
            aria-label={t(language, 'layout.move')}
            title={t(language, 'layout.move')}
            onPointerDown={(event) => {
              if (!box) return
              track(box, 'move', event)
            }}
            onKeyDown={(event) => nudge(event, 'move')}
          >
            ⠿
          </button>
          {!free ? (
            <>
              <button
                type="button"
                aria-label={t(language, 'layout.up')}
                title={t(language, 'layout.up')}
                onClick={() => onMove(id, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={t(language, 'layout.down')}
                title={t(language, 'layout.down')}
                onClick={() => onMove(id, 1)}
              >
                ↓
              </button>
              <div className="card-tools__spans" role="group" aria-label={t(language, 'layout.columns')}>
                {Array.from({ length: columns }, (_, index) => index + 1).map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-label={`${value} ${t(language, 'layout.columns')}`}
                    aria-pressed={span === value}
                    onClick={() => onSpan(id, value)}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
      {absolute && editing ? (
        <button
          type="button"
          className="card-resize"
          aria-label={t(language, 'layout.resize')}
          title={t(language, 'layout.resize')}
          onPointerDown={(event) => {
            if (!box) return
            track(box, 'resize', event)
          }}
          onKeyDown={(event) => nudge(event, 'resize')}
        />
      ) : null}
      {children}
    </section>
  )
}
