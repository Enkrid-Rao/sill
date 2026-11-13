import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { TodoItem } from '../../shared/data'
import { t } from '../../shared/i18n'
import { USER_DATA_DIR } from '../paths'
import { loadSettings } from '../settings'

const TODO_FILE = join(USER_DATA_DIR, 'todo.json')

let cache: TodoItem[] | null = null

/** 第一次运行时给三条示例待办，之后完全以 todo.json 为准 */
function seed(): TodoItem[] {
  const language = loadSettings().language
  return [t(language, 'todo.one'), t(language, 'todo.two'), t(language, 'todo.three')].map(
    (text) => ({ id: randomUUID(), text, done: false })
  )
}

function persist(items: TodoItem[]): void {
  try {
    mkdirSync(dirname(TODO_FILE), { recursive: true })
    const tmp = `${TODO_FILE}.tmp`
    writeFileSync(tmp, `${JSON.stringify(items, null, 2)}\n`, 'utf8')
    renameSync(tmp, TODO_FILE)
  } catch (error) {
    console.error('[sill] 无法写入待办：', error)
  }
}

function load(): TodoItem[] {
  if (cache) return cache
  try {
    const raw = JSON.parse(readFileSync(TODO_FILE, 'utf8')) as unknown
    if (!Array.isArray(raw)) throw new Error('todo.json 不是数组')
    cache = raw
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map((item) => ({
        id: String(item.id ?? randomUUID()),
        text: String(item.text ?? '').trim(),
        done: item.done === true
      }))
      .filter((item) => item.text)
  } catch {
    cache = seed()
    persist(cache)
  }
  return cache
}

export function listTodos(): TodoItem[] {
  return load()
}

export function addTodo(text: string): TodoItem[] {
  const trimmed = text.trim()
  if (!trimmed) return load()
  cache = [...load(), { id: randomUUID(), text: trimmed.slice(0, 200), done: false }]
  persist(cache)
  return cache
}

export function toggleTodo(id: string): TodoItem[] {
  cache = load().map((item) => (item.id === id ? { ...item, done: !item.done } : item))
  persist(cache)
  return cache
}

export function removeTodo(id: string): TodoItem[] {
  cache = load().filter((item) => item.id !== id)
  persist(cache)
  return cache
}
