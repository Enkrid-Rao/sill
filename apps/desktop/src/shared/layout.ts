/** 面板形状：决定窗口宽高与内容列数。宽度不再是一个连续滑块，而是一组形状。 */

export type PanelShape = 'rail' | 'compact' | 'board' | 'wide'

export interface PanelShapeSpec {
  id: PanelShape
  /** 逻辑像素 */
  width: number
  /** 0 = 高度由工作区推导（rail） */
  height: number
  cols: 1 | 2 | 3
}

export const PANEL_SHAPES: readonly PanelShapeSpec[] = [
  { id: 'rail', width: 384, height: 0, cols: 1 },
  { id: 'compact', width: 340, height: 620, cols: 1 },
  { id: 'board', width: 560, height: 720, cols: 2 },
  { id: 'wide', width: 720, height: 780, cols: 3 }
]

export function getPanelShape(id: string | undefined): PanelShapeSpec {
  return PANEL_SHAPES.find((shape) => shape.id === id) ?? PANEL_SHAPES[0]
}

// ---------- 卡片布局 ----------

/** 面板里的卡片。顺序与跨列都按 id 存，将来 widget 引擎沿用同一份形状。 */
export const CARD_IDS = ['hero', 'system', 'processes', 'media', 'todo'] as const

export type CardId = (typeof CARD_IDS)[number]

export interface PanelLayout {
  version: 1
  order: CardId[]
  /** 跨几列；渲染时按当前形状的列数夹住。hero 默认占满 */
  spans: Partial<Record<CardId, number>>
}

export const DEFAULT_LAYOUT: PanelLayout = {
  version: 1,
  order: [...CARD_IDS],
  spans: { hero: 3 }
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

  return { version: 1, order, spans }
}

/** 当前形状下这张卡实际占几列 */
export function clampSpan(span: number | undefined, columns: number): number {
  return Math.max(1, Math.min(columns, Math.round(span ?? 1)))
}
