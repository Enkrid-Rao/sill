import { app } from 'electron'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import type { CreateWidgetResult } from '../shared/widgets'
import { SKINS_DIR } from './skins'

/**
 * 组件脚手架：CLI 和宿主共用 `packages/cli/templates/`（打包后落在 resources/templates）。
 * 新增一个模板文件不用改代码，`sill new` 和设置里的「新建组件」一起生效。
 */
export type ScaffoldKind = 'template' | 'web'

export function scaffoldRoot(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'templates')
    : join(app.getAppPath(), '..', '..', 'packages', 'cli', 'templates')
}

function within(root: string, target: string): boolean {
  const base = resolve(root)
  const full = resolve(target)
  return full === base || full.startsWith(`${base}\\`) || full.startsWith(`${base}/`)
}

function applyPlaceholders(text: string, id: string, name: string): string {
  return text.replace(/\{\{id\}\}/g, id).replace(/\{\{name\}\}/g, name)
}

/** 只允许在 skins 目录里创建；失败时把半成品目录删掉。 */
export function createWidgetFolder(
  target: string,
  kind: ScaffoldKind,
  id: string,
  name: string
): CreateWidgetResult {
  if (!within(SKINS_DIR, target)) return { ok: false, error: '组件只能创建在组件文件夹里' }
  if (existsSync(target)) return { ok: false, error: '同名文件夹已经存在' }
  const source = join(scaffoldRoot(), kind)
  if (!existsSync(source)) return { ok: false, error: '组件模板缺失，请重新安装 Sill' }

  try {
    mkdirSync(target, { recursive: true })
    const walk = (current: string, relative: string): void => {
      for (const entry of readdirSync(current)) {
        const file = join(current, entry)
        const next = relative ? `${relative}/${entry}` : entry
        if (statSync(file).isDirectory()) {
          walk(file, next)
          continue
        }
        const out = join(target, next)
        mkdirSync(dirname(out), { recursive: true })
        writeFileSync(out, applyPlaceholders(readFileSync(file, 'utf8'), id, name))
      }
    }
    walk(source, '')
  } catch (error) {
    try {
      rmSync(target, { recursive: true, force: true })
    } catch {
      // 清不掉就算了，下一次同名创建会提示目录已存在
    }
    return { ok: false, error: error instanceof Error ? error.message : '创建组件失败' }
  }

  return { ok: true, id, dir: target }
}

/** 文件夹名 → 合法 id；不合法返回 null。 */
export function idFromFolder(name: string): string | null {
  const id = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '')
  if (id.length < 2 || id.length > 64) return null
  if (/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(id)) return id
  return null
}

export function nameFromId(id: string): string {
  return id
    .split('.')
    .pop()!
    .replace(/[-_]/g, ' ')
    .replace(/^./, (character) => character.toUpperCase())
}
