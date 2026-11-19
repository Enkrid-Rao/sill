import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 组件脚手架模块依赖 electron 的 app 和 skins 路径；测试里都换成临时目录。
const { state } = vi.hoisted(() => ({ state: { root: '' } }))

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    // vitest 的工作目录是 apps/desktop，模板在仓库的 packages/cli/templates
    getAppPath: () => process.cwd()
  }
}))

vi.mock('./skins', () => ({
  get SKINS_DIR() {
    return join(state.root, 'skins')
  }
}))

import { createWidgetFolder, idFromFolder, nameFromId } from './widget-scaffold'

beforeEach(() => {
  state.root = mkdtempSync(join(tmpdir(), 'sill-scaffold-'))
  mkdirSync(join(state.root, 'skins'), { recursive: true })
})

afterEach(() => {
  rmSync(state.root, { recursive: true, force: true })
})

describe('idFromFolder', () => {
  it('normalises a folder name into a valid id', () => {
    expect(idFromFolder('My Widget')).toBe('my-widget')
    expect(idFromFolder('com.you.clock')).toBe('com.you.clock')
    expect(idFromFolder('  demo  ')).toBe('demo')
  })

  it('rejects names that cannot be an id', () => {
    expect(idFromFolder('x')).toBeNull()
    expect(idFromFolder('***')).toBeNull()
    expect(idFromFolder('a'.repeat(80))).toBeNull()
  })
})

describe('nameFromId', () => {
  it('uses the last segment, title-cased', () => {
    expect(nameFromId('com.you.clock')).toBe('Clock')
    expect(nameFromId('my-widget')).toBe('My widget')
  })
})

describe('createWidgetFolder', () => {
  it('copies the template and fills in id / name', () => {
    const target = join(state.root, 'skins', 'demo')
    const result = createWidgetFolder(target, 'template', 'demo', 'Demo')
    expect(result.ok).toBe(true)

    const manifest = JSON.parse(readFileSync(join(target, 'widget.json'), 'utf8'))
    expect(manifest).toMatchObject({ schema: 1, id: 'demo', name: 'Demo', type: 'template' })
    expect(existsSync(join(target, 'ui/index.html'))).toBe(true)
    expect(existsSync(join(target, 'ui/main.js'))).toBe(true)
    expect(readFileSync(join(target, 'README.md'), 'utf8')).toContain('# Demo')
    expect(readFileSync(join(target, 'ui/main.js'), 'utf8')).not.toContain('{{')
  })

  it('creates a web scaffold when asked', () => {
    const target = join(state.root, 'skins', 'webdemo')
    expect(createWidgetFolder(target, 'web', 'webdemo', 'Webdemo').ok).toBe(true)
    const manifest = JSON.parse(readFileSync(join(target, 'widget.json'), 'utf8'))
    expect(manifest).toMatchObject({ type: 'web', trust: 'trusted' })
  })

  it('refuses to write outside the skins directory', () => {
    const target = join(state.root, 'outside')
    const result = createWidgetFolder(target, 'template', 'demo', 'Demo')
    expect(result.ok).toBe(false)
    expect(existsSync(target)).toBe(false)
  })
})
