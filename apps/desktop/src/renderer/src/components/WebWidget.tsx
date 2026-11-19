import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { DevWidgetPayload } from '../../../shared/dev-widget'
import { readTokens } from '../lib/tokens'
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

function buildDocument(widget: DevWidgetPayload): string {
  // web 组件是隔离运行的可信代码：它可以联网、取远程图片，但只能执行内联脚本
  // 与包内模块（不允许加载远程脚本，避免「远程页面拿到 guest 权限」）。
  const csp =
    "default-src 'none'; style-src 'unsafe-inline' sill-asset: https:; script-src 'unsafe-inline' sill-asset:; img-src sill-asset: data: blob: https:; font-src sill-asset: data: https:; media-src sill-asset: blob: https:; connect-src https:"
  // 包内相对路径（assets/、style.css）对到组件目录；<base> 之后 <img src="assets/x.png"> 直接可用。
  const base = `sill-asset://${widget.id}/ui/`
  const script = (widget.js ?? '').replace(/<\/script/gi, '<\\/script')
  return `<!doctype html>
<html>
<head>
<base href="${base}">
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
    // 隔离模式的 guest 每个组件一个 in-memory partition，互相看不到 localStorage。
    guest.setAttribute('partition', trusted ? 'sill-trusted' : `sill-widget-${widget.id}`)
    guest.setAttribute(
      'webpreferences',
      trusted
        ? 'contextIsolation=no,nodeIntegration=yes,sandbox=no'
        : 'contextIsolation=yes,nodeIntegration=no,sandbox=yes'
    )
    guest.style.display = 'block'
    guest.style.width = '100%'
    guest.style.height = '100%'
    guest.style.background = 'transparent'
    guest.style.border = '0'

    const send = (): void => {
      try {
        guest.send('sill:data', {
          data: buildProviderData(widget.data, contextRef.current),
          language: contextRef.current.language,
          tokens: readTokens(),
          ...(trusted && widget.dir ? { dir: widget.dir } : {})
        })
      } catch {
        // guest may not be ready yet; dom-ready sends again
      }
    }

    const onIpc = (event: IpcEvent): void => {
      if (event.channel === 'sill:height') {
        const next = Number(event.args[0])
        if (Number.isFinite(next) && next > 0) {
          const clamped = Math.max(48, Math.min(1200, Math.round(next)))
          host.style.setProperty('--webguest-h', `${clamped}px`)
        }
        return
      }
      // 组件私有存储：guest 里的 sill.storage 通过这里落到 widget-data/<id>.json
      if (event.channel === 'sill:storage') {
        const payload = event.args[0] as
          | { id?: number; op?: string; value?: unknown }
          | undefined
        if (!payload || typeof payload.id !== 'number') return
        void (async () => {
          const current = (await window.sill?.getWidgetData(widget.id)) ?? {}
          let next: Record<string, unknown> = current
          if (payload.op === 'set') {
            next = (await window.sill?.setWidgetData(widget.id, payload.value)) ?? {}
          } else if (payload.op === 'patch' && payload.value && typeof payload.value === 'object') {
            next =
              (await window.sill?.setWidgetData(widget.id, {
                ...current,
                ...(payload.value as Record<string, unknown>)
              })) ?? {}
          }
          try {
            guest.send('sill:storage-reply', { id: payload.id, value: next })
          } catch {
            // guest 已经开始销毁
          }
        })()
        return
      }
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
        tokens: readTokens(),
        ...(trusted && widget.dir ? { dir: widget.dir } : {})
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

  const heightStyle = { '--webguest-h': `${height}px` } as CSSProperties

  return (
    <div ref={container} className="webguest" style={heightStyle}>
      {error ? <div className="sub">{error}</div> : null}
    </div>
  )
}
