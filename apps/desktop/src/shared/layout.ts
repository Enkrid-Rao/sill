/**
 * 面板尺寸：宽高连续可调，形状预设只是起点。
 *
 * 早期版本用四种固定形状（Rail / Compact / Board / Wide）决定窗口宽高与列数，
 * 结果是「想多放一列」只能换形状，窗口大小和内容排布都被锁死。现在：
 *   - 宽高是连续数值，拖窗口内侧边 / 底边即可改，设置里也有滑杆；
 *   - 列数由**实际宽度**推导（columnsForWidth），拖动过程中内容会自己重新落格；
 *   - 预设保留为四个「跳转点」，不是唯一合法值。
 */

export type PanelPresetId = 'rail' | 'compact' | 'board' | 'wide'

export interface PanelPreset {
  id: PanelPresetId
  width: number
  /** 0 = 撑满可用高度（由主进程按工作区计算） */
  height: number
}

/** 设置面板里的四个起点；Rail 是默认值（宽 384、高度撑满）。 */
export const PANEL_PRESETS: readonly PanelPreset[] = [
  { id: 'rail', width: 384, height: 0 },
  { id: 'compact', width: 420, height: 640 },
  { id: 'board', width: 660, height: 780 },
  { id: 'wide', width: 920, height: 900 }
]

export const PANEL_MIN_WIDTH = 320
export const PANEL_MIN_HEIGHT = 420
export const PANEL_MAX_WIDTH = 1180
export const PANEL_MAX_HEIGHT = 2200

export function getPanelPreset(id: string | undefined): PanelPreset {
  return PANEL_PRESETS.find((preset) => preset.id === id) ?? PANEL_PRESETS[0]
}

/** 面板左右内边距之和（.rail padding 18px × 2），列数按内容宽度算 */
const PANEL_INLINE_PADDING = 36
/** 卡片最小可读宽度；再窄就只放一列 */
const MIN_CARD_WIDTH = 220
const CARD_GAP = 9

/**
 * 宽度 → 列数。384 宽是 1 列，约 470 起 2 列，约 700 起 3 列。
 * 用公式而不是断点表，是为了拖动窗口时列数跟着连续变化而变化。
 */
export function columnsForWidth(width: number): 1 | 2 | 3 {
  const inner = Math.max(0, width - PANEL_INLINE_PADDING)
  const columns = Math.floor((inner + CARD_GAP) / (MIN_CARD_WIDTH + CARD_GAP))
  return Math.max(1, Math.min(3, columns)) as 1 | 2 | 3
}

/** 当前宽度下每张卡最多能跨几列 */
export function maxColumns(width: number): number {
  return columnsForWidth(width)
}

// ---------- 卡片布局 ----------

/** 面板里的卡片。顺序与跨列都按 id 存，将来 widget 引擎沿用同一份形状。 */
export const CARD_IDS = ['hero', 'system', 'processes', 'media', 'todo'] as const

export type CardId = (typeof CARD_IDS)[number]

export interface PanelLayout {
  version: 1
  order: CardId[]
  /** 跨几列；渲染时按当前列数夹住。hero 默认占满 */
  spans: Partial<Record<CardId, number>>
  /** 被用户暂时隐藏的组件；只影响渲染，不删布局顺序与跨列 */
  hidden: CardId[]
}

export const DEFAULT_LAYOUT: PanelLayout = {
  version: 1,
  order: [...CARD_IDS],
  spans: { hero: 3 },
  hidden: []
}

function isCardId(value: unknown): value is CardId {
  return typeof value === 'string' && (CARD_IDS as readonly string[]).includes(value)
}

/** 任意来源 → 合法布局：补全缺失卡片、去重、跨列夹在 1–3 */
export function normalizeLayout(raw: unknown): PanelLayout {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const order: CardId[] = []
  if (Array.isArray(src.order)) {
    for (const id of src.order) {
      if (isCardId(id) && !order.includes(id)) order.push(id)
    }
  }
  for (const id of CARD_IDS) {
    if (!order.includes(id)) order.push(id)
  }

  const spans: Partial<Record<CardId, number>> = {}
  const spansRaw = src.spans && typeof src.spans === 'object' ? (src.spans as Record<string, unknown>) : {}
  for (const id of CARD_IDS) {
    const value = Number(spansRaw[id])
    if (Number.isFinite(value)) spans[id] = Math.max(1, Math.min(3, Math.round(value)))
  }

  const hidden: CardId[] = []
  if (Array.isArray(src.hidden)) {
    for (const id of src.hidden) {
      if (isCardId(id) && !hidden.includes(id)) hidden.push(id)
    }
  }

  return { version: 1, order, spans, hidden }
}

/** 当前列数下这张卡实际占几列 */
export function clampSpan(span: number | undefined, columns: number): number {
  return Math.max(1, Math.min(columns, Math.round(span ?? 1)))
}

/** 尺寸预设匹配：宽高都在 2px 内算命中，高度 0 表示「撑满」 */
export function matchPreset(width: number, height: number): PanelPreset | null {
  return (
    PANEL_PRESETS.find(
      (preset) =>
        Math.abs(preset.width - width) <= 2 &&
        (preset.height === 0 ? height === 0 : Math.abs(preset.height - height) <= 2)
    ) ?? null
  )
}
