import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
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
  children: ReactNode
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
  children
}: Props): React.JSX.Element {
  const id = definition.id
  const configured = layout.spans[id]
  const span =
    configured === undefined
      ? Math.min(columns, definition.spanFor(columns))
      : clampSpan(configured, columns)
  const drag = useRef<{
    mode: 'move' | 'resize'
    x: number
    y: number
    box: WidgetBox
  } | null>(null)

  const begin = (event: ReactPointerEvent, mode: 'move' | 'resize'): void => {
    if (!editing || !free || !box) return
    event.preventDefault()
    event.stopPropagation()
    drag.current = { mode, x: event.clientX, y: event.clientY, box }
    const move = (next: PointerEvent): void => {
      const state = drag.current
      if (!state) return
      const dx = next.clientX - state.x
      const dy = next.clientY - state.y
      if (state.mode === 'move') {
        onBox({ ...state.box, x: Math.max(0, state.box.x + dx), y: Math.max(0, state.box.y + dy) })
      } else {
        onBox({
          ...state.box,
          w: Math.max(120, state.box.w + dx),
          h: Math.max(48, state.box.h + dy)
        })
      }
    }
    const end = (): void => {
      drag.current = null
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
  }

  const absolute = free && box
  return (
    <section
      className={`card ${definition.className ?? ''}`.trim()}
      data-card={id}
      data-free={absolute ? 'true' : undefined}
      style={
        absolute
          ? {
              position: 'absolute',
              left: box.x,
              top: box.y,
              width: box.w,
              height: box.h,
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
          <span
            className="card-tools__grip"
            aria-hidden="true"
            onPointerDown={(event) => begin(event, 'move')}
          >
            ⠿
          </span>
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
              <span className="card-tools__spans" title={t(language, 'layout.columns')}>
                {Array.from({ length: columns }, (_, index) => index + 1).map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={span === value}
                    onClick={() => onSpan(id, value)}
                  >
                    {value}
                  </button>
                ))}
              </span>
            </>
          ) : null}
        </div>
      ) : null}
      {absolute && editing ? (
        <span
          className="card-resize"
          aria-hidden="true"
          onPointerDown={(event) => begin(event, 'resize')}
        />
      ) : null}
      {children}
    </section>
  )
}
