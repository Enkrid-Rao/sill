import { useLayoutEffect, useRef } from 'react'
import type { DevWidgetPayload } from '../../../shared/dev-widget'
import { buildProviderData } from '../widgets/providers'
import type { WidgetContext } from '../widgets/types'

interface Props {
  widget: DevWidgetPayload
  context: WidgetContext
}

const ALLOWED_TAGS = new Set([
  'div',
  'span',
  'p',
  'section',
  'ul',
  'ol',
  'li',
  'strong',
  'em',
  'small',
  'b',
  'i',
  'br',
  'h1',
  'h2',
  'h3',
  'h4',
  'button'
])

function sanitizeHtml(input: string): string {
  const doc = new DOMParser().parseFromString(input, 'text/html')
  const visit = (parent: Element): void => {
    for (const child of [...parent.children]) {
      if (!ALLOWED_TAGS.has(child.tagName.toLowerCase())) {
        child.remove()
        continue
      }
      for (const attribute of [...child.attributes]) {
        const name = attribute.name.toLowerCase()
        const keep =
          name === 'class' ||
          name === 'id' ||
          name === 'role' ||
          name === 'type' ||
          name.startsWith('aria-') ||
          name.startsWith('data-sill-')
        if (!keep) child.removeAttribute(attribute.name)
      }
      visit(child)
    }
  }
  visit(doc.body)
  return doc.body.innerHTML
}

function sanitizeCss(input: string): string {
  return input
    .replace(/@import[^;]*;?/gi, '')
    .replace(/url\s*\([^)]*\)/gi, 'none')
    .replace(/expression\s*\(/gi, '')
    .replace(/-moz-binding\s*:[^;]*;?/gi, '')
    .slice(0, 100_000)
}

function readPath(data: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => {
    if (!value || typeof value !== 'object') return undefined
    return (value as Record<string, unknown>)[key]
  }, data)
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10)
  }
  if (typeof value === 'object') return '—'
  return String(value)
}

type Scopes = WeakMap<Element, unknown>

function scopeFor(node: Element, scopes: Scopes): unknown {
  let current: Element | null = node
  while (current) {
    if (scopes.has(current)) return scopes.get(current)
    current = current.parentElement
  }
  return undefined
}

function resolve(node: Element, path: string, data: Record<string, unknown>, scopes: Scopes): unknown {
  const scope = scopeFor(node, scopes)
  if (path === 'item') return scope
  if (path.startsWith('item.')) {
    return scope && typeof scope === 'object'
      ? readPath(scope, path.slice('item.'.length))
      : undefined
  }
  return readPath(data, path)
}

function expandRepeats(root: ShadowRoot, data: Record<string, unknown>, scopes: Scopes): void {
  // Nested repeats can appear after cloning; run a few passes, not unbounded.
  for (let pass = 0; pass < 8; pass += 1) {
    const nodes = [...root.querySelectorAll<HTMLElement>('[data-sill-repeat]')]
    if (nodes.length === 0) return
    for (const node of nodes) {
      const path = node.dataset.sillRepeat ?? ''
      const value = resolve(node, path, data, scopes)
      if (!Array.isArray(value) || value.length === 0) {
        node.remove()
        continue
      }
      const fragment = document.createDocumentFragment()
      for (const item of value) {
        const clone = node.cloneNode(true) as HTMLElement
        clone.removeAttribute('data-sill-repeat')
        scopes.set(clone, item)
        fragment.appendChild(clone)
      }
      node.replaceWith(fragment)
    }
  }
}

function applyConditions(root: ShadowRoot, data: Record<string, unknown>, scopes: Scopes): void {
  for (const node of [...root.querySelectorAll<HTMLElement>('[data-sill-if]')]) {
    const raw = node.dataset.sillIf ?? ''
    const negate = raw.startsWith('!')
    const path = negate ? raw.slice(1) : raw
    const value = resolve(node, path, data, scopes)
    const visible = negate ? !value : Boolean(value)
    if (!visible) node.remove()
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
  root: ShadowRoot,
  data: Record<string, unknown>,
  scopes: Scopes,
  widget: DevWidgetPayload,
  language: string
): void {
  for (const node of root.querySelectorAll<HTMLElement>('[data-sill-text]')) {
    node.textContent = formatValue(resolve(node, node.dataset.sillText ?? '', data, scopes))
  }
  for (const node of root.querySelectorAll<HTMLElement>('[data-sill-i18n]')) {
    node.textContent = translate(widget.strings, language, node.dataset.sillI18n ?? '')
  }
  for (const node of root.querySelectorAll<HTMLElement>('[data-sill-meter]')) {
    const value = Number(resolve(node, node.dataset.sillMeter ?? '', data, scopes))
    if (Number.isFinite(value)) {
      node.style.setProperty('--sill-value', String(Math.max(0, Math.min(100, value))))
    } else {
      node.style.removeProperty('--sill-value')
    }
  }
}

function runAction(
  action: string,
  arg: unknown,
  context: WidgetContext,
  permissions: readonly string[]
): void {
  if (action.startsWith('media.') && !permissions.includes('action.media')) return
  if (action.startsWith('todo.') && !permissions.includes('action.todo')) return

  switch (action) {
    case 'media.playpause':
      void context.mediaCommand('playpause')
      break
    case 'media.next':
      void context.mediaCommand('next')
      break
    case 'media.prev':
      void context.mediaCommand('prev')
      break
    case 'media.mute':
      void context.mediaCommand('mute')
      break
    case 'todo.toggle':
      if (typeof arg === 'string') void context.onToggleTodo(arg)
      break
    default:
      break
  }
}

/**
 * Template content. The host renders it in a shadow root inside a normal .card,
 * so the card supplies glass, radius and atmosphere. v1 has no arbitrary JS.
 */
export function TemplateWidget({ widget, context }: Props): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const clickBound = useRef(false)
  const contextRef = useRef(context)
  const dataRef = useRef<Record<string, unknown>>({})
  const scopesRef = useRef<Scopes>(new WeakMap())
  const permissionsRef = useRef<string[]>(widget.permissions)
  contextRef.current = context
  permissionsRef.current = widget.permissions

  useLayoutEffect(() => {
    const element = host.current
    if (!element) return
    const root = element.shadowRoot ?? element.attachShadow({ mode: 'open' })

    if (!clickBound.current) {
      root.addEventListener('click', (event) => {
        const target = event.target
        if (!(target instanceof Element)) return
        const actionNode = target.closest<HTMLElement>('[data-sill-action]')
        if (!actionNode || actionNode.dataset.sillAction === undefined) return
        const argPath = actionNode.dataset.sillActionArg
        const arg = argPath
          ? resolve(actionNode, argPath, dataRef.current, scopesRef.current)
          : undefined
        runAction(
          actionNode.dataset.sillAction ?? '',
          arg,
          contextRef.current,
          permissionsRef.current
        )
      })
      clickBound.current = true
    }

    root.innerHTML = `<style>:host{display:block;color:var(--ink);font-family:var(--sans)}${sanitizeCss(widget.css)}</style>${sanitizeHtml(widget.html)}`

    const data = buildProviderData(widget.data, context)
    const scopes: Scopes = new WeakMap()
    dataRef.current = data
    scopesRef.current = scopes
    expandRepeats(root, data, scopes)
    applyConditions(root, data, scopes)
    applyBindings(root, data, scopes, widget, context.language)
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
