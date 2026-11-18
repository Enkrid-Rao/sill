import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import type { DevWidgetPayload } from '../../../shared/dev-widget'
import { formatDate, type Language } from '../../../shared/i18n'

interface Props {
  widget: DevWidgetPayload
  now: Date
  language: Language
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
  return String(value)
}

/**
 * Dev-only template card. The template HTML/CSS is mounted into a shadow root
 * inside a normal .card, so the card's real glass and the rail atmosphere show
 * through. No iframe, no simulated surface, no arbitrary JS.
 */
export function DevWidgetCard({ widget, now, language }: Props): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const shadow = useRef<ShadowRoot | null>(null)
  const state = useRef({
    language,
    now: {
      iso: now.toISOString(),
      time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
      dateLabel: formatDate(now, language),
      hour: now.getHours(),
      minute: now.getMinutes()
    }
  })
  state.current = {
    language,
    now: {
      iso: now.toISOString(),
      time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
      dateLabel: formatDate(now, language),
      hour: now.getHours(),
      minute: now.getMinutes()
    }
  }

  const apply = useCallback((): void => {
    const root = shadow.current
    if (!root) return
    for (const node of root.querySelectorAll<HTMLElement>('[data-sill-text]')) {
      node.textContent = formatValue(readPath(state.current, node.dataset.sillText ?? ''))
    }
  }, [])

  useLayoutEffect(() => {
    const element = host.current
    if (!element) return
    const root = element.shadowRoot ?? element.attachShadow({ mode: 'open' })
    shadow.current = root
    root.innerHTML = `<style>:host{display:block;color:var(--ink);font-family:var(--sans)}${sanitizeCss(widget.css)}</style>${sanitizeHtml(widget.html)}`
    apply()
  }, [widget, apply])

  useEffect(() => {
    apply()
  }, [now, language, apply])

  return (
    <section className="card" data-card={widget.id}>
      <div ref={host} />
    </section>
  )
}
