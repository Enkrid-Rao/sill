import { useEffect, useState } from 'react'
import type { ShelfShortcut } from '../../../shared/shelf'
import { t, type Language } from '../../../shared/i18n'

interface Props {
  language: Language
}

/** 快捷方式收纳盒：只做添加 / 打开 / 删除，不做文件管理。 */
export function ShelfWidget({ language }: Props): React.JSX.Element {
  const [items, setItems] = useState<ShelfShortcut[]>([])
  const [busy, setBusy] = useState(false)

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

  return (
    <div className="shelf">
      <div className="shelf__head">
        <span className="cap">{t(language, 'shelf.title')}</span>
        <button className="shelf__add" type="button" onClick={() => void add()} disabled={busy}>
          {t(language, 'shelf.add')}
        </button>
      </div>

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
    </div>
  )
}
