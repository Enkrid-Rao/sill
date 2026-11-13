import type { Language } from '../shared/i18n'
import type { Theme } from '../shared/theme'

export interface SillSettings {
  hotkey: string
  panelWidth: number
  side: 'right' | 'left'
  edgeGap: number
  language: Language
  startAtLogin: boolean
  pinned: boolean
  theme: Theme
}

export interface SillApi {
  getSettings: () => Promise<SillSettings>
  updateSettings: (patch: Partial<SillSettings>) => Promise<SillSettings>
  setHotkey: (accel: string) => Promise<{ ok: boolean; hotkey: string }>
  getVersion: () => Promise<string>
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
