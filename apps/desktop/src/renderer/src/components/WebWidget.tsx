import { useEffect, useMemo, useRef, useState } from 'react'
import type { DevWidgetPayload } from '../../../shared/dev-widget'
import { runWidgetAction } from '../widgets/actions'
import { buildProviderData } from '../widgets/providers'
import type { WidgetContext } from '../widgets/types'

interface GuestView extends HTMLElement {
  src: string
  send: (channel: string, ...args: unknown[]) => void
}

interface IpcEvent extends Event {
  channel: string
  args: unknown[]
}

interface NavigationEvent extends Event {
  url: string
}

interface Props {
  widget: DevWidgetPayload
  context: WidgetContext
}

const TOKEN_NAMES = [
  '--ink',
  '--ink-soft',
  '--ink-dim',
  '--ink-faint',
  '--accent',
  '--accent-pale',
  '--accent-soft',
  '--sans',
  '--serif',
  '--radius'
]

function readTokens(): Record<string, string> {
  if (typeof document === 'undefined') return {}
  const style = getComputedStyle(document.documentElement)
  const tokens: Record<string, string> = {}
  for (const name of TOKEN_NAMES) tokens[name] = style.getPropertyValue(name).trim()
  return tokens
}

function buildDocument(widget: DevWidgetPayload): string {
  const csp =
    "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'"
  const script = (widget.js ?? '').replace(/<\/script/gi, '<\\/script')
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style>
html, body { margin: 0; padding: 0; background: transparent; }
${widget.css}
</style>
</head>
<body>
${widget.html}
<script>${script}</script>
</body>
</html>`
}

/**
 * Web component prototype: full HTML/CSS/JS in a webview guest.
 * Sandboxed guests get only the sill bridge; trusted guests also get Node.
 * The guest is transparent, so the host .card supplies glass and atmosphere.
 */
export function WebWidget({ widget, context }: Props): React.JSX.Element {
  const container = useRef<HTMLDivElement>(null)
  const guestRef = useRef<GuestView | null>(null)
  const contextRef = useRef(context)
  const [preload, setPreload] = useState('')
  const [error, setError] = useState('')
  contextRef.current = context

  useEffect(() => {
    const api = window.sill
    if (!api?.getWidgetPreload) {
      setError('widget preload API missing')
      return
    }
    let alive = true
    void api
      .getWidgetPreload()
      .then((path) => {
        if (alive) setPreload(path)
      })
      .catch((reason) => {
        if (alive) setError(String(reason))
      })
    return () => {
      alive = false
    }
  }, [])

  const documentHtml = useMemo(() => buildDocument(widget), [widget])
  const height = widget.height ?? 160
  const trusted = widget.trust === 'trusted'

  useEffect(() => {
    const host = container.current
    if (!host || !preload) return

    const guest = document.createElement('webview') as GuestView
    guest.setAttribute('preload', preload)
    guest.setAttribute('partition', trusted ? 'sill-trusted' : 'sill-widget')
    guest.setAttribute(
      'webpreferences',
      trusted
        ? 'contextIsolation=no,nodeIntegration=yes,sandbox=no'
        : 'contextIsolation=yes,nodeIntegration=no,sandbox=yes'
    )
    guest.style.display = 'block'
    guest.style.width = '100%'
    guest.style.height = `${height}px`
    guest.style.background = 'transparent'
    guest.style.border = '0'

    const send = (): void => {
      try {
        guest.send('sill:data', {
          data: buildProviderData(widget.data, contextRef.current),
          language: contextRef.current.language,
          tokens: readTokens()
        })
      } catch {
        // guest may not be ready yet; dom-ready sends again
      }
    }

    const onIpc = (event: IpcEvent): void => {
      if (event.channel !== 'sill:command') return
      const [action, arg] = event.args as [unknown, unknown]
      if (typeof action !== 'string') return
      runWidgetAction(action, arg, contextRef.current, widget.permissions)
    }

    const onNavigate = (event: NavigationEvent): void => {
      if (!event.url.startsWith('data:text/html') && event.url !== 'about:blank') {
        event.preventDefault()
      }
    }

    guest.addEventListener('dom-ready', send as EventListener)
    guest.addEventListener('ipc-message', onIpc as EventListener)
    guest.addEventListener('will-navigate', onNavigate as EventListener)
    host.replaceChildren(guest)
    guest.src = `data:text/html;charset=utf-8,${encodeURIComponent(documentHtml)}`
    guestRef.current = guest

    return () => {
      guest.removeEventListener('dom-ready', send as EventListener)
      guest.removeEventListener('ipc-message', onIpc as EventListener)
      guest.removeEventListener('will-navigate', onNavigate as EventListener)
      guestRef.current = null
      guest.remove()
    }
  }, [preload, documentHtml, height, trusted, widget])

  useEffect(() => {
    const guest = guestRef.current
    if (!guest) return
    try {
      guest.send('sill:data', {
        data: buildProviderData(widget.data, context),
        language: context.language,
        tokens: readTokens()
      })
    } catch {
      // guest not ready; dom-ready handles first frame
    }
  }, [
    widget,
    context.now,
    context.snapshot,
    context.todos,
    context.mediaPosition,
    context.mediaProgress,
    context.language
  ])

  return (
    <div ref={container} style={{ minHeight: `${height}px` }}>
      {!preload && !error ? <div style={{ height: `${height}px` }} /> : null}
      {error ? <div className="sub">{error}</div> : null}
    </div>
  )
}
