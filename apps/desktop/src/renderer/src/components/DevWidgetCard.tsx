import { useEffect, useMemo, useRef } from 'react'
import type { DevWidgetPayload } from '../../../shared/dev-widget'
import { formatDate, type Language } from '../../../shared/i18n'
import type { Theme } from '../../../shared/theme'

interface Props {
  widget: DevWidgetPayload
  now: Date
  language: Language
  theme: Theme
}

interface DevState {
  language: Language
  data: {
    now: {
      iso: string
      time: string
      dateLabel: string
      hour: number
      minute: number
    }
  }
}

function timeLabel(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function makeState(now: Date, language: Language): DevState {
  return {
    language,
    data: {
      now: {
        iso: now.toISOString(),
        time: timeLabel(now),
        dateLabel: formatDate(now, language),
        hour: now.getHours(),
        minute: now.getMinutes()
      }
    }
  }
}

/** Pull the host's glass tokens into the iframe as CSS variables. */
function themeVariables(): Record<string, string> {
  const style = getComputedStyle(document.documentElement)
  const read = (name: string): string => style.getPropertyValue(name).trim()
  return {
    '--hue': read('--hue'),
    '--tint-s': read('--tint-s'),
    '--atmo-k': read('--atmo-k'),
    '--halo-k': read('--halo-k'),
    '--grain-k': read('--grain-k'),
    '--glass-alpha': read('--glass-alpha'),
    '--atmo-base': read('--atmo-base'),
    '--atmo-layer': read('--atmo-layer'),
    '--sill-hue': read('--hue'),
    '--sill-tint': read('--tint-s'),
    '--sill-surface': 'hsl(var(--hue) var(--tint-s) 7%)',
    '--sill-glass': 'linear-gradient(180deg, rgba(255, 255, 255, 0.045), rgba(255, 255, 255, 0.016))',
    '--sill-atmo-k': 'var(--atmo-k)',
    '--sill-halo-k': 'var(--halo-k)',
    '--sill-grain-k': 'var(--grain-k)',
    '--sill-glass-alpha': 'var(--glass-alpha)',
    '--sill-atmo-base': 'var(--atmo-base)',
    '--sill-atmo-layer': 'var(--atmo-layer)',
    '--sill-ink': read('--ink'),
    '--sill-soft': read('--ink-soft'),
    '--sill-dim': read('--ink-dim'),
    '--sill-faint': read('--ink-faint'),
    '--sill-accent': read('--accent'),
    '--sill-accent-pale': read('--accent-pale'),
    '--sill-accent-soft': read('--accent-soft'),
    '--sill-sans': read('--sans'),
    '--sill-serif': read('--serif')
  }
}

function themeCss(): string {
  return Object.entries(themeVariables())
    .map(([name, value]) => `${name}:${value};`)
    .join('\n')
}

function escapeScript(value: string): string {
  return value.replace(/<\/script/gi, '<\\/script')
}

function escapeStyle(value: string): string {
  return value.replace(/<\/style/gi, '<\\/style')
}

function buildDocument(
  widget: DevWidgetPayload,
  nonce: string,
  initial: DevState,
  themeCssText: string
): string {
  const serialized = JSON.stringify(initial).replace(/</g, '\\u003c')
  const hostSurface = `
    :root { color-scheme: dark; }
    html { background: transparent; }
    body {
      height: 100%;
      margin: 0;
      border-radius: 12px;
      /* 默认是 iframe 模式：iframe 在透明窗口里是不透明白底，必须有一块
         不透明内衬；颜色/氛围来自宿主 token。换成 WebContentsView 时，
         data-sill-surface=glass 会把这块内衬和伪元素一起关掉。 */
      background: var(--sill-surface);
      position: relative;
      z-index: 0;
    }
    body::before {
      content: '';
      position: absolute;
      inset: 0;
      z-index: -2;
      border-radius: 12px;
      background-image: var(--atmo-layer), var(--atmo-base);
      opacity: var(--atmo-k, 0);
      pointer-events: none;
    }
    body::after {
      content: '';
      position: absolute;
      inset: 0;
      z-index: -1;
      border-radius: 12px;
      background:
        radial-gradient(86% 34% at -4% -8%, hsl(calc(var(--hue) + 34) 62% 90% / 0.3) 0%, transparent 66%),
        linear-gradient(180deg, rgba(255, 255, 255, 0.045), rgba(255, 255, 255, 0.016));
      mix-blend-mode: screen;
      opacity: calc(var(--halo-k, 0) * 1.08);
      pointer-events: none;
    }
    html[data-sill-surface='glass'] body { background: transparent; }
    html[data-sill-surface='glass'] body::before,
    html[data-sill-surface='glass'] body::after { display: none; }
  `
  const bootstrap = `(() => {
    let state = ${serialized};
    const listeners = new Set();
    const channel = new MessageChannel();
    const port = channel.port2;
    port.onmessage = (event) => {
      const message = event.data;
      if (!message) return;
      if (message.type === 'theme') {
        for (const [name, value] of Object.entries(message.vars)) {
          document.documentElement.style.setProperty(name, value);
        }
        return;
      }
      if (message.type !== 'state') return;
      state = message.state;
      for (const listener of listeners) {
        try { listener(state); } catch (error) { console.error(error); }
      }
    };
    port.start();
    const api = {
      get language() { return state.language; },
      get data() { return state.data; },
      ready(callback) { try { callback(state); } catch (error) { console.error(error); } },
      onData(callback) { listeners.add(callback); return () => listeners.delete(callback); },
      log(...args) { port.postMessage({ type: 'log', message: args.map(String).join(' ') }); }
    };
    Object.defineProperty(window, 'sill', { value: api, configurable: false, writable: false });
    parent.postMessage({ type: 'sill:port' }, '*', [channel.port1]);
  })();`

  return `<!doctype html>
<html lang="${initial.language}" data-sill-surface="inset">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'" />
<style>:root{${themeCssText}}</style>
<style>${escapeStyle(widget.css)}</style>
<style>${hostSurface}</style>
</head>
<body>${widget.html}
<script nonce="${nonce}">${bootstrap}</script>
<script nonce="${nonce}">${escapeScript(widget.js)}</script>
</body>
</html>`
}

/**
 * Dev-only third-party card. The iframe is sandboxed without same-origin; the
 * only bridge is window.sill plus a MessagePort. This is a spike, not the
 * final package runtime.
 */
export function DevWidgetCard({ widget, now, language, theme }: Props): React.JSX.Element {
  const frame = useRef<HTMLIFrameElement>(null)
  const port = useRef<MessagePort | null>(null)
  const nonce = useMemo(() => crypto.randomUUID().replace(/-/g, ''), [])
  const state = useMemo(() => makeState(now, language), [now, language])
  const stateRef = useRef(state)
  stateRef.current = state
  const initialState = useRef(state)
  const documentMarkup = useMemo(
    () => buildDocument(widget, nonce, initialState.current, themeCss()),
    [widget, nonce]
  )

  // The iframe hands us a MessagePort. Updates go through the port, not through
  // postMessage('*'): if the frame navigates away, the port closes and no host
  // state follows it to another origin.
  useEffect(() => {
    const onMessage = (event: MessageEvent): void => {
      if (event.source !== frame.current?.contentWindow) return
      if (!event.data || event.data.type !== 'sill:port') return
      const next = event.ports[0]
      if (!next) return
      port.current?.close()
      port.current = next
      next.onmessage = (message: MessageEvent): void => {
        if (message.data?.type === 'log') console.log(`[widget:${widget.id}]`, message.data.message)
      }
      next.start()
      next.postMessage({ type: 'state', state: stateRef.current })
      next.postMessage({ type: 'theme', vars: themeVariables() })
    }
    window.addEventListener('message', onMessage)
    return () => {
      window.removeEventListener('message', onMessage)
      port.current?.close()
      port.current = null
    }
  }, [widget.id])

  useEffect(() => {
    port.current?.postMessage({ type: 'state', state })
  }, [state])

  useEffect(() => {
    // applyTheme() runs on the host root; wait one frame so the iframe gets the
    // post-paint values, not the previous theme.
    const raf = requestAnimationFrame(() => {
      port.current?.postMessage({ type: 'theme', vars: themeVariables() })
    })
    return () => cancelAnimationFrame(raf)
  }, [theme])

  return (
    <section className="card dev-card" data-card={widget.id}>
      <div className="row dev-card__head">
        <span className="cap">DEV · {widget.name}</span>
        <span className="cap">iframe</span>
      </div>
      <iframe
        ref={frame}
        className="dev-card__frame"
        title={widget.name}
        sandbox="allow-scripts"
        srcDoc={documentMarkup}
        style={{ backgroundColor: 'transparent', colorScheme: 'normal' }}
      />
    </section>
  )
}
