import { useLayoutEffect, useRef } from 'react'
import type { DevWidgetPayload } from '../../../shared/dev-widget'
import { readTokens } from '../lib/tokens'
import { runWidgetAction } from '../widgets/actions'
import { buildProviderData } from '../widgets/providers'
import type { WidgetContext } from '../widgets/types'

interface Props {
  widget: DevWidgetPayload
  context: WidgetContext
}

/**
 * 模板组件：HTML / CSS / 可选 JS，直接挂在 `.card` 的 Shadow DOM 里。
 *
 * 没有标签白名单，也没有字符串清洗。`<script>` 标签仍然不会执行（innerHTML 规则），
 * 想写 JS 就放到 `ui/main.js`：宿主把它作为宿主页面里的一段脚本执行，并注入一个
 * 小的 `sill` 对象（data / onData / command / storage）。
 *
 * 数据更新是增量的：首次挂载建一次 DOM，之后只改文本、CSS 变量和可见性。
 * CSS transition / @keyframes 因此可以跨采样继续。
 */

type Scopes = WeakMap<Element, unknown>

interface ListState {
  keys: string[]
  rows: HTMLElement[]
}

interface InlinePayload {
  data: Record<string, unknown>
  language: string
  tokens: Record<string, string>
}

interface InlineApi {
  id: string
  root: ShadowRoot
  host: unknown
  data: () => Record<string, unknown>
  onData: (callback: (payload: InlinePayload) => void) => void
  /** 卡片被卸载 / 热重载前调用，用来清掉 main.js 起的定时器与监听。 */
  onDispose: (callback: () => void) => void
  command: (action: string, arg?: unknown) => void
  storage: {
    get: () => Promise<Record<string, unknown>>
    set: (value: unknown) => Promise<Record<string, unknown>>
    patch: (value: Record<string, unknown>) => Promise<Record<string, unknown>>
  }
  settings: {
    get: () => Promise<Record<string, unknown>>
    set: (patch: Record<string, unknown>) => Promise<Record<string, unknown>>
    onChange: (callback: (values: Record<string, unknown>) => void) => () => void
  }
}

/** 每个列表容器的行模板（outerHTML，已去掉 repeat 属性）。 */
const listTemplates = new WeakMap<Element, string>()
/** 每个列表容器上一次的行 key 与行元素。 */
const listStates = new WeakMap<Element, ListState>()

const MAX_REPEAT_PASSES = 8
const ASSET_SCHEME = 'sill-asset'

function readPath(data: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => {
    if (!value || typeof value !== 'object') return undefined
    return (value as Record<string, unknown>)[key]
  }, data)
}

function scopeFor(node: Element, scopes: Scopes): unknown {
  let current: Element | null = node
  while (current) {
    if (scopes.has(current)) return scopes.get(current)
    current = current.parentElement
  }
  return undefined
}

function resolve(
  node: Element,
  path: string,
  data: Record<string, unknown>,
  scopes: Scopes
): unknown {
  if (path === 'item') return scopeFor(node, scopes)
  if (path.startsWith('item.')) {
    const scope = scopeFor(node, scopes)
    return scope && typeof scope === 'object'
      ? readPath(scope, path.slice('item.'.length))
      : undefined
  }
  return readPath(data, path)
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10)
  }
  if (typeof value === 'object') return '—'
  return String(value)
}

function keyOf(item: unknown, index: number): string {
  if (item && typeof item === 'object' && 'id' in item) {
    return String((item as Record<string, unknown>).id)
  }
  return `#${index}`
}

// ---------- 包内资源 ----------

function isRelativeRef(value: string): boolean {
  return value !== '' && !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#|\/)/i.test(value)
}

function assetUrl(id: string, value: string): string {
  return new URL(value, `${ASSET_SCHEME}://${id}/ui/`).toString()
}

/** <img src="assets/x.png"> → sill-asset://<id>/ui/assets/x.png */
function rewriteAssets(root: ParentNode, id: string): void {
  for (const node of root.querySelectorAll<HTMLElement>('[src], [href], [poster]')) {
    for (const attribute of ['src', 'href', 'poster']) {
      const raw = node.getAttribute(attribute)
      if (raw && isRelativeRef(raw)) node.setAttribute(attribute, assetUrl(id, raw))
    }
  }
}

/** url(bg.png) → url("sill-asset://<id>/ui/bg.png")；data:/http:/var() 原样保留 */
function rewriteCss(css: string, id: string): string {
  return css.replace(
    /url\(\s*(['"]?)([^)'"]*)\1\s*\)/gi,
    (match: string, _quote: string, raw: string) => {
      const value = raw.trim()
      if (!value || value.startsWith('var(') || !isRelativeRef(value)) return match
      return `url("${assetUrl(id, value)}")`
    }
  )
}

// ---------- 列表 / 条件 / 绑定 ----------

/** 把带 data-sill-repeat 的节点换成列表容器，并记住行模板。 */
function mountLists(container: ParentNode): void {
  const nodes = [...container.querySelectorAll<HTMLElement>('[data-sill-repeat]')]
  if (container instanceof Element && container.hasAttribute('data-sill-repeat')) {
    nodes.unshift(container as HTMLElement)
  }
  for (const node of nodes) {
    const path = node.getAttribute('data-sill-repeat') ?? ''
    const list = document.createElement('div')
    list.setAttribute('data-sill-list', path)
    list.style.display = 'contents'
    const template = node.cloneNode(true) as HTMLElement
    template.removeAttribute('data-sill-repeat')
    listTemplates.set(list, template.outerHTML)
    node.replaceWith(list)
  }
}

/** 同步列表行；结构没变时只刷新作用域，不重建节点。返回是否重建过。 */
function syncLists(root: ParentNode, data: Record<string, unknown>, scopes: Scopes): boolean {
  let rebuilt = false
  for (const list of [...root.querySelectorAll<HTMLElement>('[data-sill-list]')]) {
    const path = list.getAttribute('data-sill-list') ?? ''
    const value = resolve(list, path, data, scopes)
    const items = Array.isArray(value) ? value : []
    const keys = items.map(keyOf)
    const state = listStates.get(list)

    if (
      state &&
      state.keys.length === keys.length &&
      state.keys.every((key, index) => key === keys[index])
    ) {
      state.rows.forEach((row, index) => scopes.set(row, items[index]))
      continue
    }

    const template = listTemplates.get(list)
    if (template === undefined) continue
    const holder = document.createElement('template')
    holder.innerHTML = template
    const rows: HTMLElement[] = []
    for (const item of items) {
      const row = holder.content.firstElementChild?.cloneNode(true) as HTMLElement | undefined
      if (!row) break
      scopes.set(row, item)
      rows.push(row)
    }
    list.replaceChildren(...rows)
    mountLists(list)
    listStates.set(list, { keys, rows })
    rebuilt = true
  }
  return rebuilt
}

function applyConditions(root: ParentNode, data: Record<string, unknown>, scopes: Scopes): void {
  for (const node of root.querySelectorAll<HTMLElement>('[data-sill-if]')) {
    const raw = node.getAttribute('data-sill-if') ?? ''
    const negate = raw.startsWith('!')
    const value = resolve(node, negate ? raw.slice(1) : raw, data, scopes)
    const visible = negate ? !value : Boolean(value)
    // 用 hidden 而不是删节点：重新出现时不用重建，过渡状态还在。
    // toggleAttribute 对 SVG 元素也有效（SVGElement 没有 hidden 属性）。
    const shouldHide = !visible
    if (node.hasAttribute('hidden') !== shouldHide) node.toggleAttribute('hidden', shouldHide)
  }
}

function translate(
  strings: Record<string, Record<string, string>>,
  language: string,
  key: string
): string {
  return strings[language]?.[key] ?? strings.en?.[key] ?? key
}

function applyBindings(
  root: ParentNode,
  data: Record<string, unknown>,
  scopes: Scopes,
  widget: DevWidgetPayload,
  language: string
): void {
  for (const node of root.querySelectorAll<HTMLElement>('[data-sill-text]')) {
    const next = formatValue(
      resolve(node, node.getAttribute('data-sill-text') ?? '', data, scopes)
    )
    if (node.textContent !== next) node.textContent = next
  }
  for (const node of root.querySelectorAll<HTMLElement>('[data-sill-i18n]')) {
    const next = translate(widget.strings, language, node.getAttribute('data-sill-i18n') ?? '')
    if (node.textContent !== next) node.textContent = next
  }
  for (const node of root.querySelectorAll<HTMLElement>('[data-sill-meter]')) {
    const value = Number(resolve(node, node.getAttribute('data-sill-meter') ?? '', data, scopes))
    if (Number.isFinite(value)) {
      const next = String(Math.max(0, Math.min(100, value)))
      if (node.style.getPropertyValue('--sill-value') !== next) {
        node.style.setProperty('--sill-value', next)
      }
    } else if (node.style.getPropertyValue('--sill-value')) {
      node.style.removeProperty('--sill-value')
    }
  }
}

function notifyInline(
  listeners: Set<(payload: InlinePayload) => void>,
  id: string,
  data: Record<string, unknown>,
  language: string,
  onError?: (error: unknown) => void
): void {
  if (!listeners.size) return
  const payload: InlinePayload = { data, language, tokens: readTokens() }
  for (const listener of listeners) {
    try {
      listener(payload)
    } catch (error) {
      console.error(`[sill] ${id} onData:`, error)
      onError?.(error)
    }
  }
}

/**
 * 组件 JS 失败时的卡内提示：不整块崩，只在这张卡里说清楚「谁、什么错、怎么看堆栈」。
 * 开发者不用打开 DevTools 就能知道第一层原因。
 */
function renderWidgetError(root: ShadowRoot, id: string, error: unknown): void {
  const detail =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : typeof error === 'string'
        ? error
        : JSON.stringify(error)
  const box = document.createElement('div')
  box.setAttribute('role', 'alert')
  box.style.cssText = [
    'margin:2px 0;padding:8px 10px;border-radius:10px',
    'background:rgba(255,96,96,.14)',
    'border:1px solid rgba(255,128,128,.38)',
    'color:#ffc3c3',
    'font:11.5px/1.55 var(--sans, system-ui, sans-serif)',
    'white-space:pre-wrap;word-break:break-word'
  ].join(';')
  const title = document.createElement('div')
  title.style.cssText = 'font-weight:600;margin-bottom:2px'
  title.textContent = `${id} failed`
  const body = document.createElement('div')
  body.textContent = detail
  const hint = document.createElement('div')
  hint.style.cssText = 'opacity:.72;margin-top:4px'
  hint.textContent = 'F12 opens DevTools · save the file in skins to reload'
  box.append(title, body, hint)
  root.appendChild(box)
}

export function TemplateWidget({ widget, context }: Props): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const clickBound = useRef(false)
  const contextRef = useRef(context)
  const dataRef = useRef<Record<string, unknown>>({})
  const scopesRef = useRef<Scopes>(new WeakMap())
  const permissionsRef = useRef<string[]>(widget.permissions)
  const inlineListeners = useRef(new Set<(payload: InlinePayload) => void>())
  const errorRef = useRef<((error: unknown) => void) | null>(null)
  contextRef.current = context
  permissionsRef.current = widget.permissions

  // 只在组件本身变化时重建 DOM（首次加载 / 热重载 / 保存文件）。
  useLayoutEffect(() => {
    const element = host.current
    if (!element) return
    const root = element.shadowRoot ?? element.attachShadow({ mode: 'open' })

    if (!clickBound.current) {
      root.addEventListener('click', (event) => {
        const target = event.target
        if (!(target instanceof Element)) return
        const actionNode = target.closest<HTMLElement>('[data-sill-action]')
        const action = actionNode?.getAttribute('data-sill-action')
        if (!actionNode || !action) return
        const argPath = actionNode.getAttribute('data-sill-action-arg')
        const arg = argPath
          ? resolve(actionNode, argPath, dataRef.current, scopesRef.current)
          : undefined
        runWidgetAction(action, arg, contextRef.current, permissionsRef.current)
      })
      clickBound.current = true
    }

    // CSS 用 textContent 注入：组件 CSS 里出现 `</style>` 也不会提前闭合样式表。
    const style = document.createElement('style')
    style.textContent = `:host{display:block;color:var(--ink);font-family:var(--sans)}[hidden]{display:none!important}${rewriteCss(widget.css, widget.id)}`
    root.replaceChildren(style)
    // 用 innerHTML 解析 HTML：<script> 仍然不会执行，想写 JS 请放 ui/main.js。
    const holder = document.createElement('div')
    holder.innerHTML = widget.html
    root.append(...holder.childNodes)
    rewriteAssets(root, widget.id)
    mountLists(root)

    const listeners = new Set<(payload: InlinePayload) => void>()
    inlineListeners.current = listeners
    const disposers: Array<() => void> = []
    let errorShown = false
    const reportError = (error: unknown): void => {
      console.error(`[sill] ${widget.id}:`, error)
      if (errorShown) return
      errorShown = true
      renderWidgetError(root, widget.id, error)
    }
    errorRef.current = reportError

    const cleanup = (): void => {
      for (const dispose of disposers) {
        try {
          dispose()
        } catch (error) {
          console.error(`[sill] ${widget.id} dispose:`, error)
        }
      }
      disposers.length = 0
      errorRef.current = null
    }

    if (!widget.js) return cleanup

    const sill: InlineApi & { __fail?: (error: unknown) => void } = {
      id: widget.id,
      root,
      host: window.sill,
      data: () => dataRef.current,
      onData: (callback) => {
        listeners.add(callback)
      },
      onDispose: (callback) => {
        if (typeof callback === 'function') disposers.push(callback)
      },
      command: (action, arg) => {
        runWidgetAction(action, arg, contextRef.current, permissionsRef.current)
      },
      storage: {
        get: async () => (await window.sill?.getWidgetData(widget.id)) ?? {},
        set: async (value) => (await window.sill?.setWidgetData(widget.id, value)) ?? {},
        patch: async (value) => {
          const current = (await window.sill?.getWidgetData(widget.id)) ?? {}
          return (await window.sill?.setWidgetData(widget.id, { ...current, ...value })) ?? {}
        }
      },
      settings: {
        get: async () => (await window.sill?.getWidgetSettings(widget.id)) ?? {},
        set: async (patch) =>
          (await window.sill?.setWidgetSettings(widget.id, patch)) ?? {},
        onChange: (callback) => {
          const off = window.sill?.onWidgetSettingsChanged((id, values) => {
            if (id === widget.id) callback(values)
          })
          return () => off?.()
        }
      },
      __fail: reportError
    }

    // 延后一拍：StrictMode 会 setup → cleanup → setup，作者脚本不能跑两遍。
    // 用 <script> 执行：CSP 允许内联脚本，堆栈也和普通脚本一致；包一层 try/catch，
    // 让同步错误落到卡内错误条，而不是只剩一条 console。
    let cancelled = false
    const timer = window.setTimeout(() => {
      if (cancelled) return
      const script = document.createElement('script')
      script.textContent = [
        '(function (sill, root) {',
        '  try {',
        widget.js,
        '  } catch (error) {',
        '    if (sill && typeof sill.__fail === "function") sill.__fail(error)',
        '    else throw error',
        '  }',
        '})(window.__sillInline, window.__sillInlineRoot)'
      ].join('\n')
      const scope = window as unknown as Record<string, unknown>
      scope.__sillInline = sill
      scope.__sillInlineRoot = root
      try {
        root.appendChild(script)
      } catch (error) {
        reportError(error)
      } finally {
        script.remove()
        delete scope.__sillInline
        delete scope.__sillInlineRoot
      }
      // 脚本注册完 onData 后立刻给一帧当前数据。
      notifyInline(
        listeners,
        widget.id,
        dataRef.current,
        contextRef.current.language,
        reportError
      )
    }, 0)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
      cleanup()
    }
  }, [widget])

  // 数据 / 语言变化：只更新绑定，不碰 DOM 结构。
  useLayoutEffect(() => {
    const root = host.current?.shadowRoot
    if (!root) return
    const data = buildProviderData(widget.data, context)
    const scopes: Scopes = new WeakMap()
    dataRef.current = data
    scopesRef.current = scopes

    for (let pass = 0; pass < MAX_REPEAT_PASSES; pass += 1) {
      if (!syncLists(root, data, scopes)) break
    }
    applyConditions(root, data, scopes)
    applyBindings(root, data, scopes, widget, context.language)

    notifyInline(inlineListeners.current, widget.id, data, context.language, (error) => {
      errorRef.current?.(error)
    })
  }, [
    widget,
    context.now,
    context.snapshot,
    context.todos,
    context.mediaPosition,
    context.mediaProgress,
    context.language
  ])

  return <div ref={host} />
}
