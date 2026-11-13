import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { TodoItem } from '../../../../shared/data'
import { t, type Language } from '../../../../shared/i18n'

interface Props {
  items: TodoItem[]
  language: Language
  onAdd: (text: string) => Promise<void>
  onToggle: (id: string) => Promise<void>
  onRemove: (id: string) => Promise<void>
}

const LEAVE_MS = 230

/**
 * 待办卡片。
 *
 * 「丝滑」不是加一堆动画，而是三件事：
 *  1. 勾掉的任务平滑地落到已完成区（FLIP：先记录旧位置，再反向补间）；
 *  2. 删除先收合高度、再真正从 todo.json 移除，不会「啪」一下消失；
 *  3. 勾选框、删除线、添加行都有连续的状态过渡。
 *
 * 排序只发生在渲染层：未完成在上、已完成在下，各自保持插入顺序；
 * todo.json 仍然只存顺序，不把「展示顺序」写进数据。
 */
export function TodoWidget({ items: itemsProp, language, onAdd, onToggle, onRemove }: Props): React.JSX.Element {
  const [items, setItems] = useState<TodoItem[]>(itemsProp)
  const [draft, setDraft] = useState('')
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(() => new Set())
  const listRef = useRef<HTMLDivElement>(null)
  const rectsRef = useRef<Map<string, number>>(new Map())
  const leaveTimers = useRef<number[]>([])
  const addRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setItems(itemsProp)
  }, [itemsProp])

  useEffect(
    () => () => {
      leaveTimers.current.forEach((id) => window.clearTimeout(id))
    },
    []
  )

  const ordered = useMemo(() => {
    const open: TodoItem[] = []
    const done: TodoItem[] = []
    for (const item of items) {
      if (item.done) done.push(item)
      else open.push(item)
    }
    return [...open, ...done]
  }, [items])

  // FLIP：React 提交之后，把位置没变的任务按旧位置补间回新位置。
  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const next = new Map<string, number>()
    list.querySelectorAll<HTMLElement>('[data-task-id]').forEach((node) => {
      const id = node.dataset.taskId
      if (!id) return
      const top = node.getBoundingClientRect().top
      next.set(id, top)
      const previous = rectsRef.current.get(id)
      if (!reduce && previous !== undefined && Math.abs(previous - top) > 0.5) {
        node.animate(
          [
            { transform: `translate3d(0, ${previous - top}px, 0)` },
            { transform: 'translate3d(0, 0, 0)' }
          ],
          { duration: 320, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
        )
      }
    })
    rectsRef.current = next
  }, [ordered])

  const toggle = (id: string): void => {
    if (leaving.has(id)) return
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, done: !item.done } : item))
    )
    void onToggle(id)
  }

  const remove = (id: string): void => {
    if (leaving.has(id)) return
    setLeaving((current) => new Set(current).add(id))
    const timer = window.setTimeout(() => {
      // 先让行高收合，再交给主进程删除；失败也不会留下半行
      void onRemove(id).finally(() => {
        setLeaving((current) => {
          const next = new Set(current)
          next.delete(id)
          return next
        })
      })
    }, LEAVE_MS)
    leaveTimers.current.push(timer)
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
      <div className="tasks" ref={listRef} aria-live="polite">
        {ordered.map((item, index) => (
          <div
            key={item.id}
            className={`task-row${leaving.has(item.id) ? ' is-leaving' : ''}`}
            data-task-id={item.id}
            data-done={item.done}
            style={{ '--i': index } as React.CSSProperties}
          >
            <div className="task-row__inner">
              <div className={`task${item.done ? ' task--done' : ''}`}>
                <button
                  type="button"
                  className="task__toggle"
                  aria-pressed={item.done}
                  onClick={() => toggle(item.id)}
                >
                  <span className="dot" aria-hidden="true">
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
        {!ordered.length ? <div className="sub task__empty">{t(language, 'todo.empty')}</div> : null}
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
