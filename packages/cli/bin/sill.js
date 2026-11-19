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

function newWidget(id, dir, web) {
  if (!ID.test(id) || id.length < 2) {
    return fail('id 只能用小写字母、数字、点、下划线、短横线；例如 "clock" 或 "com.you.clock"')
  }
  const target = resolve(dir || id)
  if (existsSync(target)) return fail(`目录已存在：${target}`)
  mkdirSync(join(target, 'ui'), { recursive: true })
  const name = id.split('.').pop().replace(/[-_]/g, ' ').replace(/^./, (c) => c.toUpperCase())

  const manifest = {
    schema: 1,
    id,
    name,
    version: '1.0.0',
    author: 'you',
    type: web ? 'web' : 'template',
    ...(web ? { trust: 'trusted' } : {}),
    size: { w: 384, h: 190 },
    span: { default: 1 },
    permissions: ['data.time'],
    data: [{ id: 'now', source: 'time.now' }],
    strings: {
      en: { title: 'LOCAL TIME', hint: 'hello from Sill' },
      zh: { title: '本地时间', hint: '来自 Sill 的问候' }
    },
    ui: 'ui/index.html'
  }

  const html = [
    '<div class="widget">',
    '  <header class="widget__head">',
    '    <span class="widget__title" data-sill-i18n="title">LOCAL TIME</span>',
    '    <span class="widget__dot" aria-hidden="true"></span>',
    '  </header>',
    '',
    '  <div class="widget__hero">',
    '    <span class="widget__time" id="time">--:--</span>',
    '    <span class="widget__date" id="date"></span>',
    '  </div>',
    '',
    '  <footer class="widget__foot">',
    '    <span class="widget__hint" data-sill-i18n="hint">hello from Sill</span>',
    '    <button class="widget__pill" id="counter" type="button">0</button>',
    '  </footer>',
    '</div>',
    ''
  ].join('\n')

  const css = [
    ':host { display: block; }',
    '',
    '.widget {',
    '  display: flex;',
    '  flex-direction: column;',
    '  gap: 10px;',
    '  color: var(--ink);',
    '  font-family: var(--sans);',
    '}',
    '',
    '.widget__head {',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: space-between;',
    '}',
    '',
    '.widget__title {',
    '  color: var(--ink-faint);',
    '  font-size: 10px;',
    '  letter-spacing: 0.18em;',
    '  text-transform: uppercase;',
    '}',
    '',
    '.widget__dot {',
    '  width: 6px;',
    '  height: 6px;',
    '  border-radius: 999px;',
    '  background: var(--accent);',
    '  box-shadow: 0 0 10px var(--accent-glow, var(--accent));',
    '}',
    '',
    '.widget__hero {',
    '  display: flex;',
    '  align-items: baseline;',
    '  gap: 10px;',
    '}',
    '',
    '.widget__time {',
    '  font-family: var(--serif);',
    '  font-size: 46px;',
    '  font-style: italic;',
    '  line-height: 1;',
    '  font-variant-numeric: tabular-nums;',
    '  letter-spacing: -0.02em;',
    '}',
    '',
    '.widget__date {',
    '  color: var(--ink-dim);',
    '  font-size: 12px;',
    '}',
    '',
    '.widget__foot {',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: space-between;',
    '  padding-top: 8px;',
    '  border-top: 1px solid rgba(255, 255, 255, 0.08);',
    '}',
    '',
    '.widget__hint {',
    '  color: var(--ink-faint);',
    '  font-size: 11px;',
    '}',
    '',
    '.widget__pill {',
    '  appearance: none;',
    '  border: 1px solid rgba(255, 255, 255, 0.14);',
    '  background: rgba(255, 255, 255, 0.06);',
    '  color: var(--ink-soft);',
    '  border-radius: 999px;',
    '  padding: 3px 10px;',
    '  font: inherit;',
    '  font-size: 11px;',
    '  cursor: pointer;',
    '  transition: background 160ms var(--ease-out), color 160ms var(--ease-out);',
    '}',
    '',
    '.widget__pill:hover {',
    '  background: var(--accent-soft);',
    '  color: var(--accent-ink, #fff);',
    '}',
    '',
    '.widget__pill:focus-visible {',
    '  outline: 2px solid var(--accent);',
    '  outline-offset: 2px;',
    '}',
    ''
  ].join('\n')

  const templateJs = [
    '// ui/main.js 在面板页面里执行一次。宿主注入两个参数：',
    '//   sill —— 数据 / 存储 / 动作 / 生命周期',
    '//   root —— 这张卡的 shadow root',
    '// 保存文件会自动热重载；面板上按 F12 打开 DevTools 看 console。',
    '',
    'const timeEl = root.getElementById("time")',
    'const dateEl = root.getElementById("date")',
    'const counterEl = root.getElementById("counter")',
    '',
    '// 1) 数据：manifest 里 data[].id 就是这里的 key（示例是 now）',
    'sill.onData(({ data }) => {',
    '  if (timeEl) timeEl.textContent = data.now?.time ?? "--:--"',
    '  if (dateEl) dateEl.textContent = data.now?.dateLabel ?? ""',
    '})',
    '',
    '// 2) 私有存储：<userData>/widget-data/<id>.json',
    'let clicks = 0',
    'sill.storage.get().then((saved) => {',
    '  clicks = Number(saved.clicks) || 0',
    '  if (counterEl) counterEl.textContent = String(clicks)',
    '})',
    '',
    'counterEl?.addEventListener("click", () => {',
    '  clicks += 1',
    '  counterEl.textContent = String(clicks)',
    '  sill.storage.patch({ clicks })',
    '})',
    '',
    '// 3) 清理：卡片卸载或热重载前调用，定时器 / 监听写在这里',
    'const onResize = () => {',
    '  root.host?.toggleAttribute("data-narrow", (root.host?.clientWidth ?? 0) < 240)',
    '}',
    'window.addEventListener("resize", onResize)',
    'sill.onDispose(() => window.removeEventListener("resize", onResize))',
    ''
  ].join('\n')

  const webJs = [
    '// web 组件在独立 guest 里运行，trust: trusted 时可以直接用 Node。',
    'const os = require("node:os")',
    '',
    'sill.ready(({ data }) => {',
    '  document.getElementById("time").textContent = data.now?.time ?? "--:--"',
    '  document.getElementById("date").textContent = os.hostname()',
    '})',
    ''
  ].join('\n')

  const readme = [
    '# ' + name,
    '',
    'Sill 组件。开发三步：',
    '',
    '1. 把这个文件夹放进 `%APPDATA%\\Sill\\skins\\`（便携版是 `Sill-data\\skins\\`）。',
    '2. 打开 Sill → 设置 → 组件 → 打开组件文件夹；保存文件会自动刷新。',
    '3. 做好了打包：`sill pack`，然后双击 `.sill` 安装。',
    '',
    '## 文件',
    '',
    '| 文件 | 作用 |',
    '| --- | --- |',
    '| `widget.json` | 元数据、数据绑定、权限提示 |',
    '| `ui/index.html` | 结构（就是普通 HTML） |',
    '| `ui/style.css` | 样式（普通 CSS，可用主题变量） |',
    '| `ui/main.js` | 可选逻辑（普通 JS，宿主注入 `sill` / `root`） |',
    '| `ui/assets/**` | 图片 / 字体，HTML 里直接写 `assets/x.png` |',
    '',
    '调试：面板上按 `F12` 打开 DevTools；`main.js` 抛错会在卡里显示。',
    '完整文档：https://github.com/Enkrid-Rao/sill-components/blob/main/docs/authoring.md',
    ''
  ].join('\n')

  const types = [
    '// 可选：放进项目根目录，编辑器会给 ui/main.js 里的 sill / root 补全。',
    'declare const root: ShadowRoot',
    'declare const sill: {',
    '  id: string',
    '  root: ShadowRoot',
    '  host: unknown',
    '  data: () => Record<string, unknown>',
    '  onData: (callback: (payload: {',
    '    data: Record<string, unknown>',
    '    language: string',
    '    tokens: Record<string, string>',
    '  }) => void) => void',
    '  onDispose: (callback: () => void) => void',
    '  command: (action: string, arg?: unknown) => void',
    '  storage: {',
    '    get: () => Promise<Record<string, unknown>>',
    '    set: (value: unknown) => Promise<Record<string, unknown>>',
    '    patch: (value: Record<string, unknown>) => Promise<Record<string, unknown>>',
    '  }',
    '}',
    ''
  ].join('\n')

  writeFileSync(join(target, 'widget.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  writeFileSync(join(target, 'ui/index.html'), html)
  writeFileSync(join(target, 'ui/style.css'), css)
  writeFileSync(join(target, 'ui/main.js'), web ? webJs : templateJs)
  writeFileSync(join(target, 'README.md'), readme)
  writeFileSync(join(target, 'ui/sill.d.ts'), types)
  console.log(target)
  console.log('')
  console.log('下一步：')
  console.log(`  1. 把这个文件夹放进 skins 目录（设置 → 组件 → 打开组件文件夹）`)
  console.log(`  2. 保存文件即热重载；面板上按 F12 看 console`)
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
