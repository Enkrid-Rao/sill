import { useEffect, useState, type DragEvent } from 'react'
import type { ShelfShortcut } from '../../../shared/shelf'
import { t, type Language } from '../../../shared/i18n'

interface Props {
  language: Language
}

/** 快捷方式收纳盒：添加 / 打开 / 删除，支持把文件或文件夹直接拖进来。 */
export function ShelfWidget({ language }: Props): React.JSX.Element {
  const [items, setItems] = useState<ShelfShortcut[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    let alive = true
    const request = window.sill?.listShelf()
    if (!request) {
      setLoaded(true)
      return
    }
    void request
      .then((next) => {
        if (alive && next) setItems(next)
      })
      .finally(() => {
        if (alive) setLoaded(true)
      })
    return () => {
      alive = false
    }
  }, [])

  const add = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      const next = await window.sill?.addShelf()
      if (next) setItems(next)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: string): Promise<void> => {
    try {
      const next = await window.sill?.removeShelf(id)
      if (next) setItems(next)
    } catch {
      // 删除失败：保留当前图标，不把界面锁在 busy 上
    }
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
    try {
      const next = await window.sill?.addShelfPaths(paths)
      if (next) setItems(next)
    } finally {
      setBusy(false)
    }
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
      <div className="shelf__head">
        <span className="cap">{t(language, 'shelf.title')}</span>
        <span className="shelf__meta">
          {items.length ? (
            <span className="shelf__count" aria-label={String(items.length)}>
              {items.length}
            </span>
          ) : null}
          <button
            className="shelf__add"
            type="button"
            aria-label={t(language, 'shelf.add')}
            title={t(language, 'shelf.add')}
            onClick={() => void add()}
            disabled={busy || !loaded}
          >
            +
          </button>
        </span>
      </div>

      {!loaded ? (
        <div className="shelf__loading" aria-hidden="true" />
      ) : items.length ? (
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
