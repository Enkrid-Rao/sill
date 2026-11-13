import type { Theme } from '../shared/theme'

export interface SillSettings {
  hotkey: string
  panelWidth: number
  side: 'right' | 'left'
  startAtLogin: boolean
  pinned: boolean
  theme: Theme
  panel: { x: number; y: number } | null
}

export interface SillApi {
  getSettings: () => Promise<SillSettings>
  updateSettings: (patch: Partial<SillSettings>) => Promise<SillSettings>
  hidePanel: () => Promise<void>
  togglePanel: () => Promise<void>
  setOverlayOpen: (open: boolean) => Promise<void>
  quit: () => Promise<void>
  onPanelState: (callback: (visible: boolean) => void) => () => void
  onEscape: (callback: () => void) => () => void
  versions: { electron: string; chrome: string }
}

declare global {
  interface Window {
    sill?: SillApi
  }
}

export {}
