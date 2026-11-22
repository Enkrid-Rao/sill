export interface ShelfShortcut {
  id: string
  name: string
  path: string
  /** data URL from app.getFileIcon; null until resolved */
  icon: string | null
  /** 用户手动指定的图标：不参与自动重取（快捷方式解析 / 默认图标判定） */
  iconCustom?: boolean
}
