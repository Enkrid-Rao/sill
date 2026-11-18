import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import { app, shell } from 'electron'
import type { ShelfShortcut } from '../../shared/shelf'
import { USER_DATA_DIR } from '../paths'

const SHELF_FILE = join(USER_DATA_DIR, 'shelf.json')
const MAX_ITEMS = 100

let cache: ShelfShortcut[] | null = null

function persist(items: ShelfShortcut[]): void {
  try {
    mkdirSync(dirname(SHELF_FILE), { recursive: true })
    const tmp = `${SHELF_FILE}.tmp`
    writeFileSync(tmp, `${JSON.stringify(items, null, 2)}\n`, 'utf8')
    renameSync(tmp, SHELF_FILE)
  } catch (error) {
    console.error('[sill] 无法写入快捷方式：', error)
  }
}

function load(): ShelfShortcut[] {
  if (cache) return cache
  try {
    const raw = JSON.parse(readFileSync(SHELF_FILE, 'utf8')) as unknown
    if (!Array.isArray(raw)) throw new Error('shelf.json 不是数组')
    cache = raw
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map((item) => ({
        id: typeof item.id === 'string' ? item.id : randomUUID(),
        name: String(item.name ?? '').trim(),
        path: String(item.path ?? ''),
        icon: typeof item.icon === 'string' ? item.icon : null
      }))
      .filter((item) => item.name && item.path)
      .slice(0, MAX_ITEMS)
  } catch {
    cache = []
    persist(cache)
  }
  return cache
}

function displayName(path: string): string {
  const name = basename(path)
  const extension = extname(name).toLowerCase()
  if (extension === '.lnk' || extension === '.exe' || extension === '.url') {
    return name.slice(0, -extension.length)
  }
  return name
}

export function listShelf(): ShelfShortcut[] {
  return load()
}

export async function addShelfPaths(paths: readonly string[]): Promise<ShelfShortcut[]> {
  const current = [...load()]
  for (const path of paths) {
    if (current.length >= MAX_ITEMS) break
    if (!path || !existsSync(path)) continue
    try {
      if (!statSync(path).isFile() && !statSync(path).isDirectory()) continue
    } catch {
      continue
    }
    if (current.some((item) => item.path === path)) continue
    let icon: string | null = null
    try {
      const image = await app.getFileIcon(path, { size: 'normal' })
      icon = image.isEmpty() ? null : image.toDataURL()
    } catch {
      icon = null
    }
    current.push({ id: randomUUID(), name: displayName(path), path, icon })
  }
  cache = current
  persist(cache)
  return cache
}

export function removeShelf(id: string): ShelfShortcut[] {
  cache = load().filter((item) => item.id !== id)
  persist(cache)
  return cache
}

export async function openShelf(id: string): Promise<{ ok: boolean; error?: string }> {
  const item = load().find((entry) => entry.id === id)
  if (!item) return { ok: false, error: '快捷方式不存在' }
  const error = await shell.openPath(item.path)
  return error ? { ok: false, error } : { ok: true }
}
