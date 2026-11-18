#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import AdmZip from 'adm-zip'

const BASE_FILES = ['widget.json', 'ui/index.html', 'ui/style.css']
const WEB_FILES = [...BASE_FILES, 'ui/main.js']
const MAX_FILE = 1024 * 1024
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

  validate <dir>              校验组件
  pack <dir> [-o file]        打成 .sill
  new <id> [dir] [--template] 生成组件（默认 web/trusted）
  dev <dir>                   用 SILL_DEV_WIDGET 启动 Sill

示例：
  sill new com.example.clock
  sill dev ./com.example.clock
  sill pack ./com.example.clock -o clock.sill`)
}

function fail(message) {
  console.error(`sill: ${message}`)
  process.exitCode = 1
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

function allowedFiles(kind) {
  return kind === 'web' ? WEB_FILES : BASE_FILES
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
  const kind = raw.type === 'web' ? 'web' : raw.type === 'template' ? 'template' : ''
  const trust = kind === 'web' && raw.trust === 'trusted' ? 'trusted' : 'sandboxed'
  const permissions = Array.isArray(raw.permissions) ? raw.permissions : []
  const span = Number(raw.span?.default)

  if (raw.schema !== 1) errors.push('schema 必须是 1')
  if (!ID.test(id)) errors.push('id 至少两段，只能用小写字母、数字、点和短横线')
  if (!name || name.length > 24) errors.push('name 必须 1–24 字')
  if (!SEMVER.test(version)) errors.push('version 必须是 semver')
  if (!author) errors.push('author 不能为空')
  if (!license) errors.push('license 不能为空')
  if (!runtime) errors.push('runtime 不能为空')
  if (!engine) errors.push('engine 不能为空')
  if (!kind) errors.push('type 必须是 template 或 web')
  if (raw.ui !== 'ui/index.html') errors.push('ui 必须是 ui/index.html')
  if (!Number.isFinite(span) || span < 1 || span > 3) errors.push('span.default 必须在 1–3')
  if (!Array.isArray(raw.permissions)) errors.push('permissions 必须是数组')
  for (const permission of permissions) {
    if (!PERMISSIONS.has(permission)) errors.push(`未知权限 ${permission}`)
  }
  if (raw.data !== undefined && !Array.isArray(raw.data)) errors.push('data 必须是数组')
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

  const files = allowedFiles(kind)
  const allowed = new Set([...files, 'README.md'])
  const walk = (current) => {
    for (const entry of readdirSync(current)) {
      const file = join(current, entry)
      const relative = file.slice(root.length + 1).replace(/\\/g, '/')
      if (statSync(file).isDirectory()) {
        walk(file)
      } else if (!allowed.has(relative)) {
        errors.push(`不允许的文件：${relative}`)
      }
    }
  }
  walk(root)

  for (const relative of files) {
    const file = join(root, relative)
    if (!existsSync(file)) {
      errors.push(`缺少 ${relative}`)
      continue
    }
    if (!statSync(file).isFile()) {
      errors.push(`${relative} 不是文件`)
      continue
    }
    if (statSync(file).size > MAX_FILE) errors.push(`${relative} 超过 1 MB`)
  }

  if (kind === 'template') {
    const htmlPath = join(root, 'ui/index.html')
    const cssPath = join(root, 'ui/style.css')
    if (existsSync(htmlPath)) {
      const html = readFileSync(htmlPath, 'utf8')
      if (/<script\b/i.test(html)) errors.push('HTML 不能包含 <script>')
      if (/\son\w+\s*=/i.test(html)) errors.push('HTML 不能包含 on* 属性')
      if (/\sstyle\s*=/i.test(html)) errors.push('HTML 不能包含 style 属性')
      if (/\b(href|src)\s*=/i.test(html)) errors.push('HTML 不能包含 href / src')
    }
    if (existsSync(cssPath)) {
      const css = readFileSync(cssPath, 'utf8')
      if (/@import/i.test(css)) errors.push('CSS 不能包含 @import')
      if (/url\s*\(/i.test(css)) errors.push('CSS 不能包含 url()')
      if (/expression\s*\(/i.test(css)) errors.push('CSS 不能包含 expression()')
    }
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
  const kind = manifest.type === 'web' ? 'web' : 'template'
  const target = resolve(out || `${manifest.id}-${manifest.version}.sill`)
  const zip = new AdmZip()
  for (const relative of allowedFiles(kind)) {
    zip.addFile(relative, readFileSync(join(root, relative)))
  }
  zip.writeZip(target)
  console.log(target)
}

function newWidget(id, dir, template) {
  if (!ID.test(id)) return fail('id 至少两段，只能用小写字母、数字、点和短横线')
  const target = resolve(dir || id)
  if (existsSync(target)) return fail(`目录已存在：${target}`)
  mkdirSync(join(target, 'ui'), { recursive: true })
  const name = id.split('.').pop().replace(/-/g, ' ')
  const web = !template
  const manifest = {
    schema: 1,
    id,
    name,
    version: '1.0.0',
    author: 'you',
    license: 'MIT',
    runtime: '>=0.5.4',
    engine: '>=0.1.0',
    type: web ? 'web' : 'template',
    ...(web ? { trust: 'trusted', size: { w: 384, h: 180 } } : {}),
    span: { default: 1 },
    permissions: ['data.time'],
    data: [{ id: 'now', source: 'time.now' }],
    ui: 'ui/index.html'
  }
  writeFileSync(join(target, 'widget.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  writeFileSync(
    join(target, 'ui/index.html'),
    web
      ? '<div class="widget">\n  <div class="widget__label">HELLO</div>\n  <div class="widget__host" id="host">—</div>\n  <div class="widget__time" id="time">--:--</div>\n</div>\n'
      : '<div class="widget">\n  <div class="widget__label">HELLO</div>\n  <div class="widget__time" data-sill-text="now.time">--:--</div>\n</div>\n'
  )
  writeFileSync(
    join(target, 'ui/style.css'),
    ':host { display: block; }\n\n.widget {\n  color: var(--ink);\n}\n\n.widget__label {\n  color: var(--ink-faint);\n  font-size: 10px;\n  letter-spacing: 0.17em;\n}\n\n.widget__time {\n  font-family: var(--serif);\n  font-size: 44px;\n  font-style: italic;\n}\n'
  )
  if (web) {
    writeFileSync(
      join(target, 'ui/main.js'),
      "const os = require('node:os')\n\ndocument.querySelector('#host').textContent = os.hostname()\n\nsill.ready(({ data }) => {\n  document.querySelector('#time').textContent = data.now?.time ?? '--:--'\n})\n"
    )
  }
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
    const dir = args.find((arg) => !arg.startsWith('-') && arg !== '-o' && arg !== '--out')
    if (!dir) return fail('缺少目录')
    const outIndex = args.findIndex((arg) => arg === '-o' || arg === '--out')
    const out = outIndex >= 0 ? args[outIndex + 1] : undefined
    if (outIndex >= 0 && !out) return fail('-o 需要文件路径')
    pack(dir, out)
    return
  }

  if (command === 'new') {
    const template = args.includes('--template')
    const positional = args.filter((arg) => !arg.startsWith('-'))
    if (!positional[0]) return fail('缺少 id')
    newWidget(positional[0], positional[1], template)
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
