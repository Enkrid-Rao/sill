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
import { dirname, join, resolve } from 'node:path'
import type { DevWidgetPayload, WidgetDataBinding } from '../../shared/dev-widget'
import type { InstallOutcome, InstalledWidgetInfo } from '../../shared/widgets'

const MAX_ARCHIVE = 50 * 1024 * 1024
const MAX_FILES = 500
const MAX_FILE = 20 * 1024 * 1024
const BASE_FILES = ['widget.json', 'ui/index.html', 'ui/style.css'] as const
const WEB_FILES = [...BASE_FILES, 'ui/main.js'] as const
// template 也可以带 ui/main.js：它跑在宿主页面里，不是 webview。没有 main.js 就是纯静态卡。
const TEMPLATE_FILES = [...BASE_FILES, 'ui/main.js'] as const
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/
const ID = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/
const PERMISSIONS = new Set([
  'data.time',
  'data.system',
  'data.media',
  'data.weather',
  'data.todo',
  'action.media',
  'action.todo'
])

interface Manifest {
  id: string
  name: string
  version: string
  author: string
  span: number
  height: number
  permissions: string[]
  kind: 'template' | 'web'
  trust: 'sandboxed' | 'trusted'
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
    span: manifest.span,
    kind: manifest.kind,
    trust: manifest.trust
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
  const kind = raw.type === 'web' ? 'web' : raw.type === 'template' ? 'template' : ''
  const trust = kind === 'web' && raw.trust === 'trusted' ? 'trusted' : 'sandboxed'
  const ui = raw.ui === 'ui/index.html' ? 'ui/index.html' : ''
  const spanRaw =
    raw.span && typeof raw.span === 'object'
      ? Number((raw.span as Record<string, unknown>).default)
      : NaN
  const span = Number.isFinite(spanRaw) ? Math.max(1, Math.min(3, Math.round(spanRaw))) : NaN
  const heightRaw =
    raw.size && typeof raw.size === 'object'
      ? Number((raw.size as Record<string, unknown>).h)
      : NaN
  const height = Number.isFinite(heightRaw)
    ? Math.max(48, Math.min(1200, Math.round(heightRaw)))
    : 160

  if (!ID.test(id)) return null
  if (!name || name.length > 24) return null
  if (!SEMVER.test(version)) return null
  if (!author || author.length > 80) return null
  if (!license || license.length > 40) return null
  if (!runtime || !engine) return null
  if (!kind || !ui) return null
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
    height,
    permissions,
    kind,
    trust,
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

function allowedFiles(kind: 'template' | 'web'): readonly string[] {
  return kind === 'web' ? WEB_FILES : TEMPLATE_FILES
}

function isAssetFile(name: string): boolean {
  return name.startsWith('ui/assets/') && safeEntry(name)
}

function readPackage(file: string): { data: PackageData } | { error: string } {
  if (!existsSync(file)) return { error: '文件不存在' }
  const fileStat = statSync(file)
  if (!fileStat.isFile()) return { error: '不是文件' }
  if (fileStat.size > MAX_ARCHIVE) return { error: '组件包超过 50 MB' }

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
    if (!safeEntry(name)) return { error: `组件包包含非法路径：${name}` }
    total += entry.header.size
    if (total > MAX_ARCHIVE) return { error: '组件解压后超过 50 MB' }
    if (entry.header.size > MAX_FILE) return { error: `${name} 超过 20 MB` }
    let data: Buffer
    try {
      data = entry.getData()
    } catch {
      return { error: `无法读取 ${name}` }
    }
    if (data.length > MAX_FILE) return { error: `${name} 超过 20 MB` }
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
  const allowed = allowedFiles(manifest.kind)
  for (const name of files.keys()) {
    if (!allowed.includes(name) && !isAssetFile(name)) {
      return { error: `组件包包含不允许的文件：${name}` }
    }
  }
  if (!files.has(manifest.kind === 'web' ? 'ui/main.js' : 'ui/style.css')) {
    return { error: manifest.kind === 'web' ? '缺少 ui/main.js' : '缺少 ui/style.css' }
  }

  // 模板内容不做标签/属性审查：宿主用 innerHTML 挂载，浏览器不会执行其中的脚本；
  // SVG、内联 style、img 这些都是正常写法，交给作者。
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

/** 从一个组件目录读出渲染载荷；安装目录和 skins 目录共用。 */
export function payloadFromDir(dir: string): DevWidgetPayload | null {
  const manifest = readManifest(dir)
  if (!manifest) return null
  const jsPath = join(dir, 'ui/main.js')
  try {
    return {
      id: manifest.id,
      name: manifest.name,
      span: manifest.span,
      kind: manifest.kind,
      trust: manifest.trust,
      height: manifest.height,
      dir,
      html: readFileSync(join(dir, 'ui/index.html'), 'utf8'),
      css: readFileSync(join(dir, 'ui/style.css'), 'utf8'),
      js: existsSync(jsPath) ? readFileSync(jsPath, 'utf8') : undefined,
      data: manifest.data,
      permissions: manifest.permissions,
      strings: manifest.strings
    }
  } catch {
    return null
  }
}

export function loadInstalled(root: string, id: string): DevWidgetPayload | null {
  const dir = packageDirs(root, id)[0]
  if (!dir) return null
  const payload = payloadFromDir(dir)
  return payload && payload.id === id ? payload : null
}

/** skins 目录：一个子目录就是一个组件，不需要打包、不需要安装。 */
export function listSkins(root: string): InstalledWidgetInfo[] {
  if (!existsSync(root)) return []
  return readdirSync(root)
    .filter((name) => !name.startsWith('.'))
    .map((name) => join(root, name))
    .filter((dir) => {
      try {
        return statSync(dir).isDirectory()
      } catch {
        return false
      }
    })
    .map(infoFromDir)
    .filter((item): item is InstalledWidgetInfo => item !== null)
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function loadSkin(root: string, id: string): DevWidgetPayload | null {
  if (!existsSync(root)) return null
  for (const name of readdirSync(root)) {
    if (name.startsWith('.')) continue
    const dir = join(root, name)
    try {
      if (!statSync(dir).isDirectory()) continue
    } catch {
      continue
    }
    const payload = payloadFromDir(dir)
    if (payload?.id === id) return payload
  }
  return null
}

/** 按 id 找到组件目录：先看安装目录，再看 skins。 */
export function findComponentDir(componentsRoot: string, skinsRoot: string, id: string): string | null {
  const installed = packageDirs(componentsRoot, id)[0]
  if (installed) {
    const manifest = readManifest(installed)
    if (manifest?.id === id) return installed
  }
  if (!existsSync(skinsRoot)) return null
  for (const name of readdirSync(skinsRoot)) {
    if (name.startsWith('.')) continue
    const dir = join(skinsRoot, name)
    try {
      if (!statSync(dir).isDirectory()) continue
    } catch {
      continue
    }
    if (readManifest(dir)?.id === id) return dir
  }
  return null
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
    for (const [name, data] of files) {
      const targetFile = join(temp, name)
      mkdirSync(dirname(targetFile), { recursive: true })
      writeFileSync(targetFile, data)
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
