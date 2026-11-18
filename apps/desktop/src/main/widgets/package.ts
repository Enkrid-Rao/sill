import AdmZip from 'adm-zip'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { join, resolve } from 'node:path'
import type { DevWidgetPayload, WidgetDataBinding } from '../../shared/dev-widget'
import type { InstallOutcome, InstalledWidgetInfo } from '../../shared/widgets'

const MAX_ARCHIVE = 10 * 1024 * 1024
const MAX_FILES = 200
const MAX_FILE = 512 * 1024
const FILES = ['widget.json', 'ui/index.html', 'ui/style.css'] as const
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/
const ID = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/
const PERMISSIONS = new Set([
  'data.time',
  'data.system',
  'data.media',
  'data.weather',
  'data.todo'
])

interface Manifest {
  id: string
  name: string
  version: string
  author: string
  span: number
  permissions: string[]
  type: 'template'
  ui: 'ui/index.html'
  data: WidgetDataBinding[]
  strings: Record<string, Record<string, string>>
}

interface PackageData {
  manifest: Manifest
  files: Map<string, Buffer>
}

function fail(error: string): InstallOutcome {
  return { ok: false, error }
}

function info(manifest: Manifest): InstalledWidgetInfo {
  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    author: manifest.author,
    permissions: manifest.permissions,
    span: manifest.span
  }
}

function safeEntry(name: string): boolean {
  if (!name || name.startsWith('/') || name.includes('\\') || name.includes(':')) return false
  return name.split('/').every((part) => part !== '' && part !== '.' && part !== '..')
}

function within(root: string, target: string): boolean {
  const base = resolve(root)
  const full = resolve(target)
  return full === base || full.startsWith(`${base}\\`) || full.startsWith(`${base}/`)
}

function parseManifest(raw: Record<string, unknown>): Manifest | null {
  if (raw.schema !== 1) return null
  const id = typeof raw.id === 'string' ? raw.id : ''
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  const version = typeof raw.version === 'string' ? raw.version : ''
  const author = typeof raw.author === 'string' ? raw.author.trim() : ''
  const license = typeof raw.license === 'string' ? raw.license.trim() : ''
  const runtime = typeof raw.runtime === 'string' ? raw.runtime.trim() : ''
  const engine = typeof raw.engine === 'string' ? raw.engine.trim() : ''
  const type = raw.type === 'template' ? 'template' : ''
  const ui = raw.ui === 'ui/index.html' ? 'ui/index.html' : ''
  const spanRaw =
    raw.span && typeof raw.span === 'object'
      ? Number((raw.span as Record<string, unknown>).default)
      : NaN
  const span = Number.isFinite(spanRaw) ? Math.max(1, Math.min(3, Math.round(spanRaw))) : NaN

  if (!ID.test(id)) return null
  if (!name || name.length > 24) return null
  if (!SEMVER.test(version)) return null
  if (!author || author.length > 80) return null
  if (!license || license.length > 40) return null
  if (!runtime || !engine) return null
  if (!type || !ui) return null
  if (!Number.isFinite(span)) return null

  const permissionsRaw = Array.isArray(raw.permissions) ? raw.permissions : []
  const permissions = permissionsRaw.filter(
    (item): item is string => typeof item === 'string' && PERMISSIONS.has(item)
  )
  if (permissions.length !== permissionsRaw.length) return null

  return {
    id,
    name,
    version,
    author,
    span,
    permissions,
    type,
    ui,
    data: parseBindings(raw.data),
    strings: parseStrings(raw.strings)
  }
}

function parseBindings(value: unknown): WidgetDataBinding[] {
  if (!Array.isArray(value)) return []
  const out: WidgetDataBinding[] = []
  for (const item of value.slice(0, 16)) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    if (
      typeof record.id === 'string' &&
      /^[A-Za-z_][A-Za-z0-9_]{0,31}$/.test(record.id) &&
      typeof record.source === 'string'
    ) {
      out.push({ id: record.id, source: record.source })
    }
  }
  return out
}

function parseStrings(value: unknown): Record<string, Record<string, string>> {
  if (!value || typeof value !== 'object') return {}
  const out: Record<string, Record<string, string>> = {}
  for (const [language, table] of Object.entries(value as Record<string, unknown>)) {
    if (!table || typeof table !== 'object') continue
    const entries: Record<string, string> = {}
    for (const [key, text] of Object.entries(table as Record<string, unknown>)) {
      if (typeof text === 'string' && text.length <= 160) entries[key] = text
    }
    out[language] = entries
  }
  return out
}

function readManifest(dir: string): Manifest | null {
  try {
    const raw = JSON.parse(readFileSync(join(dir, 'widget.json'), 'utf8')) as Record<string, unknown>
    return parseManifest(raw)
  } catch {
    return null
  }
}

function infoFromDir(dir: string): InstalledWidgetInfo | null {
  const manifest = readManifest(dir)
  return manifest ? info(manifest) : null
}

function packageDirs(root: string, id?: string): string[] {
  if (!existsSync(root)) return []
  return readdirSync(root)
    .filter((name) => !name.startsWith('.'))
    .map((name) => join(root, name))
    .filter((dir) => {
      if (!statSync(dir).isDirectory()) return false
      if (id && !dir.split(/[\\/]/).pop()?.startsWith(`${id}@`)) return false
      return true
    })
}

function readPackage(file: string): { data: PackageData } | { error: string } {
  if (!existsSync(file)) return { error: '文件不存在' }
  const fileStat = statSync(file)
  if (!fileStat.isFile()) return { error: '不是文件' }
  if (fileStat.size > MAX_ARCHIVE) return { error: '组件包超过 10 MB' }

  let zip: AdmZip
  try {
    zip = new AdmZip(file)
  } catch {
    return { error: '无法读取 .sill 压缩包' }
  }

  const entries = zip.getEntries().filter((entry) => !entry.isDirectory)
  if (entries.length > MAX_FILES) return { error: '组件包文件过多' }
  if (entries.length === 0) return { error: '组件包是空的' }

  let total = 0
  let manifest: Manifest | null = null
  const files = new Map<string, Buffer>()

  for (const entry of entries) {
    const name = entry.entryName
    if (!safeEntry(name) || !FILES.includes(name as (typeof FILES)[number])) {
      return { error: `组件包包含不允许的文件：${name}` }
    }
    total += entry.header.size
    if (total > MAX_ARCHIVE) return { error: '组件解压后超过 10 MB' }
    if (entry.header.size > MAX_FILE) return { error: `${name} 超过 512 KB` }
    let data: Buffer
    try {
      data = entry.getData()
    } catch {
      return { error: `无法读取 ${name}` }
    }
    if (data.length > MAX_FILE) return { error: `${name} 超过 512 KB` }
    files.set(name, data)
    if (name === 'widget.json') {
      try {
        manifest = parseManifest(JSON.parse(data.toString('utf8')) as Record<string, unknown>)
      } catch {
        return { error: 'widget.json 不是合法 JSON' }
      }
    }
  }

  if (!manifest) return { error: 'widget.json 字段不合法' }
  if (!files.has(manifest.ui)) return { error: `缺少 ${manifest.ui}` }
  if (!files.has('ui/style.css')) return { error: '缺少 ui/style.css' }

  const html = files.get(manifest.ui)?.toString('utf8') ?? ''
  const css = files.get('ui/style.css')?.toString('utf8') ?? ''
  if (/<script\b/i.test(html) || /\son\w+\s*=/i.test(html) || /\sstyle\s*=/i.test(html)) {
    return { error: '模板不能包含 script、on* 或 style 属性' }
  }
  if (/\b(href|src)\s*=/i.test(html)) return { error: '模板不能包含 href / src' }
  if (/@import|url\s*\(|expression\s*\(/i.test(css)) {
    return { error: 'CSS 不能包含 @import、url() 或 expression()' }
  }

  return { data: { manifest, files } }
}

export function inspectPackage(file: string): InstallOutcome {
  const result = readPackage(file)
  if ('error' in result) return fail(result.error)
  return { ok: true, widget: info(result.data.manifest) }
}

export function listInstalled(root: string): InstalledWidgetInfo[] {
  return packageDirs(root)
    .map(infoFromDir)
    .filter((item): item is InstalledWidgetInfo => item !== null)
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function loadInstalled(root: string, id: string): DevWidgetPayload | null {
  const dir = packageDirs(root, id)[0]
  if (!dir) return null
  const manifest = readManifest(dir)
  if (!manifest || manifest.id !== id) return null
  try {
    return {
      id: manifest.id,
      name: manifest.name,
      span: manifest.span,
      html: readFileSync(join(dir, manifest.ui), 'utf8'),
      css: readFileSync(join(dir, 'ui/style.css'), 'utf8'),
      data: manifest.data,
      strings: manifest.strings
    }
  } catch {
    return null
  }
}

export function installPackage(file: string, root: string): InstallOutcome {
  const result = readPackage(file)
  if ('error' in result) return fail(result.error)
  const { manifest, files } = result.data

  const target = join(root, `${manifest.id}@${manifest.version}`)
  if (!within(root, target)) return fail('安装路径非法')
  if (packageDirs(root, manifest.id).length > 0) return fail('这个组件已经安装')

  const temp = join(root, `.tmp-${process.pid}-${Date.now()}`)
  try {
    mkdirSync(join(temp, 'ui'), { recursive: true })
    for (const name of FILES) {
      const data = files.get(name)
      if (data) writeFileSync(join(temp, name), data)
    }
    renameSync(temp, target)
  } catch (error) {
    try {
      rmSync(temp, { recursive: true, force: true })
    } catch {
      // ignore cleanup failure
    }
    return fail(error instanceof Error ? error.message : '安装失败')
  }

  return { ok: true, widget: info(manifest) }
}

export function uninstallPackage(root: string, id: string): InstallOutcome {
  const dirs = packageDirs(root, id)
  if (dirs.length === 0) return fail('组件没有安装')
  for (const dir of dirs) {
    if (!within(root, dir)) return fail('安装路径非法')
    rmSync(dir, { recursive: true, force: true })
  }
  return { ok: true }
}
