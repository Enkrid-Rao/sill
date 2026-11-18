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
}
