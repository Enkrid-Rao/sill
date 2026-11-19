import { net } from 'electron'
import {
  findUpdates,
  normalizeCatalog,
  type CatalogResult,
  type CatalogUpdatesState
} from '../shared/catalog'
import { broadcast } from './broadcast'
import { COMPONENTS_DIR } from './layout'
import { listInstalled } from './widgets/package'

/**
 * 组件目录：一个远端 JSON（registry/catalog.json），只读。
 * 地址可用 SILL_CATALOG_URL 覆盖（本地联调/镜像）。
 */
const DEFAULT_URL =
  'https://raw.githubusercontent.com/Enkrid-Rao/sill-components/main/registry/catalog.json'
const TIMEOUT_MS = 12_000
const MAX_BYTES = 2 * 1024 * 1024
const CACHE_MS = 5 * 60 * 1000

let cache: { at: number; result: CatalogResult } | null = null

export function catalogUrl(): string {
  return process.env.SILL_CATALOG_URL?.trim() || DEFAULT_URL
}

export async function fetchCatalog(force = false): Promise<CatalogResult> {  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.result

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await net.fetch(catalogUrl(), {
      signal: controller.signal,
      redirect: 'follow'
    })
    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}`, entries: [] }
    }
    const text = await response.text()
    if (text.length > MAX_BYTES) {
      return { ok: false, error: '目录文件过大', entries: [] }
    }
    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch {
      return { ok: false, error: '目录不是合法 JSON', entries: [] }
    }
    const entries = normalizeCatalog(raw)
    const updated =
      raw && typeof raw === 'object' && typeof (raw as Record<string, unknown>).updated === 'string'
        ? String((raw as Record<string, unknown>).updated)
        : undefined
    const result: CatalogResult = { ok: true, entries, ...(updated ? { updated } : {}) }
    cache = { at: Date.now(), result }
    return result
  } catch (error) {
    const message =
      error instanceof Error && error.name === 'AbortError' ? '请求超时' : String(error)
    return { ok: false, error: `无法读取组件目录：${message}`, entries: [] }
  } finally {
    clearTimeout(timer)
  }
}

let updatesState: CatalogUpdatesState = {
  ok: false,
  checkedAt: 0,
  count: 0,
  updates: []
}

export function getComponentUpdates(): CatalogUpdatesState {
  return updatesState
}

/**
 * 后台检查：拉目录 → 和已安装组件比版本 → 广播给界面。
 * 只发现，不自动安装；用户在组件页点「更新」才下载。
 */
export async function checkComponentUpdates(force = false): Promise<CatalogUpdatesState> {
  const result = await fetchCatalog(force)
  if (!result.ok) {
    updatesState = {
      ok: false,
      checkedAt: Date.now(),
      count: 0,
      updates: [],
      ...(result.error ? { error: result.error } : {})
    }
    broadcast('widgets:updates', updatesState)
    return updatesState
  }

  const installed = listInstalled(COMPONENTS_DIR).map((item) => ({
    id: item.id,
    version: item.version
  }))
  const updates = findUpdates(installed, result.entries)
  updatesState = { ok: true, checkedAt: Date.now(), count: updates.length, updates }
  broadcast('widgets:updates', updatesState)
  return updatesState
}

