import { useEffect, useRef, useState } from 'react'
import type { TodoItem } from '../../../../shared/data'
import { t, type Language, type TranslationKey } from '../../../../shared/i18n'

interface Props {
  items: TodoItem[]
  language: Language
  onAdd: (text: string) => Promise<void>
  onToggle: (id: string) => Promise<void>
  onUpdate: (id: string, text: string) => Promise<void>
  onRestore: (item: TodoItem, index: number) => Promise<void>
  onRemove: (id: string) => Promise<void>
}

type Filter = 'open' | 'closed' | 'all'

const FILTERS: readonly Filter[] = ['open', 'closed', 'all']
const FILTER_LABEL: Record<Filter, TranslationKey> = {
  open: 'todo.filterOpen',
  closed: 'todo.filterClosed',
  all: 'todo.filterAll'
}

/** 行高收合 + 横向淡出的时长；主进程删除在这之后才发生 */
const LEAVE_MS = 280
const RIPPLE_MS = 620
/** 勾选 / 取消勾选后，让当前行多留 360ms，先看完 check 再按过滤器收合 */
const FILTER_HOLD_MS = 360
const UNDO_MS = 5000

/**
 * 待办卡片。
 *
 * 交互与 LiquidGlassTodo（Tide）保持同一套语言：
 *  - Open / Closed / All 三段过滤器，缩略块滑动切换；
 *  - 任务按插入顺序留在原地，勾选只改变状态，不重新排序；
 *  - 删除是「原位横向淡出 + 行高平滑收合」，没有任何 translateY；
 *  - 勾选有 ripple，勾与删除线连续画出来；
 *  - 删除后 5 秒内可撤销，恢复原 id / 完成状态 / 位置；
 *  - 行内编辑，Enter 保存、Esc 取消、失焦保存。
 */
export function TodoWidget({
  items: itemsProp,
  language,
  onAdd,
  onToggle,
  onUpdate,
  onRestore,
  onRemove
}: Props): React.JSX.Element {
  const [items, setItems] = useState<TodoItem[]>(itemsProp)
  const [filter, setFilter] = useState<Filter>('open')
  const [draft, setDraft] = useState('')
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(() => new Set())
  const [held, setHeld] = useState<ReadonlySet<string>>(() => new Set())
  const [justChecked, setJustChecked] = useState<ReadonlySet<string>>(() => new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [undo, setUndo] = useState<{ item: TodoItem; index: number } | null>(null)
  const itemsRef = useRef(items)
  const addRef = useRef<HTMLInputElement>(null)
  const editRef = useRef<HTMLInputElement>(null)
  const undoRef = useRef<HTMLButtonElement>(null)
  const editSettled = useRef(false)
  const timers = useRef<Set<number>>(new Set())
  const undoTimer = useRef<number | null>(null)

  useEffect(() => {
    itemsRef.current = items
  }, [items])

  // 父级返回真值后同步本地镜像；已经离开视线的行从临时状态里清掉
  useEffect(() => {
    setItems(itemsProp)
    setLeaving((current) => {
      if (!current.size) return current
      const next = new Set([...current].filter((id) => itemsProp.some((item) => item.id === id)))
      return next.size === current.size ? current : next
    })
    setHeld((current) => {
      if (!current.size) return current
      const next = new Set([...current].filter((id) => itemsProp.some((item) => item.id === id)))
      return next.size === current.size ? current : next
    })
    setEditingId((current) =>
      current && itemsProp.some((item) => item.id === current) ? current : null
    )
  }, [itemsProp])

  useEffect(() => {
    if (!editingId) return
    const input = editRef.current
    input?.focus()
    input?.select()
  }, [editingId])

  useEffect(
    () => () => {
      timers.current.forEach((id) => window.clearTimeout(id))
      timers.current.clear()
      if (undoTimer.current) window.clearTimeout(undoTimer.current)
      void window.sill?.setTyping(false)
    },
    []
  )

  /** 统一登记短定时器：回调自己从集合里删掉，不会越积越多。 */
  const later = (fn: () => void, ms: number): void => {
    const id = window.setTimeout(() => {
      timers.current.delete(id)
      fn()
    }, ms)
    timers.current.add(id)
  }

  const hideLater = (id: string): void => {
    setHeld((current) => new Set(current).add(id))
    later(() => {
      setHeld((current) => {
        if (!current.has(id)) return current
        const next = new Set(current)
        next.delete(id)
        return next
      })
    }, FILTER_HOLD_MS)
  }

  const isHidden = (item: TodoItem): boolean => {
    if (held.has(item.id)) return false
    if (filter === 'open') return item.done
    if (filter === 'closed') return !item.done
    return false
  }

  const changeFilter = (next: Filter): void => {
    if (next === filter) return
    if (editingId) finishEdit(true)
    editSettled.current = true
    setFilter(next)
    setHeld(new Set())
    setEditingId(null)
  }

  const clearUndoTimer = (): void => {
    if (undoTimer.current) {
      window.clearTimeout(undoTimer.current)
      undoTimer.current = null
    }
  }

  const toggle = (id: string): void => {
    if (leaving.has(id)) return
    const target = items.find((item) => item.id === id)
    if (!target) return
    const previous = items
    const nextDone = !target.done
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, done: nextDone } : item))
    )

    // Open 下勾上 / Closed 下取消勾选：先让 check 留一会儿，再按过滤器收合
    if ((filter === 'open' && nextDone) || (filter === 'closed' && !nextDone)) {
      hideLater(id)
    } else {
      setHeld((current) => {
        if (!current.has(id)) return current
        const next = new Set(current)
        next.delete(id)
        return next
      })
    }

    // 只有勾上时才放 ripple；取消勾选是安静地退回未完成
    if (nextDone) {
      setJustChecked((current) => new Set(current).add(id))
      later(() => {
        setJustChecked((current) => {
          if (!current.has(id)) return current
          const next = new Set(current)
          next.delete(id)
          return next
        })
      }, RIPPLE_MS)
    }

    // 主进程失败时回到点击前的列表，不把「已勾选」留在界面上
    void onToggle(id).catch(() => {
      setItems(previous)
      setHeld((current) => {
        if (!current.has(id)) return current
        const next = new Set(current)
        next.delete(id)
        return next
      })
      setJustChecked((current) => {
        if (!current.has(id)) return current
        const next = new Set(current)
        next.delete(id)
        return next
      })
    })
  }

  const remove = (id: string): void => {
    if (leaving.has(id)) return
    const index = items.findIndex((item) => item.id === id)
    const target = items[index]
    if (!target) return

    setLeaving((current) => new Set(current).add(id))
    if (editingId === id) {
      editSettled.current = true
      setEditingId(null)
    }
    later(() => {
      // 先让行高收合、内容横移淡出，再交给主进程删除
      void onRemove(id)
        .then(() => {
          clearUndoTimer()
          setUndo({ item: target, index })
          undoTimer.current = window.setTimeout(() => {
            const active = document.activeElement
            const hadFocus =
              undoRef.current && active instanceof Node && undoRef.current.contains(active)
            setUndo(null)
            if (hadFocus) addRef.current?.focus({ preventScroll: true })
          }, UNDO_MS)
        })
        .catch(() => {
          // 失败兜底：条目还在本地列表里就别让它一直保持收合态
          later(() => {
            if (!itemsRef.current.some((item) => item.id === id)) return
            setLeaving((current) => {
              if (!current.has(id)) return current
              const next = new Set(current)
              next.delete(id)
              return next
            })
          }, 420)
        })
    }, LEAVE_MS)
  }

  // 撤销条出现时把焦点交给「撤销」，键盘用户不用重新 Tab 一遍
  useEffect(() => {
    if (undo) undoRef.current?.focus({ preventScroll: true })
  }, [undo])

  const undoRemove = (): void => {
    if (!undo) return
    const target = undo
    clearUndoTimer()
    setUndo(null)
    void onRestore(target.item, target.index).then(
      () => addRef.current?.focus({ preventScroll: true }),
      () => addRef.current?.focus({ preventScroll: true })
    )
  }

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const text = draft.trim()
    if (!text) return
    setDraft('')
    // LiquidGlassTodo 在 Closed 下新增会切回 Open；Sill 也保持一致
    if (filter === 'closed') changeFilter('open')
    addRef.current?.focus({ preventScroll: true })
    void onAdd(text).catch(() => {
      // 写入失败：把文字还给输入框，别让用户白打一遍
      setDraft((current) => (current ? current : text))
      addRef.current?.focus({ preventScroll: true })
    })
  }

  const startEdit = (item: TodoItem): void => {
    if (editingId) finishEdit(true)
    editSettled.current = false
    setEditingId(item.id)
    setEditDraft(item.text)
  }

  const finishEdit = (commit: boolean): void => {
    if (!editingId || editSettled.current) return
    editSettled.current = true
    const id = editingId
    const text = editDraft.trim().slice(0, 200)
    setEditingId(null)
    if (!commit || !text) return
    const target = itemsRef.current.find((item) => item.id === id)
    if (!target || target.text === text) return
    const previousText = target.text
    setItems((current) => current.map((item) => (item.id === id ? { ...item, text } : item)))
    void onUpdate(id, text).catch(() => {
      setItems((current) =>
        current.map((item) => (item.id === id ? { ...item, text: previousText } : item))
      )
    })
  }

  // 面板的 Esc 是全局快捷键，输入框聚焦时主进程会把 Esc 交回这里取消输入
  useEffect(() => {
    const off = window.sill?.onEscapeInput(() => {
      if (editingId) {
        finishEdit(false)
      } else {
        setDraft('')
        addRef.current?.blur()
      }
      void window.sill?.setTyping(false)
    })
    return off
    // finishEdit 依赖 editingId / editDraft；订阅随之更新
  }, [editingId, editDraft])

  const openCount = items.filter((item) => !item.done).length
  const closedCount = items.length - openCount
  const countFor = (key: Filter): number =>
    key === 'open' ? openCount : key === 'closed' ? closedCount : items.length
  const visibleCount = items.filter((item) => !isHidden(item)).length
  const emptyKey: TranslationKey = !items.length
    ? 'todo.empty'
    : filter === 'closed'
      ? 'todo.emptyClosed'
      : filter === 'open'
        ? 'todo.emptyOpen'
        : 'todo.empty'

  return (
    <>
      <div className="task-head">
        <span className="cap">{t(language, 'todo.today')}</span>
        <div
          className="task-filter"
          role="group"
          aria-label={t(language, 'todo.filter')}
          style={{ '--filter-index': FILTERS.indexOf(filter) } as React.CSSProperties}
        >
          <span className="task-filter__thumb" aria-hidden="true" />
          {FILTERS.map((key) => (
            <button
              key={key}
              type="button"
              className={`task-filter__btn${filter === key ? ' is-active' : ''}`}
              aria-pressed={filter === key}
              onClick={() => changeFilter(key)}
            >
              <span>{t(language, FILTER_LABEL[key])}</span>
              <b>{countFor(key)}</b>
            </button>
          ))}
        </div>
      </div>

      <div className="tasks">
        {items.map((item) => {
          const hidden = isHidden(item)
          const editing = editingId === item.id
          return (
            <div
              key={item.id}
              className={`task-row${leaving.has(item.id) ? ' is-leaving' : ''}${
                hidden ? ' is-filtered' : ''
              }`}
              data-task-id={item.id}
              data-done={item.done}
              data-filtered={hidden || undefined}
              aria-hidden={hidden || undefined}
              inert={hidden || undefined}
            >
              <div className="task-row__inner">
                <div
                  className={`task${item.done ? ' task--done' : ''}${
                    justChecked.has(item.id) ? ' task--just-checked' : ''
                  }${editing ? ' is-editing' : ''}`}
                >
                  <button
                    type="button"
                    className="task__toggle"
                    aria-pressed={item.done}
                    disabled={editing}
                    onClick={() => toggle(item.id)}
                  >
                    <span className="dot" aria-hidden="true">
                      <span className="dot__ripple" />
                      <svg viewBox="0 0 16 16">
                        <path
                          d="M3.7 8.5 6.5 11.2 12.4 5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.9"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                    <span className="task__text" title={item.text}>
                      {item.text}
                    </span>
                  </button>
                  {editing ? (
                    <input
                      ref={editRef}
                      className="task__edit-input"
                      value={editDraft}
                      maxLength={200}
                      spellCheck={false}
                      aria-label={t(language, 'todo.edit')}
                      onChange={(event) => setEditDraft(event.currentTarget.value)}
                      onFocus={() => void window.sill?.setTyping(true)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          finishEdit(true)
                        } else if (event.key === 'Escape') {
                          event.preventDefault()
                          event.stopPropagation()
                          finishEdit(false)
                        }
                      }}
                      onBlur={() => {
                        void window.sill?.setTyping(false)
                        finishEdit(true)
                      }}
                    />
                  ) : null}
                  <button
                    className="task__edit"
                    type="button"
                    aria-label={t(language, 'todo.edit')}
                    title={t(language, 'todo.edit')}
                    onClick={() => startEdit(item)}
                  >
                    <svg viewBox="0 0 12 12" aria-hidden="true">
                      <path
                        d="m7.9 2.3 1.8 1.8M2.6 9.4l.4-2.1 4.4-4.4 1.8 1.8-4.4 4.4-2.2.3Z"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.05"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                  <button
                    className="task__remove"
                    type="button"
                    aria-label={t(language, 'todo.remove')}
                    title={t(language, 'todo.remove')}
                    onClick={() => remove(item.id)}
                  >
                    <svg viewBox="0 0 12 12" aria-hidden="true">
                      <path
                        d="m3.2 3.2 5.6 5.6M8.8 3.2 3.2 8.8"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.25"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          )
        })}
        {!visibleCount ? <div className="sub task__empty">{t(language, emptyKey)}</div> : null}
      </div>

      <form className={`addrow${draft ? ' has-text' : ''}`} onSubmit={submit}>
        <span className="plus" aria-hidden="true" />
        <input
          ref={addRef}
          className="addrow__input"
          value={draft}
          maxLength={200}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onFocus={() => void window.sill?.setTyping(true)}
          onBlur={() => void window.sill?.setTyping(false)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation()
              setDraft('')
              void window.sill?.setTyping(false)
            }
          }}
          placeholder={t(language, 'todo.add')}
          aria-label={t(language, 'todo.add')}
          spellCheck={false}
        />
        {draft ? (
          <span className="addrow__hint" aria-hidden="true">
            ↵
          </span>
        ) : null}
      </form>

      {undo ? (
        <div className="todo-toast" role="status" aria-live="polite">
          <span className="todo-toast__msg">{t(language, 'todo.removed')}</span>
          <button ref={undoRef} className="todo-toast__undo" type="button" onClick={undoRemove}>
            {t(language, 'todo.undo')}
          </button>
        </div>
      ) : null}
    </>
  )
}
