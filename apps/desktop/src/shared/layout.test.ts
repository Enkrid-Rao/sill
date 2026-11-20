import { describe, expect, it } from 'vitest'
import { normalizeLayout } from './layout'

describe('normalizeLayout free boxes', () => {
  it('clamps a too-narrow box to the 150px minimum', () => {
    const layout = normalizeLayout(
      {
        version: 2,
        mode: 'free',
        order: ['hero'],
        boxes: { hero: { x: -10, y: 0, w: 120, h: 40 } }
      },
      ['hero']
    )
    expect(layout.boxes.hero).toEqual({ x: 0, y: 0, w: 150, h: 48 })
  })

  it('keeps a valid box untouched', () => {
    const layout = normalizeLayout(
      {
        version: 2,
        mode: 'free',
        order: ['hero'],
        boxes: { hero: { x: 24, y: 12, w: 320, h: 180 } }
      },
      ['hero']
    )
    expect(layout.boxes.hero).toEqual({ x: 24, y: 12, w: 320, h: 180 })
  })
})
