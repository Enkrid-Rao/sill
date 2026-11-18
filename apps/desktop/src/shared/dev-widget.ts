export interface WidgetDataBinding {
  id: string
  source: string
}

/**
 * Dev-only template payload. The host renders the template as a shadow root
 * inside a normal .card, so the card's glass and the rail atmosphere are the
 * real ones, not a simulated surface.
 */
export interface DevWidgetPayload {
  id: string
  name: string
  span: number
  html: string
  css: string
  /** "web" runs in a webview; omitted/undefined means template. */
  kind?: 'template' | 'web'
  /** trusted web gets full Node in the guest; sandboxed is the default. */
  trust?: 'sandboxed' | 'trusted'
  /** Fixed webview height; templates size from content. */
  height?: number
  /** Inline script for kind=web; never mounted in the host DOM. */
  js?: string
  data: WidgetDataBinding[]
  permissions: string[]
  /** lang -> key -> text; declared inline in widget.json. */
  strings: Record<string, Record<string, string>>
}
