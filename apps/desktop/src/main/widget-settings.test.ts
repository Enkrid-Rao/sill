import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WidgetSettingField } from '../shared/widgets'

const { state } = vi.hoisted(() => ({ state: { dir: '' } }))

vi.mock('./paths', () => ({
  get USER_DATA_DIR() {
    return state.dir
  }
}))

import {
  normalizeSettingsValues,
  readWidgetSettings,
  writeWidgetSettings
} from './widget-settings'

const fields: WidgetSettingField[] = [
  { key: 'city', type: 'text', default: 'Shenzhen' },
  { key: 'unit', type: 'select', default: 'c', options: [{ value: 'c' }, { value: 'f' }] },
  { key: 'seconds', type: 'switch', default: true },
  { key: 'refresh', type: 'number', default: 5, min: 1, max: 30 }
]

beforeEach(() => {
  state.dir = mkdtempSync(join(tmpdir(), 'sill-settings-'))
})

afterEach(() => {
  rmSync(state.dir, { recursive: true, force: true })
})

describe('normalizeSettingsValues', () => {
  it('fills defaults and drops unknown keys', () => {
    expect(normalizeSettingsValues(fields, { city: 'Oslo', hacker: true })).toEqual({
      city: 'Oslo',
      unit: 'c',
      seconds: true,
      refresh: 5
    })
  })

  it('clamps numbers and rejects unknown select values', () => {
    expect(
      normalizeSettingsValues(fields, { refresh: 999, unit: 'kelvin' })
    ).toMatchObject({ refresh: 30, unit: 'c' })
    expect(normalizeSettingsValues(fields, { refresh: -5 })).toMatchObject({ refresh: 1 })
  })

  it('coerces invalid types back to defaults', () => {
    expect(
      normalizeSettingsValues(fields, { city: 42, seconds: 'yes', unit: 1 })
    ).toEqual({ city: 'Shenzhen', unit: 'c', seconds: true, refresh: 5 })
  })
})

describe('settings store', () => {
  it('returns defaults for a component that has no file yet', () => {
    expect(readWidgetSettings('demo', fields)).toEqual({
      city: 'Shenzhen',
      unit: 'c',
      seconds: true,
      refresh: 5
    })
  })

  it('persists a patch and merges with existing values', () => {
    writeWidgetSettings('demo', fields, { city: 'Tokyo' })
    const next = writeWidgetSettings('demo', fields, { seconds: false })
    expect(next).toEqual({ city: 'Tokyo', unit: 'c', seconds: false, refresh: 5 })
    expect(readWidgetSettings('demo', fields)).toEqual(next)
  })

  it('survives a corrupted file', () => {
    mkdirSync(join(state.dir, 'widget-settings'), { recursive: true })
    writeFileSync(join(state.dir, 'widget-settings', 'demo.json'), '{ not json')
    expect(readWidgetSettings('demo', fields)).toMatchObject({ city: 'Shenzhen' })
  })
})
