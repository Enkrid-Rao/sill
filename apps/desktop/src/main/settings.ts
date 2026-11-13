import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { app } from 'electron'
import type { Language } from '../shared/i18n'
import {
  getPanelPreset,
  PANEL_MAX_HEIGHT,
  PANEL_MAX_WIDTH,
  PANEL_MIN_HEIGHT,
  PANEL_MIN_WIDTH
} from '../shared/layout'
import { DEFAULT_THEME, normalizeTheme, type Theme } from '../shared/theme'
import { SETTINGS_FILE } from './paths'

export type Side = 'right' | 'left'

export interface Settings {
  /** 全局热键，Electron accelerator 语法 */
  hotkey: string
  /** 面板宽度（逻辑像素），连续可调 */
  panelWidth: number
  /** 面板高度；0 = 撑满当前工作区可用高度 */
  panelHeight: number
  /** 相对垂直居中位置的偏移，拖底边改变高度后记住落点 */
  panelOffsetY: number
  /** 停靠方向：right 从屏幕右侧滑入，left 从左侧 */
  side: Side
  /** 面板离屏幕左右边缘的距离（px） */
  edgeGap: number
  /** 界面语言 */
  language: Language
  /** 是否开机自启 */
  startAtLogin: boolean
  /** 是否自动检查更新 */
  autoUpdate: boolean
  /** 玻璃主题：颜色、氛围、光晕、颗粒 */
  theme: Theme
}

export const DEFAULTS: Settings = {
  hotkey: 'Alt+Q',
  panelWidth: 384,
  panelHeight: 0,
  panelOffsetY: 0,
  side: 'right',
  edgeGap: 30,
  language: 'en',
  startAtLogin: false,
  autoUpdate: true,
  theme: DEFAULT_THEME
}

/** 首次启动跟随系统语言；之后以 settings.json 为准 */
function systemLanguage(): Language {
  return app.getLocale().toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

let cache: Settings | null = null

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** 把任意来源的对象收敛成一份合法设置：类型不对就回落默认值，越界就夹住 */
function coerce(raw: unknown): Settings {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const gap = Number(src.edgeGap)
  const side = src.side === 'left' ? 'left' : 'right'
  const language: Language =
    src.language === 'zh' || src.language === 'en' ? src.language : systemLanguage()

  // 旧版本存的是 panelShape；新版本优先读连续宽高，读不到再从旧形状迁移一次。
  const legacy = getPanelPreset(typeof src.panelShape === 'string' ? src.panelShape : undefined)
  const widthRaw = Number(src.panelWidth)
  const heightRaw = Number(src.panelHeight)
  const panelWidth = Number.isFinite(widthRaw)
    ? clamp(Math.round(widthRaw), PANEL_MIN_WIDTH, PANEL_MAX_WIDTH)
    : legacy.width
  const panelHeight = Number.isFinite(heightRaw)
    ? heightRaw === 0
      ? 0
      : clamp(Math.round(heightRaw), PANEL_MIN_HEIGHT, PANEL_MAX_HEIGHT)
    : legacy.height
  const offsetRaw = Number(src.panelOffsetY)

  return {
    hotkey: typeof src.hotkey === 'string' && src.hotkey.trim() ? src.hotkey.trim() : DEFAULTS.hotkey,
    panelWidth,
    panelHeight,
    panelOffsetY: Number.isFinite(offsetRaw)
      ? clamp(Math.round(offsetRaw), -PANEL_MAX_HEIGHT, PANEL_MAX_HEIGHT)
      : 0,
    side,
    edgeGap: Number.isFinite(gap) ? clamp(Math.round(gap), 0, 80) : DEFAULTS.edgeGap,
    language,
    startAtLogin: src.startAtLogin === true,
    autoUpdate: src.autoUpdate !== false,
    theme: normalizeTheme(src.theme)
  }
}

export function loadSettings(): Settings {
  if (cache) return cache
  try {
    cache = coerce(JSON.parse(readFileSync(SETTINGS_FILE, 'utf8')))
  } catch {
    // 文件不存在或已损坏：回落默认值，不阻塞启动
    cache = coerce({})
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
