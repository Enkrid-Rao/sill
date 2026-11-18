import AdmZip from 'adm-zip'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  inspectPackage,
  installPackage,
  listInstalled,
  loadInstalled,
  uninstallPackage
} from './package'

const manifest = {
  schema: 1,
  id: 'com.example.clock',
  name: 'Clock',
  version: '1.0.0',
  author: 'test',
  license: 'MIT',
  runtime: '>=0.5.4',
  engine: '>=0.1.0',
  type: 'template',
  permissions: ['data.time'],
  data: [{ id: 'now', source: 'time.now' }],
  strings: { en: { label: 'TIME' }, zh: { label: '时间' } },
  span: { default: 1 },
  ui: 'ui/index.html'
}

const html = '<div data-sill-text="now.time">--:--</div>'
const css = ':host { display: block; }'

let root: string

function makePackage(files: Record<string, string>): string {
  const zip = new AdmZip()
  for (const [name, value] of Object.entries(files)) zip.addFile(name, Buffer.from(value))
  const file = join(root, 'widget.sill')
  zip.writeZip(file)
  return file
}

function validFiles(): Record<string, string> {
  return {
    'widget.json': JSON.stringify(manifest),
    'ui/index.html': html,
    'ui/style.css': css
  }
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'sill-package-test-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

const webManifest = { ...manifest, type: 'web', trust: 'trusted', size: { w: 384, h: 180 } }
const webFiles = (): Record<string, string> => ({
  'widget.json': JSON.stringify(webManifest),
  'ui/index.html': '<div id="host">--</div>',
  'ui/style.css': css,
  'ui/main.js': "document.querySelector('#host').textContent = require('node:os').hostname()"
})

describe('installPackage', () => {
  it('inspects, installs, loads and uninstalls a valid package', () => {
    const file = makePackage(validFiles())
    const inspected = inspectPackage(file)
    expect(inspected.ok).toBe(true)
    expect(inspected.widget).toMatchObject({
      id: 'com.example.clock',
      version: '1.0.0',
      permissions: ['data.time']
    })

    const installed = installPackage(file, join(root, 'components'))
    expect(installed.ok).toBe(true)
    expect(listInstalled(join(root, 'components'))).toHaveLength(1)

    const loaded = loadInstalled(join(root, 'components'), 'com.example.clock')
    expect(loaded?.html).toContain('data-sill-text')
    expect(loaded?.data).toEqual([{ id: 'now', source: 'time.now' }])
    expect(loaded?.strings).toEqual(manifest.strings)

    expect(uninstallPackage(join(root, 'components'), 'com.example.clock').ok).toBe(true)
    expect(listInstalled(join(root, 'components'))).toEqual([])
  })

  it('installs a trusted web package and loads its JS', () => {
    const file = makePackage(webFiles())
    const components = join(root, 'components')
    const installed = installPackage(file, components)
    expect(installed.ok).toBe(true)
    expect(installed.widget).toMatchObject({ kind: 'web', trust: 'trusted' })

    const loaded = loadInstalled(components, 'com.example.clock')
    expect(loaded?.kind).toBe('web')
    expect(loaded?.trust).toBe('trusted')
    expect(loaded?.js).toContain('node:os')
  })

  it('rejects extra files', () => {
    const file = makePackage({ ...validFiles(), 'README.md': 'x' })
    expect(installPackage(file, join(root, 'components'))).toEqual({
      ok: false,
      error: expect.stringContaining('不允许的文件')
    })
  })

  it('rejects path traversal entries', () => {
    const file = makePackage({ ...validFiles(), '../evil.txt': 'x' })
    const result = installPackage(file, join(root, 'components'))
    expect(result.ok).toBe(false)
  })

  it('rejects script and event attributes', () => {
    const script = makePackage({ ...validFiles(), 'ui/index.html': '<script>x</script>' })
    expect(installPackage(script, join(root, 'components')).ok).toBe(false)

    const handler = makePackage({
      ...validFiles(),
      'ui/index.html': '<div onclick="x">x</div>'
    })
    expect(installPackage(handler, join(root, 'components')).ok).toBe(false)
  })

  it('rejects remote CSS', () => {
    const file = makePackage({ ...validFiles(), 'ui/style.css': 'body { background: url(x) }' })
    expect(installPackage(file, join(root, 'components')).ok).toBe(false)
  })

  it('rejects a second version of the same id', () => {
    const file = makePackage(validFiles())
    const components = join(root, 'components')
    expect(installPackage(file, components).ok).toBe(true)
    expect(installPackage(file, components)).toEqual({
      ok: false,
      error: '这个组件已经安装'
    })
  })
})
