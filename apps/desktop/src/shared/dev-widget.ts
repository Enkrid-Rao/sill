/**
 * Dev-only widget payload. This is the first, deliberately small step toward
 * loading a package into the panel: read a folder, hand the three web files to
 * the renderer, and render them in a sandboxed iframe.
 *
 * It is gated behind SILL_DEV_WIDGET and is not part of the public manifest.
 */
export interface DevWidgetPayload {
  id: string
  name: string
  html: string
  css: string
  js: string
}
