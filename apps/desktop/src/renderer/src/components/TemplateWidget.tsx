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
  'h4'
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
}

/**
 * Template content. The host renders it in a shadow root inside a normal .card,
 * so the card supplies glass, radius and atmosphere. v1 has no arbitrary JS.
 */
export function TemplateWidget({ widget, context }: Props): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const element = host.current
    if (!element) return
    const root = element.shadowRoot ?? element.attachShadow({ mode: 'open' })
    root.innerHTML = `<style>:host{display:block;color:var(--ink);font-family:var(--sans)}${sanitizeCss(widget.css)}</style>${sanitizeHtml(widget.html)}`

    const data = buildProviderData(widget.data, context)
    const scopes: Scopes = new WeakMap()
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
