import { useEffect, useState, type DragEvent } from 'react'
import type { ShelfShortcut } from '../../../shared/shelf'
import { t, type Language } from '../../../shared/i18n'

interface Props {
  language: Language
}

/** 没有可用图标时用首字母贴片：比一张「默认应用图」或白纸更像有意的设计 */
function initial(name: string): string {
  const first = Array.from(name.trim())[0] ?? '?'
  return first.toUpperCase()
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
    // 右键菜单 / 选图对话框是在主进程里进行的，结果通过事件推回来
    const off = window.sill?.onShelfChanged((next) => {
      if (alive) setItems(next)
    })
    return () => {
      alive = false
      off?.()
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

  const pickIcon = async (id: string): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      const next = await window.sill?.setShelfIcon(id)
      if (next) setItems(next)
    } finally {
      setBusy(false)
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
      /* 告诉 App：这个卡片的可用高度要按内容撑开（条目行 + 标题）。
         不加这个标记的话，卡片会把网格挤扁，图标被裁掉一半、名字也看不见。 */
      data-fit="1"
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
            <div
              className="shelf__item"
              key={item.id}
              onContextMenu={(event) => {
                event.preventDefault()
                void window.sill?.shelfMenu(item.id)
              }}
            >
              <button
                className="shelf__open"
                type="button"
                title={`${item.path}\n右键：设置图标`}
                onClick={() => void window.sill?.openShelf(item.id)}
              >
                {item.icon ? (
                  <img className="shelf__icon" src={item.icon} alt="" draggable={false} />
                ) : (
                  <span className="shelf__fallback" aria-hidden="true">
                    {initial(item.name)}
                  </span>
                )}
                <span className="shelf__name">{item.name}</span>
              </button>
              <button
                className="shelf__pick"
                type="button"
                aria-label={t(language, 'shelf.icon')}
                title={t(language, 'shelf.icon')}
                onClick={() => void pickIcon(item.id)}
              >
                <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
                  <path
                    d="M2.5 3.5h11v9h-11zM2.5 10l3-3 2.5 2.5 2-2 3.5 3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinejoin="round"
                  />
                </svg>
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
