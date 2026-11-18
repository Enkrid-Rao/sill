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
  data: WidgetDataBinding[]
  /** lang -> key -> text; declared inline in widget.json. */
  strings: Record<string, Record<string, string>>
}
