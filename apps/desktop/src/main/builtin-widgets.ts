import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { DevWidgetPayload } from '../shared/dev-widget'
import { RESOURCES_DIR } from './paths'
import { payloadFromDir } from './widgets/package'

/**
 * 随应用发布的内置组件（模板版）：resources/builtin-widgets/<id>/。
 * 它们和第三方模板走同一条渲染路径；React 版本只作为模板缺失时的兜底。
 */
export const BUILTIN_WIDGETS_DIR = join(RESOURCES_DIR, 'builtin-widgets')

export function listBuiltinWidgets(): DevWidgetPayload[] {
  if (!existsSync(BUILTIN_WIDGETS_DIR)) return []
  const out: DevWidgetPayload[] = []
  for (const name of readdirSync(BUILTIN_WIDGETS_DIR)) {
    if (name.startsWith('.')) continue
    const dir = join(BUILTIN_WIDGETS_DIR, name)
    try {
      if (!statSync(dir).isDirectory()) continue
    } catch {
      continue
    }
    const payload = payloadFromDir(dir)
    if (payload) out.push(payload)
  }
  return out.sort((a, b) => a.id.localeCompare(b.id))
}
