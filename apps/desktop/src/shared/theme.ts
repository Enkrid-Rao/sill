/**
 * Sill 主题：面板玻璃的「配方参数」。
 *
 * 这一层是主进程与渲染进程共用的唯一事实来源：
 *  - 主进程用它把 settings.json 里的 theme 收敛成合法值；
 *  - 渲染进程用它把 theme 翻译成 CSS 变量（见 renderer/src/lib/theme.ts）。
 *
 * 原则（DEVPLAN §5.4，v0.8 修订）：面板只有一种玻璃材质，组件仍然拿不到桌面像素；
 * 液态档（glassMode: 'live' / 'frame'）用「桌面像素 + WebGL 折射」实现：
 * 没有 backdrop-filter；live 档每帧采样的是屏幕流（WGC），frame 档每帧采样零次。
 * 主题只改颜色、光照几何和透明度。
 */

import type { GlassMode } from './glass'

export const ATMO_STYLES = [
  'lagoon',
  'aurora',
  'dusk',
  'ember',
  'frost',
  'noir',
  'veil',
  'mist'
] as const

export type AtmoStyle = (typeof ATMO_STYLES)[number]

export interface Theme {
  /** 氛围层总开关；关掉只剩玻璃底色 */
  atmosphere: boolean
  /** 氛围配方：8 种光照几何 */
  atmoStyle: AtmoStyle
  /** 氛围强度 0–100 */
  atmoStrength: number
  /** 背景色相 0–359（面板玻璃的主色） */
  hue: number
  /** 上色强度 0–60（0 = 中性深色玻璃） */
  tintSat: number
  /** 强调色相 0–359（进度、勾选、按钮、焦点环） */
  accentHue: number
  /** 玻璃底透明度 30–100 */
  glassOpacity: number
  /** 左上角顶光开关 */
  halo: boolean
  /** 顶光强度 0–100 */
  haloStrength: number
  /** 去色水光纹理开关 */
  grain: boolean

  /* ---------- 液态玻璃（实验档） ---------- */
  /** 'film' = 原来的四层静态贴膜；'liquid' = 抓帧 + WebGL 折射 */
  glassMode: GlassMode
  /** 背景模糊 σ（CSS px）0–40 */
  glassBlur: number
  /** 边缘折射强度 0–200（100 = 默认 2.2 倍位移） */
  glassRefraction: number
  /** 色散 0–100（40 = 默认 0.2） */
  glassDispersion: number
  /** 呼吸 / 震荡幅度 0–200（100 = 默认，0 = 完全静止） */
  glassMotion: number
  /** 滑入震荡：边缘鼓起 + 高光鼓起 + 采样空间挤压。关掉只剩呼吸 */
  glassWobble: boolean
  /**
   * 滚动视差：面板内部滚动时让背景跟着「流」一下。
   * 默认**关** —— 背景应该只跟窗口位置和桌面像素有关，跟随滚动是刻意的额外效果。
   */
  glassScrollFlow: boolean
}

export const DEFAULT_THEME: Theme = {
  atmosphere: false,
  atmoStyle: 'noir',
  atmoStrength: 70,
  hue: 210,
  tintSat: 0,
  accentHue: 158,
  glassOpacity: 52,
  halo: true,
  haloStrength: 55,
  grain: true,

  glassMode: 'live',
  glassBlur: 8,
  glassRefraction: 130,
  glassDispersion: 60,
  glassMotion: 100,
  // 默认关：滑入那一下的鼓胀在真玻璃上读起来更像「UI 在抖」而不是材质在动
  glassWobble: false,
  glassScrollFlow: false
}

export interface Preset {
  id: string
  name: string
  hue: number
  tint: number
  accent: number
  atmo: AtmoStyle
  intensity: number
  /** 不写就是 true；Clear 这类中性预设要关掉氛围 */
  atmosphere?: boolean
  /** 可选：连透明度一起收（Clear 要真的清透） */
  glassOpacity?: number
  /** 可选：连顶光一起收 */
  halo?: boolean
}

/** 一键主题：只设置颜色与氛围，不动透明度 / 光晕 / 颗粒 */
export const PRESETS: readonly Preset[] = [
  {
    id: 'clear',
    name: 'Clear',
    hue: 210,
    tint: 0,
    accent: 158,
    atmo: 'noir',
    intensity: 70,
    atmosphere: false,
    glassOpacity: 52,
    halo: true
  },
  { id: 'lagoon', name: 'Lagoon', hue: 165, tint: 34, accent: 158, atmo: 'lagoon', intensity: 92 },
  { id: 'aurora', name: 'Aurora', hue: 236, tint: 30, accent: 202, atmo: 'aurora', intensity: 95 },
  { id: 'dusk', name: 'Dusk', hue: 296, tint: 27, accent: 330, atmo: 'dusk', intensity: 90 },
  { id: 'ember', name: 'Ember', hue: 24, tint: 34, accent: 26, atmo: 'ember', intensity: 88 },
  { id: 'frost', name: 'Frost', hue: 202, tint: 24, accent: 190, atmo: 'frost', intensity: 84 },
  { id: 'iris', name: 'Iris', hue: 264, tint: 32, accent: 272, atmo: 'veil', intensity: 92 },
  { id: 'moss', name: 'Moss', hue: 96, tint: 30, accent: 88, atmo: 'mist', intensity: 86 }
]

export interface TintSwatch {
  name: string
  hue: number
  tint: number
}

/** 背景色珠：点一下同时设色相与上色强度 */
export const TINT_SWATCHES: readonly TintSwatch[] = [
  { name: 'Ink', hue: 218, tint: 4 },
  { name: 'Fog', hue: 210, tint: 8 },
  { name: 'Sea', hue: 165, tint: 34 },
  { name: 'Sky', hue: 205, tint: 32 },
  { name: 'Iris', hue: 264, tint: 32 },
  { name: 'Rose', hue: 334, tint: 30 },
  { name: 'Clay', hue: 24, tint: 34 },
  { name: 'Moss', hue: 96, tint: 30 }
]

export interface AccentSwatch {
  name: string
  hue: number
}

export const ACCENT_SWATCHES: readonly AccentSwatch[] = [
  { name: 'Mint', hue: 158 },
  { name: 'Sky', hue: 196 },
  { name: 'Iris', hue: 262 },
  { name: 'Orchid', hue: 300 },
  { name: 'Rose', hue: 336 },
  { name: 'Amber', hue: 32 },
  { name: 'Lime', hue: 86 },
  { name: 'Steel', hue: 212 }
]

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.round(parsed)))
}

function isAtmoStyle(value: unknown): value is AtmoStyle {
  return typeof value === 'string' && (ATMO_STYLES as readonly string[]).includes(value)
}

/** 任意来源 → 合法 Theme。坏值一律回落默认，越界夹住。 */
export function normalizeTheme(raw: unknown): Theme {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Partial<Theme>

  return {
    atmosphere: src.atmosphere !== false,
    atmoStyle: isAtmoStyle(src.atmoStyle) ? src.atmoStyle : DEFAULT_THEME.atmoStyle,
    atmoStrength: clampInt(src.atmoStrength, DEFAULT_THEME.atmoStrength, 0, 100),
    hue: clampInt(src.hue, DEFAULT_THEME.hue, 0, 359),
    tintSat: clampInt(src.tintSat, DEFAULT_THEME.tintSat, 0, 60),
    accentHue: clampInt(src.accentHue, DEFAULT_THEME.accentHue, 0, 359),
    glassOpacity: clampInt(src.glassOpacity, DEFAULT_THEME.glassOpacity, 30, 100),
    halo: src.halo !== false,
    haloStrength: clampInt(src.haloStrength, DEFAULT_THEME.haloStrength, 0, 100),
    grain: src.grain !== false,

    // 什么都没存 → 用默认（live）。
    // 老版本存过 'liquid'：那一档的本意就是「真玻璃」，现在真玻璃 = 实时档，
    // 所以升级过来应该落在 live 上，而不是悄悄退成静态帧。
    glassMode:
      src.glassMode === undefined || String(src.glassMode) === 'liquid'
        ? DEFAULT_THEME.glassMode
        : src.glassMode === 'film' || src.glassMode === 'live'
          ? src.glassMode
          : 'frame',
    glassBlur: clampInt(src.glassBlur, DEFAULT_THEME.glassBlur, 0, 40),
    glassRefraction: clampInt(src.glassRefraction, DEFAULT_THEME.glassRefraction, 0, 200),
    glassDispersion: clampInt(src.glassDispersion, DEFAULT_THEME.glassDispersion, 0, 100),
    glassMotion: clampInt(src.glassMotion, DEFAULT_THEME.glassMotion, 0, 200),
    glassWobble: src.glassWobble === true,
    glassScrollFlow: src.glassScrollFlow === true
  }
}

/** 当前配色是否正好等于某个预设（用于高亮）；Clear 这类关氛围的预设也能命中 */
export function matchPreset(theme: Theme): Preset | null {
  return (
    PRESETS.find(
      (preset) =>
        (preset.atmosphere ?? true) === theme.atmosphere &&
        preset.hue === theme.hue &&
        preset.tint === theme.tintSat &&
        preset.accent === theme.accentHue &&
        preset.atmo === theme.atmoStyle &&
        preset.intensity === theme.atmoStrength &&
        (preset.glassOpacity === undefined || preset.glassOpacity === theme.glassOpacity) &&
        (preset.halo === undefined || preset.halo === theme.halo)
    ) ?? null
  )
}

/** 预设按钮 → 一组可应用的 Theme 补丁 */
export function presetPatch(preset: Preset): Partial<Theme> {
  return {
    atmosphere: preset.atmosphere ?? true,
    hue: preset.hue,
    tintSat: preset.tint,
    accentHue: preset.accent,
    atmoStyle: preset.atmo,
    atmoStrength: preset.intensity,
    ...(preset.glassOpacity === undefined ? {} : { glassOpacity: preset.glassOpacity }),
    ...(preset.halo === undefined ? {} : { halo: preset.halo })
  }
}
