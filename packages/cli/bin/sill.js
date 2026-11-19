#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import AdmZip from 'adm-zip'

const MAX_FILE = 20 * 1024 * 1024
// 与宿主安装器同一套规则：根目录少量元数据 + ui/ 下的任意文件。
const ROOT_FILES = new Set(['widget.json', 'README.md', 'LICENSE', 'LICENSE.txt', 'NOTICE'])
const SKIP_DIRS = new Set(['.git', 'node_modules', '.vscode', '.idea', '.dev'])
const ID = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/

function isAllowedFile(relative) {
  return ROOT_FILES.has(relative) || relative.startsWith('ui/')
}

function usage() {
  console.log(`sill <command>

  new <id> [dir] [--web]    生成组件（默认 template，可直接双击打开开发）
  validate [dir]            校验组件目录（缺省当前目录）
  pack [dir] [-o file]      打包成 .sill，只包含合法文件
  dev <dir>                 用独立开发数据启动 Sill 预览（也可直接把目录放进 skins）

示例：
  sill new clock
  sill validate ./clock
  sill pack ./clock -o clock.sill

环境变量：
  SILL_EXE                  便携版 Sill.exe（dev 用）
  SILL_DEV_DATA             开发 userData（默认 %APPDATA%\\Sill-dev）`)
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
  const kind = raw.type === 'web' ? 'web' : raw.type === 'template' ? 'template' : ''
  const span = Number(raw.span?.default)

  if (raw.schema !== 1) errors.push('schema 必须是 1（顶层写 "schema": 1）')
  if (!ID.test(id) || id.length < 2 || id.length > 64) {
    errors.push('id 只能用小写字母、数字、点、下划线、短横线；例如 "clock" 或 "com.you.clock"')
  }
  if (!name) errors.push('name 不能为空（显示在组件列表里）')
  if (!SEMVER.test(version)) errors.push('version 必须是 semver，例如 1.0.0')
  if (!kind) errors.push('type 必须是 "template" 或 "web"')
  if (raw.ui !== 'ui/index.html') errors.push('ui 必须是 "ui/index.html"')
  // span 可省略，缺省 1；写了就必须在 1–3。
  if (raw.span !== undefined) {
    if (!Number.isFinite(span) || span < 1 || span > 3) errors.push('span.default 必须在 1–3')
  }
  if (raw.permissions !== undefined && !Array.isArray(raw.permissions)) {
    errors.push('permissions 必须是数组')
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

  const walk = (current) => {
    for (const entry of readdirSync(current)) {
      if (SKIP_DIRS.has(entry)) continue
      const file = join(current, entry)
      const relative = file.slice(root.length + 1).replace(/\\/g, '/')
      if (statSync(file).isDirectory()) {
        walk(file)
      } else if (relative.endsWith('.sill') && !relative.includes('/')) {
        // 允许把打包产物放在项目根目录；它不会进 .sill。
        continue
      } else if (!isAllowedFile(relative)) {
        errors.push(`不允许的文件：${relative}（只允许 widget.json、README/LICENSE，和 ui/ 下的文件）`)
      }
    }
  }
  walk(root)

  const required = ['widget.json', 'ui/index.html']
  if (kind === 'web') required.push('ui/main.js')
  for (const relative of required) {
    const file = join(root, relative)
    if (!existsSync(file)) {
      errors.push(`缺少 ${relative}`)
      continue
    }
    if (!statSync(file).isFile()) {
      errors.push(`${relative} 不是文件`)
      continue
    }
    if (statSync(file).size > MAX_FILE) errors.push(`${relative} 超过 20 MB`)
  }

  return errors
}

function readManifest(dir) {
  return readJson(join(resolve(dir), 'widget.json'))
}

function collectPackageFiles(root) {
  const files = []
  const walk = (current) => {
    for (const entry of readdirSync(current)) {
      if (SKIP_DIRS.has(entry)) continue
      const file = join(current, entry)
      const relative = file.slice(root.length + 1).replace(/\\/g, '/')
      if (statSync(file).isDirectory()) {
        walk(file)
        continue
      }
      if (relative.endsWith('.sill')) continue
      if (isAllowedFile(relative)) files.push(relative)
    }
  }
  walk(root)
  return files
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
  for (const relative of collectPackageFiles(root)) {
    zip.addFile(relative, readFileSync(join(root, relative)))
  }
  zip.writeZip(target)
  console.log(target)
}

function templateRoot() {
  return join(dirname(fileURLToPath(import.meta.url)), '..', 'templates')
}

function applyPlaceholders(text, id, name) {
  return text.replace(/\{\{id\}\}/g, id).replace(/\{\{name\}\}/g, name)
}

/** 模板目录和宿主共用：packages/cli/templates/<kind>/；新增文件不用改代码。 */
function copyTemplate(kind, target, id, name) {
  const source = join(templateRoot(), kind)
  if (!existsSync(source)) return false
  const walk = (current, relative) => {
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
  return true
}

function newWidget(id, dir, web) {
  if (!ID.test(id) || id.length < 2) {
    return fail('id 只能用小写字母、数字、点、下划线、短横线；例如 "clock" 或 "com.you.clock"')
  }
  const target = resolve(dir || id)
  if (existsSync(target)) return fail(`目录已存在：${target}`)
  const kind = web ? 'web' : 'template'
  const name = id.split('.').pop().replace(/[-_]/g, ' ').replace(/^./, (c) => c.toUpperCase())

  mkdirSync(target, { recursive: true })
  if (!copyTemplate(kind, target, id, name)) {
    return fail(`找不到模板目录：${join(templateRoot(), kind)}`)
  }

  console.log(target)
  console.log('')
  console.log('下一步：')
  console.log('  1. 把这个文件夹放进 skins 目录（设置 → 组件 → 打开组件文件夹）')
  console.log('  2. 保存文件即热重载；面板上按 F12 看 console')
  console.log(`  3. 打包：sill pack "${target}"`)
}

function findSillExe() {
  const explicit = process.env.SILL_EXE?.trim()
  if (explicit && existsSync(explicit)) return explicit
  const candidates = []
  if (process.env.LOCALAPPDATA) {
    candidates.push(join(process.env.LOCALAPPDATA, 'Programs', 'Sill', 'Sill.exe'))
  }
  if (process.env.ProgramFiles) {
    candidates.push(join(process.env.ProgramFiles, 'Sill', 'Sill.exe'))
  }
  if (process.env['ProgramFiles(x86)']) {
    candidates.push(join(process.env['ProgramFiles(x86)'], 'Sill', 'Sill.exe'))
  }
  candidates.push(join(homedir(), 'AppData', 'Local', 'Programs', 'Sill', 'Sill.exe'))
  return candidates.find((path) => existsSync(path)) ?? null
}

function devData() {
  const explicit = process.env.SILL_DEV_DATA?.trim()
  if (explicit) return explicit
  return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'Sill-dev')
}

function dev(dir) {
  const root = resolve(dir)
  const errors = validateDir(root)
  if (errors.length) {
    for (const error of errors) console.error(`  ${error}`)
    return fail('校验失败，未启动')
  }

  const data = devData()
  mkdirSync(data, { recursive: true })
  const baseEnv = { ...process.env }
  delete baseEnv.ELECTRON_RUN_AS_NODE
  const exe = findSillExe()
  if (exe) {
    console.log(`sill: dev ${root}`)
    console.log(`sill: Sill ${exe}`)
    console.log(`sill: data ${data}`)
    const child = spawn(exe, [], {
      env: {
        ...baseEnv,
        SILL_DEV_WIDGET: root,
        SILL_USER_DATA: data,
        SILL_DEV: '1'
      },
      stdio: 'inherit'
    })
    child.on('exit', (code) => {
      process.exitCode = code ?? 0
    })
    return
  }

  const sillRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
  if (!existsSync(join(sillRoot, 'package.json'))) {
    return fail('没有找到 Sill.exe。安装 Sill，或设置 SILL_EXE 指向便携版 Sill.exe。')
  }
  console.log('sill: 没有找到已安装的 Sill，回退到源码 pnpm dev')
  const child = spawn('pnpm', ['dev'], {
    cwd: sillRoot,
    env: { ...baseEnv, SILL_DEV_WIDGET: root, SILL_USER_DATA: data, SILL_DEV: '1' },
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
    const dir = args[0] && !args[0].startsWith('-') ? args[0] : process.cwd()
    const errors = validateDir(dir)
    if (errors.length) {
      for (const error of errors) console.error(`  ${error}`)
      return fail('校验失败')
    }
    console.log('ok')
    return
  }

  if (command === 'pack') {
    let dir = process.cwd()
    for (let index = 0; index < args.length; index += 1) {
      const arg = args[index]
      if (arg === '-o' || arg === '--out') {
        index += 1
        continue
      }
      if (!arg.startsWith('-')) {
        dir = arg
        break
      }
    }
    const outIndex = args.findIndex((arg) => arg === '-o' || arg === '--out')
    const out = outIndex >= 0 ? args[outIndex + 1] : undefined
    if (outIndex >= 0 && !out) return fail('-o 需要文件路径')
    pack(dir, out)
    return
  }

  if (command === 'new') {
    const web = args.includes('--web')
    const positional = args.filter((arg) => !arg.startsWith('-'))
    if (!positional[0]) return fail('缺少 id')
    newWidget(positional[0], positional[1], web)
    return
  }

  if (command === 'dev') {
    const dir = args[0] && !args[0].startsWith('-') ? args[0] : process.cwd()
    dev(dir)
    return
  }

  usage()
  process.exitCode = 1
}

main()
