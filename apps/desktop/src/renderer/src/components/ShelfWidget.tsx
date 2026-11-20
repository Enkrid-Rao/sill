import { useEffect, useState, type DragEvent } from 'react'
import type { ShelfShortcut } from '../../../shared/shelf'
import { t, type Language } from '../../../shared/i18n'

interface Props {
  language: Language
}

/** 快捷方式收纳盒：添加 / 打开 / 删除，支持把文件或文件夹直接拖进来。 */
export function ShelfWidget({ language }: Props): React.JSX.Element {
  const [items, setItems] = useState<ShelfShortcut[]>([])
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    let alive = true
    void window.sill?.listShelf().then((next) => {
      if (alive && next) setItems(next)
    })
    return () => {
      alive = false
    }
  }, [])

  const add = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    const next = await window.sill?.addShelf()
    setBusy(false)
    if (next) setItems(next)
  }

  const remove = async (id: string): Promise<void> => {
    const next = await window.sill?.removeShelf(id)
    if (next) setItems(next)
  }

  const drop = async (event: DragEvent<HTMLDivElement>): Promise<void> => {
    event.preventDefault()
    event.stopPropagation()
    setDragging(false)
    if (busy) return
    const paths = Array.from(event.dataTransfer.files)
      .map((file) => window.sill?.getPathForFile(file))
      .filter((path): path is string => Boolean(path))
    if (!paths.length) return
    setBusy(true)
    const next = await window.sill?.addShelfPaths(paths)
    setBusy(false)
    if (next) setItems(next)
  }

  return (
    <div
      className="shelf"
      data-drag={dragging ? 'true' : undefined}
      onDragEnter={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return
        event.preventDefault()
        setDragging(true)
      }}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
        setDragging(false)
      }}
      onDrop={(event) => void drop(event)}
    >
      <button
        className="shelf__add shelf__add--corner"
        type="button"
        aria-label={t(language, 'shelf.add')}
        title={t(language, 'shelf.add')}
        onClick={() => void add()}
        disabled={busy}
      >
        +
      </button>

      {items.length ? (
        <div className="shelf__grid">
          {items.map((item) => (
            <div className="shelf__item" key={item.id}>
              <button
                className="shelf__open"
                type="button"
                title={item.path}
                onClick={() => void window.sill?.openShelf(item.id)}
              >
                {item.icon ? (
                  <img className="shelf__icon" src={item.icon} alt="" draggable={false} />
                ) : (
                  <span className="shelf__fallback">↗</span>
                )}
                <span className="shelf__name">{item.name}</span>
              </button>
              <button
                className="shelf__remove"
                type="button"
                aria-label={t(language, 'shelf.remove')}
                title={t(language, 'shelf.remove')}
                onClick={() => void remove(item.id)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : (
        <button className="shelf__empty" type="button" onClick={() => void add()} disabled={busy}>
          {t(language, 'shelf.empty')}
        </button>
      )}

      {dragging ? (
        <div className="shelf__drop" aria-hidden="true">
          {t(language, 'shelf.drop')}
        </div>
      ) : null}
    </div>
  )
}
