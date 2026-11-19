export interface CatalogLocalized {
  en?: string
  zh?: string
}

export interface CatalogEntry {
  id: string
  version: string
  name: CatalogLocalized
  summary: CatalogLocalized
  author: string
  type: 'builtin' | 'template' | 'web'
  status: 'builtin' | 'verified' | 'community'
  /** 只有 catalog 明确标了 installable + https download 才是装的入口。 */
  installable: boolean
  download?: string
}

export interface CatalogResult {
  ok: boolean
  error?: string
  updated?: string
  entries: CatalogEntry[]
}

export function pickLocalized(
  value: CatalogLocalized | undefined,
  language: 'en' | 'zh'
): string {
  if (!value) return ''
  return value[language] ?? value.en ?? value.zh ?? ''
}

/** 只接受 https；本机 http 仅用于开发和自建源。 */
export function isAllowedDownloadUrl(raw: string): boolean {
  try {
    const url = new URL(raw)
    if (url.protocol === 'https:') return true
    if (url.protocol !== 'http:') return false
    return url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '[::1]'
  } catch {
    return false
  }
}

function readLocalized(value: unknown): CatalogLocalized | undefined {
  if (typeof value === 'string') {
    const text = value.trim()
    return text ? { en: text.slice(0, 160) } : undefined
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const en = typeof record.en === 'string' ? record.en.trim().slice(0, 160) : ''
  const zh = typeof record.zh === 'string' ? record.zh.trim().slice(0, 80) : ''
  if (!en && !zh) return undefined
  return { ...(en ? { en } : {}), ...(zh ? { zh } : {}) }
}

const ID = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/

/** 外部目录是不可信数据：逐条校验，坏条目直接跳过，不让一条坏数据毁掉整个列表。 */
export function normalizeCatalog(raw: unknown): CatalogEntry[] {
  if (!raw || typeof raw !== 'object') return []
  const widgets = (raw as Record<string, unknown>).widgets
  if (!Array.isArray(widgets)) return []

  const entries: CatalogEntry[] = []
  for (const item of widgets.slice(0, 500)) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const id = typeof record.id === 'string' ? record.id : ''
    const version = typeof record.version === 'string' ? record.version : ''
    if (id.length < 2 || id.length > 64 || !ID.test(id)) continue
    if (!SEMVER.test(version)) continue

    const name = readLocalized(record.name) ?? { en: id }
    const summary = readLocalized(record.summary) ?? {}
    const author =
      typeof record.author === 'string' && record.author.trim()
        ? record.author.trim().slice(0, 80)
        : 'unknown'
    const type =
      record.type === 'builtin' || record.type === 'web' ? record.type : 'template'
    const status =
      record.status === 'builtin' || record.status === 'verified'
        ? record.status
        : 'community'
    const download =
      typeof record.download === 'string' && isAllowedDownloadUrl(record.download)
        ? record.download
        : undefined
    entries.push({
      id,
      version,
      name,
      summary,
      author,
      type,
      status,
      installable: record.installable === true && Boolean(download),
      ...(download ? { download } : {})
    })
  }
  return entries
}
