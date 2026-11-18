#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import AdmZip from 'adm-zip'

const FILES = ['widget.json', 'ui/index.html', 'ui/style.css']
const MAX_FILE = 512 * 1024
const PERMISSIONS = new Set([
  'data.time',
  'data.system',
  'data.media',
  'data.weather',
  'data.todo',
  'action.media',
  'action.todo'
])
const ID = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/

function usage() {
  console.log(`sill <command>

  validate <dir>          校验 template 组件
  pack <dir> [-o file]    打成 .sill
  new <id> [dir]          生成最小组件
  dev <dir>               用 SILL_DEV_WIDGET 启动 Sill

示例：
  sill validate ./my-widget
  sill pack ./my-widget -o my-widget.sill
  sill new com.example.clock
  sill dev ./my-widget`)
}

function fail(message) {
  console.error(`sill: ${message}`)
  process.exitCode = 1
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

function validateDir(dir) {
  const root = resolve(dir)
  const errors = []
  const widgetFile = join(root, 'widget.json')

  if (!existsSync(widgetFile)) return [`缺少 ${widgetFile}`]

  let raw
  try {
    raw = readJson(widgetFile)
  } catch {
    return ['widget.json 不是合法 JSON']
  }

  const id = typeof raw.id === 'string' ? raw.id : ''
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  const version = typeof raw.version === 'string' ? raw.version : ''
  const author = typeof raw.author === 'string' ? raw.author.trim() : ''
  const license = typeof raw.license === 'string' ? raw.license.trim() : ''
  const runtime = typeof raw.runtime === 'string' ? raw.runtime.trim() : ''
  const engine = typeof raw.engine === 'string' ? raw.engine.trim() : ''
  const permissions = Array.isArray(raw.permissions) ? raw.permissions : []
  const span = Number(raw.span?.default)
  if (!Array.isArray(raw.permissions)) errors.push('permissions 必须是数组')
  for (const permission of permissions) {
    if (!PERMISSIONS.has(permission)) errors.push(`未知权限 ${permission}`)
  }

  if (raw.schema !== 1) errors.push('schema 必须是 1')
  if (!ID.test(id)) errors.push('id 至少两段，只能用小写字母、数字、点和短横线')
  if (!name || name.length > 24) errors.push('name 必须 1–24 字')
  if (!SEMVER.test(version)) errors.push('version 必须是 semver')
  if (!author) errors.push('author 不能为空')
  if (!license) errors.push('license 不能为空')
  if (!runtime) errors.push('runtime 不能为空')
  if (!engine) errors.push('engine 不能为空')
  if (raw.type !== 'template') errors.push('type 必须是 template')
  if (raw.ui !== 'ui/index.html') errors.push('ui 必须是 ui/index.html')
  if (!Number.isFinite(span) || span < 1 || span > 3) errors.push('span.default 必须在 1–3')

  if (raw.data !== undefined && !Array.isArray(raw.data)) {
    errors.push('data 必须是数组')
  }
  if (raw.strings !== undefined) {
    if (!raw.strings || typeof raw.strings !== 'object' || Array.isArray(raw.strings)) {
      errors.push('strings 必须是对象')
    } else {
      for (const [language, table] of Object.entries(raw.strings)) {
        if (!table || typeof table !== 'object' || Array.isArray(table)) {
          errors.push(`strings.${language} 必须是对象`)
          continue
        }
        for (const [key, text] of Object.entries(table)) {
          if (typeof text !== 'string') errors.push(`strings.${language}.${key} 必须是字符串`)
        }
      }
    }
  }

  const allowed = new Set([...FILES, 'README.md'])
  const walk = (current) => {
    for (const name of readdirSync(current)) {
      const file = join(current, name)
      const relative = file.slice(root.length + 1).replace(/\\/g, '/')
      if (statSync(file).isDirectory()) {
        walk(file)
      } else if (!allowed.has(relative)) {
        errors.push(`不允许的文件：${relative}`)
      }
    }
  }
  walk(root)

  for (const relative of FILES) {
    const file = join(root, relative)
    if (!existsSync(file)) {
      errors.push(`缺少 ${relative}`)
      continue
    }
    if (!statSync(file).isFile()) {
      errors.push(`${relative} 不是文件`)
      continue
    }
    if (statSync(file).size > MAX_FILE) errors.push(`${relative} 超过 512 KB`)
  }

  const htmlFile = join(root, 'ui/index.html')
  const cssFile = join(root, 'ui/style.css')
  if (existsSync(htmlFile)) {
    const html = readFileSync(htmlFile, 'utf8')
    if (/<script\b/i.test(html)) errors.push('HTML 不能包含 <script>')
    if (/\son\w+\s*=/i.test(html)) errors.push('HTML 不能包含 on* 属性')
    if (/\sstyle\s*=/i.test(html)) errors.push('HTML 不能包含 style 属性')
    if (/\b(href|src)\s*=/i.test(html)) errors.push('HTML 不能包含 href / src')
  }
  if (existsSync(cssFile)) {
    const css = readFileSync(cssFile, 'utf8')
    if (/@import/i.test(css)) errors.push('CSS 不能包含 @import')
    if (/url\s*\(/i.test(css)) errors.push('CSS 不能包含 url()')
    if (/expression\s*\(/i.test(css)) errors.push('CSS 不能包含 expression()')
  }

  return errors
}

function readManifest(dir) {
  return readJson(join(resolve(dir), 'widget.json'))
}

function pack(dir, out) {
  const root = resolve(dir)
  const errors = validateDir(root)
  if (errors.length) {
    for (const error of errors) console.error(`  ${error}`)
    return fail('校验失败，未打包')
  }
  const manifest = readManifest(root)
  const target = resolve(out || `${manifest.id}-${manifest.version}.sill`)
  const zip = new AdmZip()
  for (const relative of FILES) {
    zip.addFile(relative, readFileSync(join(root, relative)))
  }
  zip.writeZip(target)
  console.log(target)
}

function newWidget(id, dir) {
  if (!ID.test(id)) return fail('id 至少两段，只能用小写字母、数字、点和短横线')
  const target = resolve(dir || id)
  if (existsSync(target)) return fail(`目录已存在：${target}`)
  mkdirSync(join(target, 'ui'), { recursive: true })
  const name = id.split('.').pop().replace(/-/g, ' ')
  const manifest = {
    schema: 1,
    id,
    name,
    version: '1.0.0',
    author: 'you',
    license: 'MIT',
    runtime: '>=0.5.4',
    engine: '>=0.1.0',
    type: 'template',
    span: { default: 1 },
    permissions: [],
    data: [],
    ui: 'ui/index.html'
  }
  writeFileSync(join(target, 'widget.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  writeFileSync(
    join(target, 'ui/index.html'),
    '<div class="widget">\n  <div class="widget__label">HELLO</div>\n</div>\n'
  )
  writeFileSync(
    join(target, 'ui/style.css'),
    ':host { display: block; }\n\n.widget__label {\n  color: var(--ink-faint);\n  font-size: 10px;\n  letter-spacing: 0.17em;\n}\n'
  )
  console.log(target)
}

function dev(dir) {
  const root = resolve(dir)
  const errors = validateDir(root)
  if (errors.length) {
    for (const error of errors) console.error(`  ${error}`)
    return fail('校验失败，未启动')
  }
  const sillRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
  const child = spawn('pnpm', ['dev'], {
    cwd: sillRoot,
    env: { ...process.env, SILL_DEV_WIDGET: root },
    stdio: 'inherit',
    shell: process.platform === 'win32'
  })
  child.on('exit', (code) => {
    process.exitCode = code ?? 0
  })
}

function main() {
  const [command, ...args] = process.argv.slice(2)
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    usage()
    return
  }

  if (command === 'validate') {
    if (!args[0]) return fail('缺少目录')
    const errors = validateDir(args[0])
    if (errors.length) {
      for (const error of errors) console.error(`  ${error}`)
      return fail('校验失败')
    }
    console.log('ok')
    return
  }

  if (command === 'pack') {
    if (!args[0]) return fail('缺少目录')
    const outIndex = args.findIndex((arg) => arg === '-o' || arg === '--out')
    const out = outIndex >= 0 ? args[outIndex + 1] : undefined
    if (outIndex >= 0 && !out) return fail('-o 需要文件路径')
    pack(args[0], out)
    return
  }

  if (command === 'new') {
    if (!args[0]) return fail('缺少 id')
    newWidget(args[0], args[1])
    return
  }

  if (command === 'dev') {
    if (!args[0]) return fail('缺少目录')
    dev(args[0])
    return
  }

  usage()
  process.exitCode = 1
}

main()
