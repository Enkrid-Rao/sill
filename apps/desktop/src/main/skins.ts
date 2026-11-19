import { mkdirSync, watch, type FSWatcher } from 'node:fs'
import { join } from 'node:path'
import { USER_DATA_DIR } from './paths'

/**
 * Rainmeter 式的 Skins 目录：一个子文件夹就是一个组件，丢进去就能用，改完自动刷新。
 * 不需要 zip、不需要安装、不需要重启。
 */
export const SKINS_DIR = join(USER_DATA_DIR, 'skins')

let watcher: FSWatcher | null = null
let timer: NodeJS.Timeout | null = null

export function ensureSkinsDir(): void {
  try {
    mkdirSync(SKINS_DIR, { recursive: true })
  } catch (error) {
    console.error('[sill] 无法创建 skins 目录：', error)
  }
}

/** 文件变动 → 防抖 → 交给宿主刷新组件列表与布局。 */
export function startSkinsWatcher(onChange: () => void): void {
  ensureSkinsDir()
  if (watcher) return
  try {
    watcher = watch(SKINS_DIR, { recursive: true }, () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(onChange, 120)
    })
  } catch (error) {
    console.error('[sill] skins watcher:', error)
  }
}

export function stopSkinsWatcher(): void {
  watcher?.close()
  watcher = null
  if (timer) clearTimeout(timer)
  timer = null
}
