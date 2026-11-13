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
