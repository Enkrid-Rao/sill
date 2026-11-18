export interface ShelfShortcut {
  id: string
  name: string
  path: string
  /** data URL from app.getFileIcon; null until resolved */
  icon: string | null
}
