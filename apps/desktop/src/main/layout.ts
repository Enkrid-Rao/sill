import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DEFAULT_LAYOUT, normalizeLayout, type PanelLayout } from '../shared/layout'
import { USER_DATA_DIR } from './paths'

const LAYOUT_FILE = join(USER_DATA_DIR, 'layout.json')

let cache: PanelLayout | null = null

function cloneDefaults(): PanelLayout {
  return { version: 1, order: [...DEFAULT_LAYOUT.order], spans: { ...DEFAULT_LAYOUT.spans } }
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
    cache = normalizeLayout(JSON.parse(readFileSync(LAYOUT_FILE, 'utf8')))
  } catch {
    cache = cloneDefaults()
    persist(cache)
  }
  return cache
}

export function setLayout(raw: unknown): PanelLayout {
  cache = normalizeLayout(raw)
  persist(cache)
  return cache
}

export function resetLayout(): PanelLayout {
  cache = cloneDefaults()
  persist(cache)
  return cache
}
