import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { WidgetSettingField } from '../shared/widgets'
import { USER_DATA_DIR } from './paths'

/**
 * 组件设置值：<userData>/widget-settings/<id>.json
 *
 * 声明在 widget.json 的 settings 里，宿主渲染表单；组件通过 sill.settings 读。
 * 和 sill.storage 分开，避免「用户设置」被组件自己的业务数据覆盖。
 */
function settingsDir(): string {
  return join(USER_DATA_DIR, 'widget-settings')
}

function settingsFile(id: string): string {
  return join(settingsDir(), `${id.replace(/[^a-z0-9.-]/gi, '_')}.json`)
}

/** 任意输入 → 按声明补齐默认值、夹范围、过滤未知 key。 */
export function normalizeSettingsValues(
  fields: readonly WidgetSettingField[],
  raw: unknown
): Record<string, unknown> {
  const source =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {}
  const out: Record<string, unknown> = {}

  for (const field of fields) {
    const value = source[field.key]

    if (field.type === 'switch') {
      out[field.key] = typeof value === 'boolean' ? value : field.default === true
      continue
    }

    if (field.type === 'number') {
      const fallback = typeof field.default === 'number' ? field.default : 0
      const numeric = Number(value === undefined ? fallback : value)
      const min = field.min ?? -Number.MAX_SAFE_INTEGER
      const max = field.max ?? Number.MAX_SAFE_INTEGER
      out[field.key] = Number.isFinite(numeric)
        ? Math.min(max, Math.max(min, numeric))
        : fallback
      continue
    }

    if (field.type === 'select') {
      const allowed = (field.options ?? []).map((option) => option.value)
      const fallback =
        typeof field.default === 'string' && allowed.includes(field.default)
          ? field.default
          : allowed[0] ?? ''
      out[field.key] = typeof value === 'string' && allowed.includes(value) ? value : fallback
      continue
    }

    const fallback = typeof field.default === 'string' ? field.default : ''
    out[field.key] = typeof value === 'string' ? value.slice(0, 500) : fallback
  }

  return out
}

export function readWidgetSettings(
  id: string,
  fields: readonly WidgetSettingField[]
): Record<string, unknown> {
  let raw: unknown = {}
  try {
    raw = JSON.parse(readFileSync(settingsFile(id), 'utf8'))
  } catch {
    raw = {}
  }
  return normalizeSettingsValues(fields, raw)
}

export function writeWidgetSettings(
  id: string,
  fields: readonly WidgetSettingField[],
  patch: unknown
): Record<string, unknown> {
  const current = readWidgetSettings(id, fields)
  const next = normalizeSettingsValues(
    fields,
    patch && typeof patch === 'object' && !Array.isArray(patch)
      ? { ...current, ...(patch as Record<string, unknown>) }
      : current
  )

  try {
    mkdirSync(settingsDir(), { recursive: true })
    const file = settingsFile(id)
    const tmp = `${file}.tmp`
    writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
    renameSync(tmp, file)
  } catch (error) {
    console.error('[sill] 无法写入组件设置：', error)
  }

  return next
}
