import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { DEFAULT_THEME, normalizeTheme, type Theme } from '../shared/theme'
import { SETTINGS_FILE } from './paths'

export type Side = 'right' | 'left'

export interface Settings {
  /** 全局热键，Electron accelerator 语法 */
  hotkey: string
  /** 面板宽度（px） */
  panelWidth: number
  /** 停靠方向：right 从屏幕右侧滑入，left 从左侧 */
  side: Side
  /** 是否开机自启 */
  startAtLogin: boolean
  /** 面板是否置顶 */
  pinned: boolean
  /** 玻璃主题：颜色、氛围、光晕、颗粒 */
  theme: Theme
  /** 上次停靠位置（多屏记忆，M0 只记录不强制） */
  panel: { x: number; y: number } | null
}

export const DEFAULTS: Settings = {
  hotkey: 'Alt+Q',
  panelWidth: 384,
  side: 'right',
  startAtLogin: false,
  pinned: true,
  theme: DEFAULT_THEME,
  panel: null
}

let cache: Settings | null = null

/** 把任意来源的对象收敛成一份合法设置：类型不对就回落默认值，越界就夹住 */
function coerce(raw: unknown): Settings {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const width = Number(src.panelWidth)
  const side = src.side === 'left' ? 'left' : 'right'
  const panel =
    src.panel && typeof src.panel === 'object' &&
    Number.isFinite((src.panel as { x: unknown }).x) &&
    Number.isFinite((src.panel as { y: unknown }).y)
      ? {
          x: Math.round((src.panel as { x: number }).x),
          y: Math.round((src.panel as { y: number }).y)
        }
      : null

  return {
    hotkey: typeof src.hotkey === 'string' && src.hotkey.trim() ? src.hotkey.trim() : DEFAULTS.hotkey,
    panelWidth: Number.isFinite(width) ? Math.min(460, Math.max(340, Math.round(width))) : DEFAULTS.panelWidth,
    side,
    startAtLogin: src.startAtLogin === true,
    pinned: src.pinned !== false,
    theme: normalizeTheme(src.theme),
    panel
  }
}

export function loadSettings(): Settings {
  if (cache) return cache
  try {
    cache = coerce(JSON.parse(readFileSync(SETTINGS_FILE, 'utf8')))
  } catch {
    // 文件不存在或已损坏：回落默认值，不阻塞启动
    cache = { ...DEFAULTS, theme: normalizeTheme(DEFAULT_THEME) }
  }
  return cache
}

/** 原子写：临时文件 + rename，避免断电/崩溃留下半个 json */
function persist(next: Settings): void {
  try {
    mkdirSync(dirname(SETTINGS_FILE), { recursive: true })
    const tmp = `${SETTINGS_FILE}.tmp`
    writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
    renameSync(tmp, SETTINGS_FILE)
  } catch (error) {
    console.error('[sill] 无法写入设置：', error)
  }
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const next = coerce({ ...loadSettings(), ...patch })
  cache = next
  persist(next)
  return next
}
