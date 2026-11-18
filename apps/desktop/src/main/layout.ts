import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { CARD_IDS, DEFAULT_LAYOUT, normalizeLayout, type PanelLayout } from '../shared/layout'
import { getDevWidget } from './dev-widget'
import { listInstalled } from './widgets/package'
import { USER_DATA_DIR } from './paths'

const LAYOUT_FILE = join(USER_DATA_DIR, 'layout.json')
export const COMPONENTS_DIR = join(USER_DATA_DIR, 'components')

let cache: PanelLayout | null = null

/** Built-ins first, then installed components, then the dev widget. */
function knownIds(): string[] {
  const installed = listInstalled(COMPONENTS_DIR).map((item) => item.id)
  const dev = getDevWidget()
  return [...new Set([...CARD_IDS, ...installed, ...(dev ? [dev.id] : [])])]
}

function cloneDefaults(): PanelLayout {
  return normalizeLayout(DEFAULT_LAYOUT, knownIds())
}

function persist(layout: PanelLayout): void {
  try {
    mkdirSync(dirname(LAYOUT_FILE), { recursive: true })
    const tmp = `${LAYOUT_FILE}.tmp`
    writeFileSync(tmp, `${JSON.stringify(layout, null, 2)}\n`, 'utf8')
    renameSync(tmp, LAYOUT_FILE)
  } catch (error) {
    console.error('[sill] 无法写入布局：', error)
  }
}

export function getLayout(): PanelLayout {
  if (cache) return cache
  try {
    cache = normalizeLayout(JSON.parse(readFileSync(LAYOUT_FILE, 'utf8')), knownIds())
  } catch {
    cache = cloneDefaults()
    persist(cache)
  }
  return cache
}

export function setLayout(raw: unknown): PanelLayout {
  cache = normalizeLayout(raw, knownIds())
  persist(cache)
  return cache
}

export function resetLayout(): PanelLayout {
  cache = cloneDefaults()
  persist(cache)
  return cache
}

/** 安装/卸载组件后让下一次 getLayout() 重新计算 known ids。 */
export function invalidateLayout(): void {
  cache = null
}
