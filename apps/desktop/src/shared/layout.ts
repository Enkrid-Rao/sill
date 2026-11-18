/**
 * 面板尺寸：宽高连续可调，形状预设只是起点。
 *
 * 布局有两种模式：
 *   - flow：卡片按网格流式排列（默认）
 *   - free：卡片绝对定位，开发者/用户可以拖到任意位置、改任意尺寸
 */

export type PanelPresetId = 'rail' | 'compact' | 'board' | 'wide'

export interface PanelPreset {
  id: PanelPresetId
  width: number
  /** 0 = 撑满可用高度（由主进程按工作区计算） */
  height: number
}

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

const PANEL_INLINE_PADDING = 36
const MIN_CARD_WIDTH = 220
const CARD_GAP = 9

export function columnsForWidth(width: number): 1 | 2 | 3 {
  const inner = Math.max(0, width - PANEL_INLINE_PADDING)
  const columns = Math.floor((inner + CARD_GAP) / (MIN_CARD_WIDTH + CARD_GAP))
  return Math.max(1, Math.min(3, columns)) as 1 | 2 | 3
}

export function maxColumns(width: number): number {
  return columnsForWidth(width)
}

// ---------- 卡片布局 ----------

export const CARD_IDS = ['hero', 'system', 'processes', 'media', 'todo'] as const

export interface WidgetBox {
  x: number
  y: number
  w: number
  h: number
}

export interface PanelLayout {
  version: 2
  /** flow = 网格；free = 绝对定位 */
  mode: 'flow' | 'free'
  order: string[]
  /** flow 模式下的跨列；free 模式不用 */
  spans: Record<string, number>
  hidden: string[]
  /** free 模式的位置与尺寸，单位 px，相对 sheet */
  boxes: Record<string, WidgetBox>
}

export const DEFAULT_LAYOUT: PanelLayout = {
  version: 2,
  mode: 'flow',
  order: [...CARD_IDS],
  spans: { hero: 3 },
  hidden: [],
  boxes: {}
}

function normalizeBox(value: unknown): WidgetBox | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const x = Number(raw.x)
  const y = Number(raw.y)
  const w = Number(raw.w)
  const h = Number(raw.h)
  if (![x, y, w, h].every(Number.isFinite)) return null
  return {
    x: Math.max(0, Math.min(10000, Math.round(x))),
    y: Math.max(0, Math.min(10000, Math.round(y))),
    w: Math.max(120, Math.min(4000, Math.round(w))),
    h: Math.max(48, Math.min(4000, Math.round(h)))
  }
}

/** 任意来源 → 合法布局：过滤未知 id、去重、补全、夹住尺寸 */
export function normalizeLayout(
  raw: unknown,
  knownIds: readonly string[] = CARD_IDS
): PanelLayout {
  const known = new Set(knownIds)
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const order: string[] = []
  if (Array.isArray(src.order)) {
    for (const id of src.order) {
      if (typeof id === 'string' && known.has(id) && !order.includes(id)) order.push(id)
    }
  }
  for (const id of knownIds) {
    if (!order.includes(id)) order.push(id)
  }

  const spans: Record<string, number> = {}
  const spansRaw =
    src.spans && typeof src.spans === 'object' ? (src.spans as Record<string, unknown>) : {}
  for (const id of knownIds) {
    const value = Number(spansRaw[id])
    if (Number.isFinite(value)) spans[id] = Math.max(1, Math.min(3, Math.round(value)))
  }

  const hidden: string[] = []
  if (Array.isArray(src.hidden)) {
    for (const id of src.hidden) {
      if (typeof id === 'string' && known.has(id) && !hidden.includes(id)) hidden.push(id)
    }
  }

  const boxes: Record<string, WidgetBox> = {}
  const boxesRaw =
    src.boxes && typeof src.boxes === 'object' ? (src.boxes as Record<string, unknown>) : {}
  for (const id of knownIds) {
    const box = normalizeBox(boxesRaw[id])
    if (box) boxes[id] = box
  }

  return {
    version: 2,
    mode: src.mode === 'free' ? 'free' : 'flow',
    order,
    spans,
    hidden,
    boxes
  }
}

export function clampSpan(span: number | undefined, columns: number): number {
  return Math.max(1, Math.min(columns, Math.round(span ?? 1)))
}

export function matchPreset(width: number, height: number): PanelPreset | null {
  return (
    PANEL_PRESETS.find(
      (preset) =>
        Math.abs(preset.width - width) <= 2 &&
        (preset.height === 0 ? height === 0 : Math.abs(preset.height - height) <= 2)
    ) ?? null
  )
}
