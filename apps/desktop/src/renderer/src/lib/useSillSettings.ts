import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SillSettings } from '../../../preload/index.d'
import { t, type Language } from '../../../shared/i18n'
import {
  columnsForWidth,
  DEFAULT_LAYOUT,
  normalizeLayout,
  PANEL_MAX_WIDTH,
  PANEL_MIN_HEIGHT,
  PANEL_MIN_WIDTH,
  PANEL_PRESETS,
  type CardId,
  type PanelLayout
} from '../../../shared/layout'
import { DEFAULT_THEME, normalizeTheme, type Theme } from '../../../shared/theme'
import type { UpdateState } from '../../../shared/update'
import { WIDGET_BY_ID } from '../widgets/registry'
import { applyTheme } from './theme'

export const EMPTY_UPDATE: UpdateState = { status: 'idle' }

export interface SillSettingsController {
  theme: Theme
  hotkey: string
  panelWidth: number
  panelHeight: number
  side: 'left' | 'right'
  edgeGap: number
  language: Language
  startAtLogin: boolean
  autoUpdate: boolean
  settingsInWindow: boolean
  weatherLocation: string
  monitorIntervalMs: number
  version: string
  update: UpdateState
  layout: PanelLayout
  limits: { maxWidth: number; maxHeight: number }
  panelColumns: number
  widgets: readonly { id: CardId; label: string; hidden: boolean }[]
  updateTheme: (patch: Partial<Theme>) => void
  flushTheme: () => void
  resetTheme: () => void
  changeHotkey: (accel: string) => Promise<boolean>
  changePanelWidth: (value: number) => void
  changePanelHeight: (value: number) => void
  changePanelSize: (width: number, height: number) => void
  resetPanelSize: () => void
  changeSide: (side: 'left' | 'right') => void
  changeEdgeGap: (value: number) => void
  changeLanguage: (value: Language) => void
  changeStartAtLogin: (value: boolean) => void
  changeAutoUpdate: (value: boolean) => void
  changeSettingsInWindow: (value: boolean) => void
  changeWeatherLocation: (value: string) => void
  changeMonitorIntervalMs: (value: number) => void
  checkUpdate: () => void
  setLayout: (next: PanelLayout) => void
  resetLayout: () => Promise<void>
  toggleWidget: (id: CardId, shown: boolean) => void
}

/**
 * 面板与独立设置窗口共用的一份设置状态。
 *
 * 两个窗口都可能是「发起者」：Theme 拖动、尺寸滑杆、语言切换。主进程写盘后
 * 广播 `settings:changed` / `layout:changed`，两个窗口都通过这里收敛到同一份值，
 * 所以设置窗口改主题时面板会即时变，面板拖尺寸时设置窗口的滑杆也会跟上。
 */
export function useSillSettings(): SillSettingsController {
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME)
  const [hotkey, setHotkey] = useState('Alt+Q')
  const [panelWidth, setPanelWidth] = useState(384)
  const [panelHeight, setPanelHeight] = useState(0)
  const [side, setSide] = useState<'left' | 'right'>('right')
  const [edgeGap, setEdgeGap] = useState(30)
  const [language, setLanguage] = useState<Language>('en')
  const [startAtLogin, setStartAtLogin] = useState(false)
  const [autoUpdate, setAutoUpdate] = useState(true)
  const [settingsInWindow, setSettingsInWindow] = useState(false)
  const [weatherLocation, setWeatherLocation] = useState('auto')
  const [monitorIntervalMs, setMonitorIntervalMs] = useState(2000)
  const [version, setVersion] = useState('')
  const [update, setUpdate] = useState<UpdateState>(EMPTY_UPDATE)
  const [layout, setLayoutState] = useState<PanelLayout>(DEFAULT_LAYOUT)
  const themeRef = useRef<Theme>(DEFAULT_THEME)
  const saveTimer = useRef<number | null>(null)
  const pendingTheme = useRef<Theme | null>(null)

  const adopt = useCallback((next: SillSettings) => {
    setTheme(normalizeTheme(next.theme))
    setHotkey(next.hotkey)
    setPanelWidth(next.panelWidth)
    setPanelHeight(next.panelHeight)
    setSide(next.side)
    setEdgeGap(next.edgeGap)
    setLanguage(next.language)
    setStartAtLogin(next.startAtLogin)
    setAutoUpdate(next.autoUpdate)
    setSettingsInWindow(next.settingsInWindow)
    setWeatherLocation(next.weatherLocation)
    setMonitorIntervalMs(next.monitorIntervalMs)
  }, [])

  // 读一次全量状态，然后一直订阅主进程广播
  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const [settings, appVersion, initialLayout, updateState] = await Promise.all([
          window.sill?.getSettings(),
          window.sill?.getVersion(),
          window.sill?.getLayout(),
          window.sill?.getUpdateState()
        ])
        if (!alive) return
        if (settings) adopt(settings)
        if (appVersion) setVersion(appVersion)
        if (initialLayout) setLayoutState(normalizeLayout(initialLayout))
        if (updateState) setUpdate(updateState)
      } catch {
        // 浏览器预览 / IPC 失败时保持默认值
      }
    })()

    const offSettings = window.sill?.onSettingsChanged((next) => adopt(next))
    const offLayout = window.sill?.onLayoutChanged((next) => setLayoutState(normalizeLayout(next)))
    const offUpdate = window.sill?.onUpdateState((next) => setUpdate(next))
    return () => {
      alive = false
      offSettings?.()
      offLayout?.()
      offUpdate?.()
    }
  }, [adopt])

  // 主题变化 → 写 CSS 变量（唯一的渲染入口）
  useEffect(() => {
    themeRef.current = theme
    applyTheme(theme)
  }, [theme])

  // 语言：同步 <html lang>，让中文标题不走合成斜体；独立设置窗口同时本地化窗口标题
  useEffect(() => {
    document.documentElement.lang = language
    const settingsWindow = new URLSearchParams(window.location.search).has('settings')
    document.title = settingsWindow
      ? language === 'zh'
        ? 'Sill 设置'
        : 'Sill Settings'
      : 'Sill'
  }, [language])

  const flushTheme = useCallback(() => {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    const next = pendingTheme.current
    pendingTheme.current = null
    if (next) void window.sill?.updateSettings({ theme: next })
  }, [])

  useEffect(
    () => () => {
      // 独立设置窗口可能拖完主题就关掉；卸载时把最后一帧写完
      if (pendingTheme.current) {
        const next = pendingTheme.current
        pendingTheme.current = null
        void window.sill?.updateSettings({ theme: next })
      }
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
    },
    []
  )

  const updateTheme = useCallback((patch: Partial<Theme>) => {
    const next = normalizeTheme({ ...themeRef.current, ...patch })
    themeRef.current = next
    pendingTheme.current = next
    setTheme(next)
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null
      const pending = pendingTheme.current
      pendingTheme.current = null
      if (pending) void window.sill?.updateSettings({ theme: pending })
    }, 220)
  }, [])

  const resetTheme = useCallback(() => {
    updateTheme({ ...DEFAULT_THEME })
  }, [updateTheme])

  const changeHotkey = useCallback(async (accel: string): Promise<boolean> => {
    const result = await window.sill?.setHotkey(accel)
    if (result?.ok) {
      setHotkey(result.hotkey)
      return true
    }
    return false
  }, [])

  const changePanelWidth = useCallback((value: number) => {
    setPanelWidth(value)
    void window.sill?.updateSettings({ panelWidth: value })
  }, [])

  const changePanelHeight = useCallback((value: number) => {
    setPanelHeight(value)
    // 高度滑杆 = 明确的「重新居中」，把拖底边留下的垂直偏移清掉
    void window.sill?.updateSettings({ panelHeight: value, panelOffsetY: 0 })
  }, [])

  const changePanelSize = useCallback((width: number, height: number) => {
    setPanelWidth(width)
    setPanelHeight(height)
    void window.sill?.updateSettings({ panelWidth: width, panelHeight: height, panelOffsetY: 0 })
  }, [])

  const resetPanelSize = useCallback(() => {
    const width = PANEL_PRESETS[0].width
    setPanelWidth(width)
    setPanelHeight(0)
    void window.sill?.updateSettings({ panelWidth: width, panelHeight: 0, panelOffsetY: 0 })
  }, [])

  const changeSide = useCallback((next: 'left' | 'right') => {
    setSide(next)
    void window.sill?.updateSettings({ side: next })
  }, [])

  const changeEdgeGap = useCallback((value: number) => {
    setEdgeGap(value)
    void window.sill?.updateSettings({ edgeGap: value })
  }, [])

  const changeLanguage = useCallback((next: Language) => {
    setLanguage(next)
    void window.sill?.updateSettings({ language: next })
  }, [])

  const changeStartAtLogin = useCallback((value: boolean) => {
    setStartAtLogin(value)
    void window.sill?.updateSettings({ startAtLogin: value })
  }, [])

  const changeAutoUpdate = useCallback((value: boolean) => {
    setAutoUpdate(value)
    void window.sill?.updateSettings({ autoUpdate: value })
  }, [])

  const changeSettingsInWindow = useCallback((value: boolean) => {
    setSettingsInWindow(value)
    void window.sill?.updateSettings({ settingsInWindow: value })
  }, [])

  const changeWeatherLocation = useCallback((value: string) => {
    setWeatherLocation(value)
    void window.sill?.updateSettings({ weatherLocation: value })
  }, [])

  const changeMonitorIntervalMs = useCallback((value: number) => {
    setMonitorIntervalMs(value)
    void window.sill?.updateSettings({ monitorIntervalMs: value })
  }, [])

  const checkUpdate = useCallback(() => {
    setUpdate({ status: 'checking' })
    void window.sill?.checkForUpdates().then((next) => {
      if (next) setUpdate(next)
    })
  }, [])

  const setLayout = useCallback((next: PanelLayout) => {
    setLayoutState(next)
    void window.sill?.setLayout(next)
  }, [])

  const resetLayout = useCallback(async () => {
    const saved = await window.sill?.resetLayout()
    if (saved) setLayoutState(saved)
  }, [])

  const toggleWidget = useCallback(
    (id: CardId, shown: boolean) => {
      const hidden = shown
        ? layout.hidden.filter((item) => item !== id)
        : [...layout.hidden, id]
      setLayout({ ...layout, hidden })
    },
    [layout, setLayout]
  )

  const limits = useMemo(
    () => ({
      maxWidth: Math.max(
        PANEL_MIN_WIDTH,
        Math.min(PANEL_MAX_WIDTH, window.screen.availWidth - edgeGap * 2 - 16)
      ),
      maxHeight: Math.max(PANEL_MIN_HEIGHT, window.screen.availHeight - 80)
    }),
    [edgeGap]
  )

  const panelColumns = useMemo(() => columnsForWidth(panelWidth), [panelWidth])

  const widgets = useMemo(
    () =>
      layout.order.map((id) => ({
        id,
        label: t(language, WIDGET_BY_ID[id].nameKey),
        hidden: layout.hidden.includes(id)
      })),
    [language, layout.order, layout.hidden]
  )

  return {
    theme,
    hotkey,
    panelWidth,
    panelHeight,
    side,
    edgeGap,
    language,
    startAtLogin,
    autoUpdate,
    settingsInWindow,
    weatherLocation,
    monitorIntervalMs,
    version,
    update,
    layout,
    limits,
    panelColumns,
    widgets,
    updateTheme,
    flushTheme,
    resetTheme,
    changeHotkey,
    changePanelWidth,
    changePanelHeight,
    changePanelSize,
    resetPanelSize,
    changeSide,
    changeEdgeGap,
    changeLanguage,
    changeStartAtLogin,
    changeAutoUpdate,
    changeSettingsInWindow,
    changeWeatherLocation,
    changeMonitorIntervalMs,
    checkUpdate,
    setLayout,
    resetLayout,
    toggleWidget
  }
}
