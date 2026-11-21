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

/** 本次进程内已经重取过图标的快捷方式（老数据里存的是通用白纸图标） */
const refreshed = new Set<string>()

export async function listShelf(): Promise<ShelfShortcut[]> {
  const items = load()
  let changed = false
  for (const item of items) {
    // 快捷方式的图标以前一律是通用白纸：每次启动重取一次，把旧数据自动修好
    if (isShortcut(item.path) && !refreshed.has(item.id)) {
      refreshed.add(item.id)
      if (!existsSync(item.path)) continue
      const icon = await readIcon(item.path)
      if (icon && icon !== item.icon) {
        item.icon = icon
        changed = true
      }
      continue
    }
    if (item.icon || !existsSync(item.path)) continue
    const icon = await readIcon(item.path)
    if (icon) {
      item.icon = icon
      changed = true
    }
  }
  if (changed) persist(items)
  return items
}

async function readIcon(path: string): Promise<string | null> {
  const source = iconSource(path)
  try {
    const image = await app.getFileIcon(source, { size: 'normal' })
    if (!image.isEmpty()) return image.toDataURL()
    if (source === path) return null
    // 解析出来的目标取不到图标（被删了 / 是壳程序），退回快捷方式本身
    const fallback = await app.getFileIcon(path, { size: 'normal' })
    return fallback.isEmpty() ? null : fallback.toDataURL()
  } catch {
    return null
  }
}

function isShortcut(path: string): boolean {
  const ext = extname(path).toLowerCase()
  return ext === '.lnk' || ext === '.url'
}

function expandEnv(value: string): string {
  return value.replace(/%([^%]+)%/g, (whole, name: string) => process.env[name] ?? whole)
}

/**
 * `app.getFileIcon()` **不解析快捷方式** —— 对任何 `.lnk` 都返回同一张通用白纸图标
 * （实测五个不同快捷方式的 PNG 哈希完全一致）。所以要先自己读出真正的目标再取图标。
 *
 * 优先级：专用的 `.ico` → 目标 exe（自己的第一个图标通常就是应用图标）→ 其它图标资源。
 * `.url`（Internet 快捷方式）走 `IconFile=` 那一行。
 */
function iconSource(path: string): string {
  const ext = extname(path).toLowerCase()
  if (ext === '.lnk') {
    try {
      const info = shell.readShortcutLink(path)
      const ico = info.icon ? expandEnv(info.icon) : ''
      if (ico && extname(ico).toLowerCase() === '.ico' && existsSync(ico)) return ico
      const target = info.target ? expandEnv(info.target) : ''
      if (target && !isShortcut(target) && existsSync(target)) return target
      if (ico && existsSync(ico)) return ico
    } catch {
      // 坏快捷方式 / 指向不存在的目标：保持原路径
    }
    return path
  }
  if (ext === '.url') {
    try {
      const text = readFileSync(path, 'utf8')
      const match = /^\s*IconFile\s*=\s*(.+)$/im.exec(text)
      if (match) {
        const candidate = expandEnv(match[1].trim().replace(/^"|"$/g, ''))
        if (candidate && existsSync(candidate)) return candidate
      }
    } catch {
      // 读不了就原样
    }
  }
  return path
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
    const icon = await readIcon(path)
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
