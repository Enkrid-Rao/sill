import type { ReactNode } from 'react'
import { t, type Language } from '../../../shared/i18n'
import { clampSpan, type PanelLayout } from '../../../shared/layout'
import type { WidgetDefinition } from './types'

interface Props {
  definition: WidgetDefinition
  layout: PanelLayout
  columns: number
  editing: boolean
  dragId: string | null
  language: Language
  onMove: (id: string, direction: -1 | 1) => void
  onSpan: (id: string, span: number) => void
  onDragStart: (id: string) => void
  onDragEnd: () => void
  onDrop: (from: string, to: string) => void
  children: ReactNode
}

/**
 * 一张卡的容器：网格落位、编辑态工具、拖拽交换。
 * 内容完全来自 WidgetDefinition.render()，所以这里不出现任何组件名字。
 */
export function WidgetShell({
  definition,
  layout,
  columns,
  editing,
  dragId,
  language,
  onMove,
  onSpan,
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

  return (
    <section
      className={`card ${definition.className ?? ''}`.trim()}
      data-card={id}
      style={{
        order: layout.order.indexOf(id),
        ...(columns > 1 ? { gridColumn: `span ${span}` } : {})
      }}
      draggable={editing}
      onDragStart={(event) => {
        if (!editing) return
        event.dataTransfer.setData('text/plain', id)
        event.dataTransfer.effectAllowed = 'move'
        onDragStart(id)
      }}
      onDragOver={(event) => {
        if (!editing || !dragId) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
      }}
      onDrop={(event) => {
        if (!editing) return
        event.preventDefault()
        const from = (event.dataTransfer.getData('text/plain') || dragId) as string
        if (from) onDrop(from, id)
        onDragEnd()
      }}
      onDragEnd={onDragEnd}
    >
      {editing ? (
        <div className="card-tools" draggable={false} onDragStart={(event) => event.preventDefault()}>
          <span className="card-tools__grip" aria-hidden="true">
            ⠿
          </span>
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
        </div>
      ) : null}
      {children}
    </section>
  )
}
