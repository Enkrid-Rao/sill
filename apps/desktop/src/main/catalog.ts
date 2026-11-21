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
import { loadSettings } from './settings'

/**
 * 组件目录：一个远端 JSON（registry/catalog.json），只读。
 * 地址可用 SILL_CATALOG_URL 覆盖（本地联调/镜像）。
 */
const DEFAULT_URL =
  'https://raw.githubusercontent.com/Enkrid-Rao/sill-components/main/registry/catalog.json'
const TIMEOUT_MS = 12_000
const MAX_BYTES = 2 * 1024 * 1024
const CACHE_MS = 5 * 60 * 1000

let cache: { at: number; key: string; result: CatalogResult } | null = null

export function catalogUrl(): string {
  return process.env.SILL_CATALOG_URL?.trim() || DEFAULT_URL
}

function catalogUrls(): string[] {
  return [catalogUrl(), ...loadSettings().catalogSources]
}

async function fetchOne(url: string): Promise<{ entries: ReturnType<typeof normalizeCatalog>; updated?: string; error?: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await net.fetch(url, { signal: controller.signal, redirect: 'follow' })
    if (!response.ok) return { entries: [], error: `HTTP ${response.status}` }
    const text = await response.text()
    if (text.length > MAX_BYTES) return { entries: [], error: '目录文件过大' }
    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch {
      return { entries: [], error: '目录不是合法 JSON' }
    }
    const entries = normalizeCatalog(raw)
    const updated =
      raw && typeof raw === 'object' && typeof (raw as Record<string, unknown>).updated === 'string'
        ? String((raw as Record<string, unknown>).updated)
        : undefined
    return { entries, ...(updated ? { updated } : {}) }
  } catch (error) {
    const message =
      error instanceof Error && error.name === 'AbortError' ? '请求超时' : String(error)
    return { entries: [], error: message }
  } finally {
    clearTimeout(timer)
  }
}

export function invalidateCatalogCache(): void {
  cache = null
}

export async function fetchCatalog(force = false): Promise<CatalogResult> {
  if (!loadSettings().networkConsent) {
    return { ok: false, error: '联网功能已关闭', entries: [] }
  }
  const urls = catalogUrls()
  const key = urls.join('\n')
  if (!force && cache && cache.key === key && Date.now() - cache.at < CACHE_MS) {
    return cache.result
  }

  const results = await Promise.all(urls.map((url) => fetchOne(url)))
  const entries = []
  const seen = new Set<string>()
  const warnings: string[] = []
  for (let index = 0; index < results.length; index += 1) {
    const result = results[index]
    if (result.error) warnings.push(`${urls[index]}: ${result.error}`)
    for (const entry of result.entries) {
      const id = `${entry.id}@${entry.version}`
      if (seen.has(id)) continue
      seen.add(id)
      entries.push(entry)
    }
  }
  if (!entries.length) {
    const result: CatalogResult = {
      ok: false,
      error: warnings[0] ?? '无法读取组件目录',
      entries: [],
      ...(warnings.length > 1 ? { warnings } : {})
    }
    return result
  }
  const result: CatalogResult = {
    ok: true,
    entries,
    ...(results[0]?.updated ? { updated: results[0].updated } : {}),
    ...(warnings.length ? { warnings } : {})
  }
  cache = { at: Date.now(), key, result }
  return result
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

