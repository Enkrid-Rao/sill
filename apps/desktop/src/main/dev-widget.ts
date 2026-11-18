import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import type { DevWidgetPayload, WidgetDataBinding } from '../shared/dev-widget'

/**
 * Dev-only loader. SILL_DEV_WIDGET points at a folder like:
 *
 *   widget.json
 *   ui/index.html
 *   ui/style.css
 *
 * The folder is read once when the renderer asks for it. The HTML/CSS is
 * mounted into a shadow root inside the normal .card; there is no iframe and
 * no simulated glass. No zip, no install directory, no permissions yet.
 */

const MAX_FILE = 512 * 1024
const MAX_TOTAL = 2 * 1024 * 1024

function fail(message: string): null {
  console.error(`[sill] dev widget: ${message}`)
  return null
}

function readText(path: string, total: { bytes: number }): string | null {
  if (!existsSync(path)) return null
  const size = statSync(path).size
  if (size > MAX_FILE) return fail(`${path} 超过 512 KB`)
  total.bytes += size
  if (total.bytes > MAX_TOTAL) return fail('组件总大小超过 2 MB')
  return readFileSync(path, 'utf8')
}

function inside(root: string, target: string): boolean {
  const rel = relative(root, target)
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

export function getDevWidget(): DevWidgetPayload | null {
  const raw = process.env.SILL_DEV_WIDGET?.trim()
  if (!raw) return null

  const root = resolve(raw)
  if (!existsSync(root)) return fail(`目录不存在：${root}`)

  const manifestPath = join(root, 'widget.json')
  if (!existsSync(manifestPath)) return fail(`缺少 widget.json：${manifestPath}`)

  let manifest: Record<string, unknown>
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>
  } catch (error) {
    return fail(`widget.json 解析失败：${String(error)}`)
  }

  const id = typeof manifest.id === 'string' ? manifest.id : ''
  const name = typeof manifest.name === 'string' ? manifest.name : ''
  const type = typeof manifest.type === 'string' ? manifest.type : ''
  const ui = typeof manifest.ui === 'string' ? manifest.ui : 'ui/index.html'
  const spanRaw =
    manifest.span && typeof manifest.span === 'object'
      ? Number((manifest.span as Record<string, unknown>).default)
      : NaN
  const span = Number.isFinite(spanRaw) ? Math.max(1, Math.min(3, Math.round(spanRaw))) : 1
  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(id)) return fail(`id 不合法：${id || '(空)'}`)
  if (!name) return fail('name 为空')
  if (type !== 'template') return fail(`type 只支持 template，收到 ${type || '(空)'}`)
  if (!ui.endsWith('.html')) return fail(`ui 必须指向 .html：${ui}`)

  const htmlPath = resolve(root, ui)
  if (!inside(root, htmlPath)) return fail(`ui 路径逃出组件目录：${ui}`)
  const uiDir = dirname(htmlPath)
  const total = { bytes: 0 }

  const html = readText(htmlPath, total)
  if (html === null) return fail(`缺少入口：${htmlPath}`)

  const css = readText(join(uiDir, 'style.css'), total) ?? ''

  return { id, name, span, html, css, data: readBindings(manifest.data), strings: readStrings(manifest.strings) }
}

function readBindings(value: unknown): WidgetDataBinding[] {
  if (!Array.isArray(value)) return []
  const out: WidgetDataBinding[] = []
  for (const item of value.slice(0, 16)) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    if (typeof record.id === 'string' && typeof record.source === 'string') {
      out.push({ id: record.id, source: record.source })
    }
  }
  return out
}

function readStrings(value: unknown): Record<string, Record<string, string>> {
  if (!value || typeof value !== 'object') return {}
  const out: Record<string, Record<string, string>> = {}
  for (const [language, table] of Object.entries(value as Record<string, unknown>)) {
    if (!table || typeof table !== 'object') continue
    const entries: Record<string, string> = {}
    for (const [key, text] of Object.entries(table as Record<string, unknown>)) {
      if (typeof text === 'string') entries[key] = text
    }
    out[language] = entries
  }
  return out
}
