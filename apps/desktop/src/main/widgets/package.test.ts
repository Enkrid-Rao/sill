import AdmZip from 'adm-zip'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  getComponentDiagnostics,
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
  'ui/main.js': "document.querySelector('#host').textContent = require('node:os').hostname()",
  'ui/assets/helper.ps1': 'Write-Output ok'
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
    expect(loaded?.dir).toBeTruthy()
    expect(existsSync(join(loaded!.dir!, 'ui/assets/helper.ps1'))).toBe(true)
  })

  it('rejects files outside widget.json / ui/', () => {
    const file = makePackage({ ...validFiles(), 'tools/build.ps1': 'x' })
    expect(installPackage(file, join(root, 'components'))).toEqual({
      ok: false,
      error: expect.stringContaining('不允许的文件')
    })
  })

  it('allows README and LICENSE next to the manifest', () => {
    const file = makePackage({
      ...validFiles(),
      'README.md': '# clock',
      'LICENSE': 'MIT'
    })
    expect(installPackage(file, join(root, 'components')).ok).toBe(true)
  })

  it('rejects a package without ui/index.html', () => {
    const file = makePackage({
      'widget.json': JSON.stringify(manifest),
      'ui/style.css': css
    })
    expect(installPackage(file, join(root, 'components'))).toEqual({
      ok: false,
      error: '缺少 ui/index.html'
    })
  })

  it('accepts a template with main.js, nested ui files and no style.css', () => {
    const file = makePackage({
      'widget.json': JSON.stringify(manifest),
      'ui/index.html': html,
      'ui/main.js': 'sill.onData(() => {})',
      'ui/lib/format.js': 'export const x = 1',
      'ui/assets/icon.svg': '<svg />'
    })
    expect(installPackage(file, join(root, 'components')).ok).toBe(true)
  })

  it('accepts a single-segment id, build metadata and unknown permissions', () => {
    const file = makePackage({
      ...validFiles(),
      'widget.json': JSON.stringify({
        ...manifest,
        id: 'clock',
        version: '1.0.0+rev2',
        permissions: ['data.time', 'action.custom']
      })
    })
    const result = installPackage(file, join(root, 'components'))
    expect(result.ok).toBe(true)
    expect(result.widget).toMatchObject({ id: 'clock', version: '1.0.0+rev2' })
  })

  it('accepts a manifest without license / runtime / engine / author', () => {
    const raw: Record<string, unknown> = { ...manifest }
    delete raw.license
    delete raw.runtime
    delete raw.engine
    delete raw.author
    const file = makePackage({ ...validFiles(), 'widget.json': JSON.stringify(raw) })
    const result = installPackage(file, join(root, 'components'))
    expect(result.ok).toBe(true)
    expect(result.widget?.author).toBe('unknown')
  })

  it('rejects path traversal entries', () => {
    const file = makePackage({ ...validFiles(), '../evil.txt': 'x' })
    const result = installPackage(file, join(root, 'components'))
    expect(result.ok).toBe(false)
  })

  it('accepts arbitrary template markup and CSS', () => {
    const file = makePackage({
      ...validFiles(),
      'ui/index.html':
        '<svg viewBox="0 0 8 8"><circle cx="4" cy="4" r="3" /></svg>' +
        '<div style="color: red" onclick="void 0">x</div><script>void 0</script>',
      'ui/style.css':
        '@import "x"; .ring { background: url(x); mask: radial-gradient(#000, transparent) }'
    })
    expect(installPackage(file, join(root, 'components')).ok).toBe(true)
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

  it('reports folders that cannot load', () => {
    const components = join(root, 'components')
    const skins = join(root, 'skins')
    const good = join(components, 'com.example.clock@1.0.0')
    mkdirSync(join(good, 'ui'), { recursive: true })
    writeFileSync(join(good, 'widget.json'), JSON.stringify(manifest))
    writeFileSync(join(good, 'ui/index.html'), html)

    mkdirSync(join(skins, 'broken'), { recursive: true })
    writeFileSync(join(skins, 'broken', 'widget.json'), '{ not json')
    mkdirSync(join(skins, 'noindex'), { recursive: true })
    writeFileSync(
      join(skins, 'noindex', 'widget.json'),
      JSON.stringify({ ...manifest, id: 'noindex' })
    )

    const diag = getComponentDiagnostics(components, skins)
    expect(diag.installed).toBe(1)
    expect(diag.skins).toBe(2)
    expect(diag.problems.map((item) => item.folder).sort()).toEqual(['broken', 'noindex'])
    expect(diag.problems.find((item) => item.folder === 'broken')?.error).toContain('JSON')
    expect(diag.problems.find((item) => item.folder === 'noindex')?.error).toContain(
      'ui/index.html'
    )
    expect(diag.problems.every((item) => item.source === 'skins')).toBe(true)
  })
})
