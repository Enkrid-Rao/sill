import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { USER_DATA_DIR } from './paths'

/**
 * 组件的私有存储：<userData>/widget-data/<id>.json
 *
 * 给模板的 ui/main.js 用（sill.storage），代替「每个卡都加一套宿主设置 UI」。
 * 组件自己决定存什么、怎么展示。
 */
const DATA_DIR = join(USER_DATA_DIR, 'widget-data')

function fileFor(id: string): string {
  return join(DATA_DIR, `${id.replace(/[^a-z0-9.-]/gi, '_')}.json`)
}

export function readWidgetData(id: string): Record<string, unknown> {
  try {
    const raw = JSON.parse(readFileSync(fileFor(id), 'utf8')) as unknown
    return raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

export function writeWidgetData(id: string, value: unknown): Record<string, unknown> {
  const next =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}
  mkdirSync(DATA_DIR, { recursive: true })
  const file = fileFor(id)
  const tmp = `${file}.tmp`
  writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  renameSync(tmp, file)
  return next
}
