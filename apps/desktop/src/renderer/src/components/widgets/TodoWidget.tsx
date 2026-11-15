import { useEffect, useRef, useState } from 'react'
import type { TodoItem } from '../../../../shared/data'
import { t, type Language } from '../../../../shared/i18n'

interface Props {
  items: TodoItem[]
  language: Language
  onAdd: (text: string) => Promise<void>
  onToggle: (id: string) => Promise<void>
  onRemove: (id: string) => Promise<void>
}

/** 行高收合 + 横向淡出的时长；主进程删除在这之后才发生 */
const LEAVE_MS = 280
const RIPPLE_MS = 620

/**
 * 待办卡片。
 *
 * 交互与 LiquidGlassTodo（Tide）保持同一套语言：
 *  - 任务按插入顺序留在原地，勾选只改变状态，**不上下移动、不重新排序**；
 *  - 删除是「原位横向淡出 + 行高平滑收合」，没有任何 translateY；
 *  - 勾选有 ripple，勾与删除线连续画出来；
 *  - 新增任务从下方 7px 淡入并轻微模糊，和 Tide 的 task-in 一致。
 */
export function TodoWidget({ items: itemsProp, language, onAdd, onToggle, onRemove }: Props): React.JSX.Element {
  const [items, setItems] = useState<TodoItem[]>(itemsProp)
  const [draft, setDraft] = useState('')
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(() => new Set())
  const [justChecked, setJustChecked] = useState<ReadonlySet<string>>(() => new Set())
  const itemsRef = useRef(items)
  const addRef = useRef<HTMLInputElement>(null)
  const timers = useRef<number[]>([])

  useEffect(() => {
    itemsRef.current = items
  }, [items])

  // 父级返回真值后同步本地镜像；已经离开视线的行从 leaving 里清掉
  useEffect(() => {
    setItems(itemsProp)
    setLeaving((current) => {
      if (!current.size) return current
      const next = new Set([...current].filter((id) => itemsProp.some((item) => item.id === id)))
      return next.size === current.size ? current : next
    })
  }, [itemsProp])

  useEffect(
    () => () => {
      timers.current.forEach((id) => window.clearTimeout(id))
    },
    []
  )

  const remember = (timer: number): void => {
    timers.current.push(timer)
  }

  const toggle = (id: string): void => {
    if (leaving.has(id)) return
    const target = items.find((item) => item.id === id)
    if (!target) return
    const nextDone = !target.done
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, done: nextDone } : item))
    )
    // 只有勾上时才放 ripple；取消勾选是安静地退回未完成
    if (nextDone) {
      setJustChecked((current) => new Set(current).add(id))
      remember(
        window.setTimeout(() => {
          setJustChecked((current) => {
            if (!current.has(id)) return current
            const next = new Set(current)
            next.delete(id)
            return next
          })
        }, RIPPLE_MS)
      )
    }
    void onToggle(id)
  }

  const remove = (id: string): void => {
    if (leaving.has(id)) return
    setLeaving((current) => new Set(current).add(id))
    remember(
      window.setTimeout(() => {
        // 先让行高收合、内容横移淡出，再交给主进程删除
        void onRemove(id).finally(() => {
          // 失败兜底：条目还在本地列表里就别让它一直保持收合态
          remember(
            window.setTimeout(() => {
              if (!itemsRef.current.some((item) => item.id === id)) return
              setLeaving((current) => {
                if (!current.has(id)) return current
                const next = new Set(current)
                next.delete(id)
                return next
              })
            }, 420)
          )
        })
      }, LEAVE_MS)
    )
  }

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const text = draft.trim()
    if (!text) return
    setDraft('')
    addRef.current?.focus({ preventScroll: true })
    void onAdd(text)
  }

  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <span className="cap">{t(language, 'todo.today')}</span>
        <span className="cap">
          {items.filter((item) => !item.done).length} {t(language, 'todo.open')}
        </span>
      </div>

      <div className="tasks" aria-live="polite">
        {items.map((item) => (
          <div
            key={item.id}
            className={`task-row${leaving.has(item.id) ? ' is-leaving' : ''}`}
            data-task-id={item.id}
            data-done={item.done}
          >
            <div className="task-row__inner">
              <div
                className={`task${item.done ? ' task--done' : ''}${
                  justChecked.has(item.id) ? ' task--just-checked' : ''
                }`}
              >
                <button
                  type="button"
                  className="task__toggle"
                  aria-pressed={item.done}
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
                  <span className="task__text">{item.text}</span>
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
        ))}
        {!items.length ? <div className="sub task__empty">{t(language, 'todo.empty')}</div> : null}
      </div>

      <form className={`addrow${draft ? ' has-text' : ''}`} onSubmit={submit}>
        <span className="plus" aria-hidden="true" />
        <input
          ref={addRef}
          className="addrow__input"
          value={draft}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation()
              setDraft('')
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
    </>
  )
}
