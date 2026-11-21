import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { MONITOR_INTERVALS } from '../../../shared/data'
import { LANGUAGES, t, type Language, type TranslationKey } from '../../../shared/i18n'
import {
  getWeatherCity,
  WEATHER_CITIES,
  weatherCityName,
  type WeatherCustomLocation
} from '../../../shared/weather'
import {
  matchPreset,
  PANEL_MIN_HEIGHT,
  PANEL_MIN_WIDTH,
  PANEL_PRESETS
} from '../../../shared/layout'
import type { UpdateState } from '../../../shared/update'
import type { UninstallInfo } from '../../../shared/uninstall'
import {
  ACCENT_SWATCHES,
  ATMO_STYLES,
  PRESETS,
  matchPreset as matchThemePreset,
  presetPatch,
  type Theme
} from '../../../shared/theme'
import { formatHotkey } from '../lib/hotkey'
import { useWidgetRegistry } from '../widgets/WidgetRegistryProvider'
import type { ComponentProblem } from '../../../shared/widgets'
import { pickLocalized, findUpdates, type CatalogEntry, type CatalogUpdate } from '../../../shared/catalog'

type Section =
  | 'general'
  | 'appearance'
  | 'panel'
  | 'widgets'
  | 'data'
  | 'updates'
  | 'advanced'
  | 'about'

const SECTIONS: readonly Section[] = [
  'general',
  'appearance',
  'panel',
  'widgets',
  'data',
  'updates',
  'advanced',
  'about'
]

/** 设置关闭后仍保留：同一窗口内重开时回到上次分组与滚动位置。 */
const sectionScroll = new Map<Section, number>()
let lastSection: Section | null = null

interface SearchEntry {
  section: Section
  labelKey: TranslationKey
}

/** 搜索索引：设置项名称 → 所在分组。只用于跳转，不复制具体控件。 */
const SEARCH_INDEX: readonly SearchEntry[] = [
  { section: 'general', labelKey: 'general.language' },
  { section: 'general', labelKey: 'general.settingsWindow' },
  { section: 'general', labelKey: 'behavior.startup' },
  { section: 'general', labelKey: 'behavior.shortcut' },
  { section: 'appearance', labelKey: 'appearance.presets' },
  { section: 'appearance', labelKey: 'appearance.accent' },
  { section: 'appearance', labelKey: 'theme.atmosphere' },
  { section: 'appearance', labelKey: 'theme.hue' },
  { section: 'appearance', labelKey: 'theme.tint' },
  { section: 'appearance', labelKey: 'theme.opacity' },
  { section: 'appearance', labelKey: 'theme.halo' },
  { section: 'appearance', labelKey: 'theme.grain' },
  { section: 'panel', labelKey: 'behavior.shape' },
  { section: 'panel', labelKey: 'size.width' },
  { section: 'panel', labelKey: 'size.height' },
  { section: 'panel', labelKey: 'size.auto' },
  { section: 'panel', labelKey: 'behavior.dock' },
  { section: 'panel', labelKey: 'behavior.edge' },
  { section: 'panel', labelKey: 'behavior.layoutMode' },
  { section: 'panel', labelKey: 'behavior.layout' },
  { section: 'widgets', labelKey: 'widgets.installed' },
  { section: 'widgets', labelKey: 'widgets.visibility' },
  { section: 'widgets', labelKey: 'widgets.installWidget' },
  { section: 'widgets', labelKey: 'widgets.installUrl' },
  { section: 'widgets', labelKey: 'widgets.catalog' },
  { section: 'widgets', labelKey: 'widgets.create' },
  { section: 'widgets', labelKey: 'widgets.skinsFolder' },
  { section: 'data', labelKey: 'general.refresh' },
  { section: 'data', labelKey: 'weather.group' },
  { section: 'data', labelKey: 'weather.location' },
  { section: 'updates', labelKey: 'general.autoUpdate' },
  { section: 'updates', labelKey: 'updates.components' },
  { section: 'advanced', labelKey: 'general.dataFolder' },
  { section: 'advanced', labelKey: 'widgets.assoc' },
  { section: 'advanced', labelKey: 'general.uninstall' },
  { section: 'about', labelKey: 'general.version' }
]

/** Open-Meteo geocoding 返回的最小字段集。 */
interface WeatherGeoResult {
  id?: number
  name: string
  latitude: number
  longitude: number
  admin1?: string
  country?: string
}

/** 组件设置项的 label 支持纯文本或 { en, zh }。 */
function settingText(
  label: string | Record<string, string> | undefined,
  language: Language,
  fallback: string
): string {
  if (!label) return fallback
  if (typeof label === 'string') return label
  return label[language] ?? label.en ?? Object.values(label)[0] ?? fallback
}

interface Props {
  theme: Theme
  onChange: (patch: Partial<Theme>) => void
  onClose: () => void
  onReset: () => void
  hotkey: string
  onHotkeyChange: (accel: string) => Promise<boolean>
  panelWidth: number
  panelHeight: number
  maxWidth: number
  maxHeight: number
  onPanelWidthChange: (width: number) => void
  onPanelHeightChange: (height: number) => void
  onPanelSizeChange: (width: number, height: number) => void
  onResetSize: () => void
  side: 'left' | 'right'
  onSideChange: (side: 'left' | 'right') => void
  edgeGap: number
  onEdgeGapChange: (value: number) => void
  language: Language
  onLanguageChange: (language: Language) => void
  settingsInWindow: boolean
  onSettingsInWindowChange: (value: boolean) => void
  weatherLocation: string
  weatherCustom: WeatherCustomLocation | null
  onWeatherLocationChange: (value: string) => void
  onWeatherCustomChange: (value: WeatherCustomLocation | null) => void
  networkConsent: boolean
  weatherNetwork: boolean
  onNetworkConsentChange: (value: boolean) => void
  onWeatherNetworkChange: (value: boolean) => void
  monitorIntervalMs: number
  onMonitorIntervalChange: (value: number) => void
  startAtLogin: boolean
  onStartAtLoginChange: (value: boolean) => void
  autoUpdate: boolean
  onAutoUpdateChange: (value: boolean) => void
  update: UpdateState
  onCheckUpdate: () => void
  onDownloadUpdate: () => void
  onInstallUpdate: () => void
  onEditLayout: () => void
  onResetLayout: () => void
  layoutMode: 'flow' | 'free'
  onLayoutModeChange: (mode: 'flow' | 'free') => void
  widgets: readonly { id: string; label: string; hidden: boolean }[]
  onToggleWidget: (id: string, shown: boolean) => void
  version: string
  columns: number
  /** 独立窗口模式：没有面板做底，自己就是整块玻璃 */
  standalone?: boolean
}

function Slider({
  id,
  label,
  value,
  min,
  max,
  suffix,
  hue = false,
  disabled = false,
  thumb,
  onChange
}: {
  id: string
  label: string
  value: number
  min: number
  max: number
  suffix: string
  hue?: boolean
  disabled?: boolean
  thumb?: string
  onChange: (value: number) => void
}): React.JSX.Element {
  const progress = max === min ? 0 : ((value - min) / (max - min)) * 100
  return (
    <div className={`cz-field${disabled ? ' is-disabled' : ''}`}>
      <div className="cz-field__head">
        <label className="cz-field__name" htmlFor={id}>
          {label}
        </label>
        <output className="cz-field__value" htmlFor={id}>
          {value}
          {suffix}
        </output>
      </div>
      <input
        className={`cz-range${hue ? ' cz-range--hue' : ''}`}
        id={id}
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        disabled={disabled}
        aria-valuetext={`${value}${suffix}`}
        style={
          {
            '--range-progress': `${progress.toFixed(2)}%`,
            ...(thumb ? { '--thumb-color': thumb } : {})
          } as React.CSSProperties
        }
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    </div>
  )
}

function Switch({
  id,
  label,
  note,
  checked,
  onChange
}: {
  id: string
  label: string
  note: string
  checked: boolean
  onChange: (value: boolean) => void
}): React.JSX.Element {
  return (
    <label className="cz-setrow" htmlFor={id}>
      <span className="cz-setrow__copy">
        <span className="cz-setrow__name">{label}</span>
        <span className="cz-setrow__note">{note}</span>
      </span>
      <span className="cz-toggle">
        <input
          className="cz-check"
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.currentTarget.checked)}
        />
        <span className="cz-switch" aria-hidden="true" />
      </span>
    </label>
  )
}

function Fold({
  id,
  title,
  note,
  count,
  open,
  onToggle,
  children
}: {
  id: string
  title: string
  note?: string
  count?: number
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className={`cz-fold${open ? ' is-open' : ''}`}>
      <button
        className="cz-fold__head"
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={onToggle}
      >
        <span className="cz-fold__title">{title}</span>
        {typeof count === 'number' ? <span className="cz-fold__count">{count}</span> : null}
        <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true">
          <path
            d="m3 4.5 3 3 3-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {note ? <p className="cz-fold__note">{note}</p> : null}
      {open ? (
        <div className="cz-fold__body" id={id}>
          {children}
        </div>
      ) : null}
    </section>
  )
}

/** 数据位置 + 卸载入口。两种发布形态的行为不同，全部由主进程的 UninstallInfo 决定。 */
function UninstallSection({
  language,
  part = 'all'
}: {
  language: Language
  part?: 'data' | 'uninstall' | 'all'
}): React.JSX.Element {
  const [info, setInfo] = useState<UninstallInfo | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [deleteData, setDeleteData] = useState(false)
  const [starting, setStarting] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    void window.sill?.getUninstallInfo().then((next) => {
      if (alive) setInfo(next)
    })
    return () => {
      alive = false
    }
  }, [])

  const mode = info?.mode ?? 'unsupported'
  const note =
    mode === 'installed'
      ? t(language, 'general.uninstallNoteInstalled')
      : mode === 'portable'
        ? t(language, 'general.uninstallNotePortable')
        : t(language, 'general.uninstallNoteUnsupported')

  const run = (): void => {
    setFailed(false)
    setStarting(true)
    void window.sill
      ?.uninstall(deleteData)
      .then((result) => {
        if (!result?.ok) {
          setStarting(false)
          setFailed(true)
        }
      })
      .catch(() => {
        setStarting(false)
        setFailed(true)
      })
  }

  return (
    <>
      {part === 'all' ? <p className="cz-group">{t(language, 'general.dataUninstall')}</p> : null}

      {part !== 'uninstall' ? (
        <div className="cz-setrow">
          <div className="cz-setrow__copy">
            <span className="cz-setrow__name">{t(language, 'general.dataFolder')}</span>
            <span className="cz-setrow__note cz-path" title={info?.dataDir ?? ''}>
              {info?.dataDir ?? '—'}
            </span>
            <span className="cz-setrow__note">{t(language, 'general.dataFolderNote')}</span>
          </div>
          <button
            className="cz-action"
            type="button"
            disabled={!info}
            onClick={() => void window.sill?.openDataFolder()}
          >
            {t(language, 'general.openDataFolder')}
          </button>
        </div>
      ) : null}

      {part !== 'data' ? (
        <div className="cz-setrow">
          <div className="cz-setrow__copy">
            <span className="cz-setrow__name">{t(language, 'general.uninstall')}</span>
            <span className="cz-setrow__note">{note}</span>
          </div>
          <button
            className="cz-action cz-action--danger"
            type="button"
            disabled={!info?.canUninstall || starting || confirming}
            onClick={() => {
              setDeleteData(false)
              setFailed(false)
              setConfirming(true)
            }}
          >
            {t(language, 'general.uninstallButton')}
          </button>
        </div>
      ) : null}

      {confirming ? (
        <div
          className="cz-confirm"
          role="alertdialog"
          aria-label={t(language, 'general.uninstallTitle')}
        >
          <p className="cz-confirm__title">{t(language, 'general.uninstallTitle')}</p>
          <p className="cz-confirm__body">
            {mode === 'portable'
              ? t(language, 'general.uninstallBodyPortable')
              : t(language, 'general.uninstallBodyInstalled')}
          </p>
          {mode === 'installed' ? (
            <Switch
              id="cz-uninstall-delete-data"
              label={t(language, 'general.uninstallDeleteData')}
              note={t(language, 'general.uninstallDeleteDataNote')}
              checked={deleteData}
              onChange={setDeleteData}
            />
          ) : null}
          {failed ? <p className="cz-error">{t(language, 'general.uninstallFailed')}</p> : null}
          {starting ? (
            <p className="cz-confirm__pending" role="status">
              {t(language, 'general.uninstalling')}
            </p>
          ) : (
            <div className="cz-confirm__actions">
              <button className="cz-action" type="button" onClick={() => setConfirming(false)}>
                {t(language, 'general.uninstallCancel')}
              </button>
              <button className="cz-action cz-action--danger" type="button" onClick={run}>
                {t(language, 'general.uninstallConfirm')}
              </button>
            </div>
          )}
        </div>
      ) : null}
    </>
  )
}

const ARROW_KEYS: Record<string, string> = {
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Space: 'Space',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  Insert: 'Insert',
  Delete: 'Delete',
  Tab: 'Tab',
  Enter: 'Return',
  Backspace: 'Backspace'
}

/** 键盘事件 → Electron accelerator 的按键部分；修饰键单独按下时返回 null */
function keyToken(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3)
  if (/^Digit[0-9]$/.test(code)) return code.slice(5)
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code
  return ARROW_KEYS[code] ?? null
}

function modifiersOf(event: KeyboardEvent): string[] {
  const mods: string[] = []
  if (event.ctrlKey) mods.push('Ctrl')
  if (event.altKey) mods.push('Alt')
  if (event.shiftKey) mods.push('Shift')
  if (event.metaKey) mods.push('Super')
  return mods
}

function toAccelerator(event: KeyboardEvent): string | null {
  const key = keyToken(event.code)
  const mods = modifiersOf(event)
  if (!key || mods.length === 0) return null
  return [...mods, key].join('+')
}

/** 录制中：只按下修饰键时给个即时反馈 */
function modifierPreview(event: KeyboardEvent): string {
  const mods = modifiersOf(event)
  return mods.length ? `${mods.join(' + ')} + …` : ''
}

function HotkeyRow({
  hotkey,
  language,
  onChange
}: {
  hotkey: string
  language: Language
  onChange: (accel: string) => Promise<boolean>
}): React.JSX.Element {
  const [recording, setRecording] = useState(false)
  const [preview, setPreview] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!recording) return
    const handler = (event: KeyboardEvent): void => {
      event.preventDefault()
      event.stopPropagation()
      const accel = toAccelerator(event)
      if (!accel) {
        setPreview(modifierPreview(event))
        return
      }
      setPreview(formatHotkey(accel))
      setRecording(false)
      void onChange(accel).then((ok) => {
        setError(ok ? '' : t(language, 'behavior.shortcutTaken'))
      })
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [recording, onChange, language])

  return (
    <div className="cz-setrow cz-setrow--stack">
      <div className="cz-setrow__copy">
        <span className="cz-setrow__name">{t(language, 'behavior.shortcut')}</span>
        <span className="cz-setrow__note">{t(language, 'behavior.shortcutNote')}</span>
      </div>
      <button
        className={`cz-keycap${recording ? ' is-recording' : ''}`}
        type="button"
        onClick={() => {
          setRecording(true)
          setPreview('')
          setError('')
        }}
        aria-label={t(language, 'behavior.shortcut')}
      >
        {recording ? preview || t(language, 'behavior.recording') : formatHotkey(hotkey)}
      </button>
      {error ? <p className="cz-error">{error}</p> : null}
    </div>
  )
}


export function CustomizeSheet({
  theme,
  onChange,
  onClose,
  onReset,
  hotkey,
  onHotkeyChange,
  panelWidth,
  panelHeight,
  maxWidth,
  maxHeight,
  onPanelWidthChange,
  onPanelHeightChange,
  onPanelSizeChange,
  onResetSize,
  side,
  onSideChange,
  edgeGap,
  onEdgeGapChange,
  language,
  onLanguageChange,
  settingsInWindow,
  onSettingsInWindowChange,
  weatherLocation,
  weatherCustom,
  onWeatherLocationChange,
  onWeatherCustomChange,
  networkConsent,
  weatherNetwork,
  onNetworkConsentChange,
  onWeatherNetworkChange,
  monitorIntervalMs,
  onMonitorIntervalChange,
  startAtLogin,
  onStartAtLoginChange,
  autoUpdate,
  onAutoUpdateChange,
  update,
  onCheckUpdate,
  onDownloadUpdate,
  onInstallUpdate,
  onEditLayout,
  onResetLayout,
  layoutMode,
  onLayoutModeChange,
  widgets,
  onToggleWidget,
  version,
  columns,
  standalone = false
}: Props): React.JSX.Element {
  const closeRef = useRef<HTMLButtonElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const [section, setSection] = useState<Section>(() => lastSection ?? 'general')
  const [query, setQuery] = useState('')
  const registry = useWidgetRegistry()
  const [installing, setInstalling] = useState(false)
  const [uninstalling, setUninstalling] = useState<string | null>(null)
  const [installError, setInstallError] = useState('')
  const [diagCopied, setDiagCopied] = useState(false)
  const [associated, setAssociated] = useState(false)
  const [assocBusy, setAssocBusy] = useState(false)
  const [creating, setCreating] = useState(false)
  const [problems, setProblems] = useState<ComponentProblem[]>([])
  const [settingsFor, setSettingsFor] = useState<string | null>(null)
  const [settingsValues, setSettingsValues] = useState<Record<string, unknown>>({})
  const [settingsBusy, setSettingsBusy] = useState(false)
  const [weatherQuery, setWeatherQuery] = useState('')
  const [weatherResults, setWeatherResults] = useState<WeatherGeoResult[]>([])
  const [weatherSearching, setWeatherSearching] = useState(false)
  const [weatherError, setWeatherError] = useState('')
  const [urlValue, setUrlValue] = useState('')
  const [urlBusy, setUrlBusy] = useState(false)
  const [catalog, setCatalog] = useState<CatalogEntry[]>([])
  const [catalogBusy, setCatalogBusy] = useState(false)
  const [catalogError, setCatalogError] = useState('')
  const [catalogLoaded, setCatalogLoaded] = useState(false)
  const [catalogUpdated, setCatalogUpdated] = useState<string | null>(null)
  const [myComponentsOpen, setMyComponentsOpen] = useState(true)
  const [repoOpen, setRepoOpen] = useState(false)
  const [updating, setUpdating] = useState<string | null>(null)

  const loadDiagnostics = async (): Promise<void> => {
    const next = await window.sill?.getComponentDiagnostics?.()
    if (next) setProblems(next.problems)
  }

  useEffect(() => {
    void loadDiagnostics()
    // 修好 skins 里的文件后，诊断列表跟着刷新
    const off = window.sill?.onWidgetsChanged?.(() => void loadDiagnostics())
    return () => off?.()
  }, [])

  useEffect(() => {
    let alive = true
    void window.sill
      ?.getSillAssociation?.()
      .then((value) => {
        if (alive) setAssociated(Boolean(value))
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])
  const activePreset = matchThemePreset(theme)
  const activeSize = matchPreset(panelWidth, panelHeight)
  const searching = query.trim().length > 0
  const searchResults = searching
    ? SEARCH_INDEX.filter((entry) =>
        t(language, entry.labelKey).toLowerCase().includes(query.trim().toLowerCase())
      )
    : []
  const weatherCity = weatherLocation === 'auto' ? null : getWeatherCity(weatherLocation)
  const weatherLabel = weatherCustom
    ? weatherCustom.name
    : weatherCity
      ? weatherCityName(weatherCity, language)
      : t(language, 'weather.auto')

  useEffect(() => {
    const query = weatherQuery.trim()
    if (section !== 'data' || query.length < 2) {
      setWeatherResults([])
      setWeatherError('')
      return
    }
    let alive = true
    const timer = window.setTimeout(() => {
      setWeatherSearching(true)
      setWeatherError('')
      void fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
          query
        )}&count=8&language=${language === 'zh' ? 'zh' : 'en'}&format=json`
      )
        .then((response) =>
          response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))
        )
        .then((raw: unknown) => {
          if (!alive) return
          const results = (raw as { results?: unknown }).results
          setWeatherResults(Array.isArray(results) ? (results as WeatherGeoResult[]).slice(0, 8) : [])
        })
        .catch(() => {
          if (!alive) return
          setWeatherResults([])
          setWeatherError(t(language, 'weather.searchFailed'))
        })
        .finally(() => {
          if (alive) setWeatherSearching(false)
        })
    }, 320)
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [weatherQuery, section, language])

  const selectWeatherPlace = (result: WeatherGeoResult): void => {
    const label = [result.name, result.admin1].filter(Boolean).join(', ').slice(0, 60)
    onWeatherCustomChange({
      name: label || result.name,
      lat: result.latitude,
      lon: result.longitude
    })
    setWeatherQuery('')
    setWeatherResults([])
  }
  // 独立窗口默认用左侧导航；窗口窄到放不下 152 + 可用表单时退回顶部 tab
  const wide = standalone ? window.innerWidth >= 600 : panelWidth >= 620

  const install = async (): Promise<void> => {
    setInstallError('')
    setInstalling(true)
    const result = await window.sill?.installWidget()
    setInstalling(false)
    if (result && !result.ok && result.error !== '已取消') {
      setInstallError(result.error ?? t(language, 'widgets.installFailed'))
    }
    void loadDiagnostics()
  }

  const createComponent = async (): Promise<void> => {
    setInstallError('')
    setCreating(true)
    const result = await window.sill?.createWidget?.()
    setCreating(false)
    if (result && !result.ok && result.error !== '已取消') {
      setInstallError(result.error ?? t(language, 'widgets.createFailed'))
    }
    void loadDiagnostics()
  }

  const revealComponent = (dir: string): void => {
    void window.sill?.revealComponentFolder?.(dir)
  }

  const copyDiagnostics = async (): Promise<void> => {
    const text = await window.sill?.copyDiagnostics?.()
    if (!text) return
    setDiagCopied(true)
    window.setTimeout(() => setDiagCopied(false), 1800)
  }

  const installFromUrl = async (url: string, sha256?: string): Promise<void> => {
    const trimmed = url.trim()
    if (!trimmed) return
    setInstallError('')
    setUrlBusy(true)
    const result = await window.sill?.installWidgetFromUrl?.(trimmed, sha256)
    setUrlBusy(false)
    if (result && !result.ok && result.error !== '已取消') {
      setInstallError(result.error ?? t(language, 'widgets.installFailed'))
    }
    if (result?.ok) setUrlValue('')
    void loadDiagnostics()
  }

  const updateComponent = async (update: CatalogUpdate): Promise<void> => {
    setUpdating(update.id)
    await installFromUrl(update.download, update.sha256)
    setUpdating(null)
    void loadCatalog(true)
  }

  const loadCatalog = async (force = false): Promise<void> => {
    setCatalogBusy(true)
    setCatalogError('')
    const result = await window.sill?.getWidgetCatalog?.(force)
    setCatalogBusy(false)
    setCatalogLoaded(true)
    if (!result) return
    setCatalog(result.entries)
    setCatalogUpdated(result.updated ?? null)
    if (!result.ok) setCatalogError(result.error ?? t(language, 'widgets.catalogFailed'))
  }

  useEffect(() => {
    if (section === 'updates') void loadCatalog(false)
  }, [section])

  const openWidgetSettings = async (id: string): Promise<void> => {
    if (settingsFor === id) {
      setSettingsFor(null)
      return
    }
    setSettingsBusy(true)
    const values = await window.sill?.getWidgetSettings?.(id)
    setSettingsFor(id)
    setSettingsValues(values ?? {})
    setSettingsBusy(false)
  }

  const saveWidgetSetting = async (id: string, key: string, value: unknown): Promise<void> => {
    setSettingsValues((current) => ({ ...current, [key]: value }))
    // 主进程只合并这一个 key，避免闭包里的旧值覆盖别的字段
    const next = await window.sill?.setWidgetSettings?.(id, { [key]: value })
    if (next) setSettingsValues(next)
  }

  const uninstall = async (id: string): Promise<void> => {
    setInstallError('')
    setUninstalling(id)
    const result = await window.sill?.uninstallWidget(id)
    setUninstalling(null)
    if (result && !result.ok) {
      setInstallError(result.error ?? t(language, 'widgets.installFailed'))
    }
    void loadDiagnostics()
  }

  const toggleAssociation = async (): Promise<void> => {
    setAssocBusy(true)
    const result = await window.sill?.setSillAssociation?.(!associated)
    setAssocBusy(false)
    if (result?.ok) setAssociated(Boolean(result.enabled))
    else setInstallError(result?.error ?? t(language, 'widgets.assocFailed'))
  }

  const updateText = ((): string => {
    switch (update.status) {
      case 'checking':
        return t(language, 'general.checking')
      case 'latest':
        return t(language, 'general.upToDate')
      case 'available':
        return `${t(language, 'general.updateAvailable')} v${update.version ?? ''}`
      case 'downloading':
        return `${t(language, 'general.downloading')} v${update.version ?? ''} · ${update.progress ?? 0}%`
      case 'downloaded':
        return `${t(language, 'general.updateReady')} v${update.version ?? ''}`
      case 'unsupported':
        return update.reason === 'portable'
          ? t(language, 'general.updatePortable')
          : t(language, 'general.updateDev')
      case 'error':
        if (update.reason === 'portable') return t(language, 'general.updatePortable')
        if (update.reason === 'dev') return t(language, 'general.updateDev')
        if (update.reason === 'offline') return t(language, 'general.updateOffline')
        return update.reason === 'signature'
          ? t(language, 'general.updateSignature')
          : t(language, 'general.updateFailed')
      default:
        return ''
    }
  })()

  const updateBusy = update.status === 'checking' || update.status === 'downloading'
  const updateAction =
    update.status === 'downloaded'
      ? onInstallUpdate
      : update.status === 'available'
        ? onDownloadUpdate
        : onCheckUpdate
  const updateActionText =
    update.status === 'downloaded'
      ? t(language, 'general.restartUpdate')
      : update.status === 'available'
        ? t(language, 'general.download')
        : update.status === 'checking'
          ? t(language, 'general.checking')
          : update.status === 'downloading'
            ? `${update.progress ?? 0}%`
            : t(language, 'general.checkNow')

  const catalogUpdates = findUpdates(
    registry.installed
      .filter((item) => item.source === 'installed')
      .map((item) => ({ id: item.id, version: item.version })),
    catalog
  )

  // 已安装但还不在布局里的组件也要出现在列表里，否则安装完在设置里找不到。
  const widgetRows = [
    ...widgets,
    ...registry.installed
      .filter((item) => !widgets.some((widget) => widget.id === item.id))
      .map((item) => ({ id: item.id, label: item.name || item.id, hidden: true }))
  ]

  // 仓库只列可安装项；内置卡已经在「我的组件」里，不再重复展示。
  const repoEntries = catalog.filter((entry) => entry.status !== 'builtin')

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true })
  }, [])

  useLayoutEffect(() => {
    const body = bodyRef.current
    if (!body) return
    body.scrollTop = searching ? 0 : (sectionScroll.get(section) ?? 0)
  }, [section, searching])

  useEffect(() => {
    lastSection = section
  }, [section])

  const changeSection = (next: Section): void => {
    if (!searching && bodyRef.current) {
      sectionScroll.set(section, bodyRef.current.scrollTop)
    }
    setSection(next)
    setQuery('')
  }

  const rememberScroll = (event: React.UIEvent<HTMLDivElement>): void => {
    if (!searching) sectionScroll.set(section, event.currentTarget.scrollTop)
  }

  return (
    <section
      className="cz-sheet"
      data-wide={wide}
      data-standalone={standalone ? 'true' : undefined}
      role="dialog"
      aria-label={t(language, 'settings.title')}
      aria-modal={standalone ? undefined : true}
    >
      <header className="cz-head">
        <div>
          <div className="cap">{t(language, 'settings.title')}</div>
          <h2 className="cz-title">{t(language, 'settings.tagline')}</h2>
        </div>
        <button
          className="iconbtn"
          type="button"
          aria-label={t(language, 'settings.title')}
          title={t(language, 'settings.title')}
          onClick={onClose}
          ref={closeRef}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="m4.2 4.2 7.6 7.6M11.8 4.2l-7.6 7.6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.35"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </header>

      <div className="cz-tabs" role="tablist" aria-label={t(language, 'settings.title')}>
        <label className="cz-search">
          <input
            className="cz-input cz-search__input"
            type="search"
            value={query}
            placeholder={t(language, 'settings.searchPlaceholder')}
            aria-label={t(language, 'settings.searchPlaceholder')}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </label>
        {SECTIONS.map((id) => (
          <button
            key={id}
            className="cz-tab"
            type="button"
            role="tab"
            aria-selected={section === id}
            onClick={() => {
              changeSection(id)
            }}
          >
            {t(language, `tab.${id}`)}
          </button>
        ))}
      </div>

      <div className="cz-body" key={section} ref={bodyRef} onScroll={rememberScroll}>
        {searching ? (
          <div className="cz-search-results">
            {searchResults.map((entry) => (
              <button
                key={`${entry.section}:${entry.labelKey}`}
                className="cz-search-result"
                type="button"
                onClick={() => {
                  changeSection(entry.section)
                }}
              >
                <span className="cz-search-result__name">{t(language, entry.labelKey)}</span>
                <span className="cz-search-result__section">
                  {t(language, `tab.${entry.section}`)}
                </span>
              </button>
            ))}
            {!searchResults.length ? (
              <p className="cz-note">{t(language, 'settings.searchEmpty')}</p>
            ) : null}
          </div>
        ) : null}
        {!searching && section === 'appearance' ? (
          <>
            <p className="cz-group">{t(language, 'appearance.theme')}</p>
            <p className="cz-label">{t(language, 'appearance.presets')}</p>
            <div className="cz-grid" role="group" aria-label={t(language, 'appearance.presets')}>
              {PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  className="cz-preset"
                  type="button"
                  data-atmo={preset.atmo}
                  aria-pressed={activePreset?.id === preset.id}
                  aria-label={`${preset.name} theme`}
                  title={preset.name}
                  style={
                    {
                      '--hue': preset.hue,
                      '--tint-s': `${preset.tint}%`
                    } as React.CSSProperties
                  }
                  onClick={() => onChange(presetPatch(preset))}
                >
                  <span className="cz-scene" aria-hidden="true" />
                  <span className="cz-preset__name">{preset.name}</span>
                </button>
              ))}
            </div>

            <p className="cz-label cz-label--spaced">{t(language, 'appearance.accent')}</p>
            <div className="cz-swatches" role="group" aria-label={t(language, 'appearance.accent')}>
              {ACCENT_SWATCHES.map((accent) => (
                <button
                  key={accent.name}
                  className="cz-swatch"
                  type="button"
                  aria-pressed={theme.accentHue === accent.hue}
                  aria-label={`${accent.name} accent`}
                  title={accent.name}
                  style={{ '--sw': `hsl(${accent.hue} 84% 64%)` } as React.CSSProperties}
                  onClick={() => onChange({ accentHue: accent.hue })}
                />
              ))}
            </div>

            <p className="cz-group">{t(language, 'appearance.glass')}</p>
              <Switch
                id="cz-atmosphere"
                label={t(language, 'theme.atmosphere')}
                note={t(language, 'theme.atmosphereNote')}
                checked={theme.atmosphere}
                onChange={(value) => onChange({ atmosphere: value })}
              />
              <div
                className={`cz-grid cz-atmo-grid${theme.atmosphere ? '' : ' is-disabled'}`}
                role="group"
                aria-label={t(language, 'theme.atmosphere')}
              >
                {ATMO_STYLES.map((style) => (
                  <button
                    key={style}
                    className="cz-atmo"
                    type="button"
                    data-atmo={style}
                    aria-pressed={theme.atmoStyle === style}
                    aria-label={`${style} atmosphere`}
                    title={style}
                    onClick={() => onChange({ atmoStyle: style })}
                  >
                    <span className="cz-scene" aria-hidden="true" />
                    <span className="cz-atmo__name">{style.charAt(0).toUpperCase() + style.slice(1)}</span>
                  </button>
                ))}
              </div>
              <Slider
                id="cz-atmo-strength"
                label={t(language, 'theme.intensity')}
                value={theme.atmoStrength}
                min={0}
                max={100}
                suffix="%"
                disabled={!theme.atmosphere}
                onChange={(value) => onChange({ atmoStrength: value })}
              />
              <Slider
                id="cz-hue"
                label={t(language, 'theme.hue')}
                value={theme.hue}
                min={0}
                max={359}
                suffix="°"
                hue
                thumb={`hsl(${theme.hue} 86% 68%)`}
                onChange={(value) => onChange({ hue: value })}
              />
              <Slider
                id="cz-tint"
                label={t(language, 'theme.tint')}
                value={theme.tintSat}
                min={0}
                max={60}
                suffix="%"
                onChange={(value) => onChange({ tintSat: value })}
              />
              <Slider
                id="cz-opacity"
                label={t(language, 'theme.opacity')}
                value={theme.glassOpacity}
                min={30}
                max={100}
                suffix="%"
                onChange={(value) => onChange({ glassOpacity: value })}
              />
              <Switch
                id="cz-halo"
                label={t(language, 'theme.halo')}
                note={t(language, 'theme.haloNote')}
                checked={theme.halo}
                onChange={(value) => onChange({ halo: value })}
              />
              <Slider
                id="cz-halo-strength"
                label={t(language, 'theme.haloStrength')}
                value={theme.haloStrength}
                min={0}
                max={100}
                suffix="%"
                disabled={!theme.halo}
                onChange={(value) => onChange({ haloStrength: value })}
              />
              <Switch
                id="cz-grain"
                label={t(language, 'theme.grain')}
                note={t(language, 'theme.grainNote')}
                checked={theme.grain}
                onChange={(value) => onChange({ grain: value })}
              />

            <p className="cz-note">{t(language, 'appearance.note')}</p>

            <div className="cz-setrow">
              <div className="cz-setrow__copy">
                <span className="cz-setrow__name">
                  {t(language, 'appearance.resetAppearance')}
                </span>
              </div>
              <button className="cz-action" type="button" onClick={onReset}>
                {t(language, 'footer.reset')}
              </button>
            </div>
          </>
        ) : null}

        {!searching && section === 'panel' ? (
          <>
            <p className="cz-group">{t(language, 'panel.sizeGroup')}</p>

            <div className="cz-setrow cz-setrow--stack">
              <div className="cz-setrow__copy">
                <span className="cz-setrow__name">{t(language, 'behavior.shape')}</span>
                <span className="cz-setrow__note">{t(language, 'behavior.shapeNote')}</span>
              </div>
              <div className="cz-sizepresets" role="group" aria-label={t(language, 'behavior.shape')}>
                {PANEL_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className="cz-sizepreset"
                    aria-pressed={activeSize?.id === preset.id}
                    onClick={() => onPanelSizeChange(preset.width, preset.height)}
                  >
                    <span>{t(language, `shape.${preset.id}`)}</span>
                    <em>
                      {preset.height === 0
                        ? `${preset.width} × ${t(language, 'size.fill')}`
                        : `${preset.width} × ${preset.height}`}
                    </em>
                  </button>
                ))}
              </div>
              <div className="cz-size-meta">
                <span>
                  {panelWidth} × {panelHeight === 0 ? maxHeight : panelHeight}px · {columns}{' '}
                  {t(language, 'size.columns')}
                </span>
                <button className="cz-mini" type="button" onClick={onResetSize}>
                  {t(language, 'size.reset')}
                </button>
              </div>
            </div>

            <Slider
              id="cz-panel-width"
              label={t(language, 'size.width')}
              value={panelWidth}
              min={PANEL_MIN_WIDTH}
              max={maxWidth}
              suffix="px"
              onChange={onPanelWidthChange}
            />

            <Slider
              id="cz-panel-height"
              label={t(language, 'size.height')}
              value={panelHeight === 0 ? maxHeight : panelHeight}
              min={PANEL_MIN_HEIGHT}
              max={maxHeight}
              suffix="px"
              disabled={panelHeight === 0}
              onChange={onPanelHeightChange}
            />

            <Switch
              id="cz-panel-auto"
              label={t(language, 'size.auto')}
              note={t(language, 'size.autoNote')}
              checked={panelHeight === 0}
              onChange={(value) =>
                // 关闭「撑满高度」时用面板工作区的实际上限，而不是当前窗口高度：
                // 独立设置窗口里的 window.innerHeight 是设置窗自己的高度。
                onPanelHeightChange(value ? 0 : Math.max(PANEL_MIN_HEIGHT, maxHeight))
              }
            />

            <p className="cz-note">{t(language, 'size.hint')}</p>

            <p className="cz-group">{t(language, 'panel.positionGroup')}</p>

            <div className="cz-setrow">
              <div className="cz-setrow__copy">
                <span className="cz-setrow__name">{t(language, 'behavior.dock')}</span>
                <span className="cz-setrow__note">{t(language, 'behavior.dockNote')}</span>
              </div>
              <div className="cz-seg" role="group" aria-label={t(language, 'behavior.dock')}>
                <button
                  type="button"
                  aria-pressed={side === 'left'}
                  onClick={() => onSideChange('left')}
                >
                  {t(language, 'behavior.left')}
                </button>
                <button
                  type="button"
                  aria-pressed={side === 'right'}
                  onClick={() => onSideChange('right')}
                >
                  {t(language, 'behavior.right')}
                </button>
              </div>
            </div>

            <Slider
              id="cz-edge"
              label={t(language, 'behavior.edge')}
              value={edgeGap}
              min={0}
              max={80}
              suffix="px"
              onChange={onEdgeGapChange}
            />
            <p className="cz-note">{t(language, 'behavior.edgeNote')}</p>

            <p className="cz-group">{t(language, 'panel.cardsGroup')}</p>

            <div className="cz-setrow">
              <div className="cz-setrow__copy">
                <span className="cz-setrow__name">{t(language, 'behavior.layout')}</span>
                <span className="cz-setrow__note">{t(language, 'behavior.layoutNote')}</span>
              </div>
              <button className="cz-action" type="button" onClick={onEditLayout}>
                {t(language, 'behavior.editLayout')}
              </button>
            </div>

            <div className="cz-setrow">
              <div className="cz-setrow__copy">
                <span className="cz-setrow__name">{t(language, 'behavior.layoutMode')}</span>
                <span className="cz-setrow__note">
                  {t(language, 'behavior.layoutModeNote')}
                </span>
              </div>
              <div className="cz-seg" role="group" aria-label={t(language, 'behavior.layoutMode')}>
                <button
                  type="button"
                  aria-pressed={layoutMode === 'free'}
                  onClick={() => onLayoutModeChange('free')}
                >
                  {t(language, 'behavior.layoutFree')}
                </button>
                <button
                  type="button"
                  aria-pressed={layoutMode === 'flow'}
                  onClick={() => onLayoutModeChange('flow')}
                >
                  {t(language, 'behavior.layoutFlow')}
                </button>
              </div>
            </div>

            <div className="cz-setrow">
              <div className="cz-setrow__copy">
                <span className="cz-setrow__name">{t(language, 'panel.resetLayout')}</span>
              </div>
              <button className="cz-action" type="button" onClick={onResetLayout}>
                {t(language, 'footer.reset')}
              </button>
            </div>

          </>
        ) : null}

        {!searching && section === 'widgets' ? (
          <>
            <Fold
              id="cz-my-components"
              title={t(language, 'widgets.myComponents')}
              count={widgetRows.length}
              open={myComponentsOpen}
              onToggle={() => setMyComponentsOpen((value) => !value)}
            >
              <p className="cz-note" style={{ margin: '0 2px 6px' }}>
                {t(language, 'widgets.visibilityNote')}
              </p>

              {widgetRows.map((widget) => {
              const installed = registry.installed.find((item) => item.id === widget.id)
              const tierKey: TranslationKey | null = installed
                ? installed.tier === 'static'
                  ? 'widgets.tier.static'
                  : installed.tier === 'script'
                    ? 'widgets.tier.script'
                    : installed.tier === 'isolated'
                      ? 'widgets.tier.isolated'
                      : 'widgets.tier.node'
                : null
              return (
                <div className="cz-widget" key={widget.id}>
                  <Switch
                    id={`cz-widget-${widget.id}`}
                    label={widget.label}
                    note={
                      installed
                        ? `${installed.id} · v${installed.version} · ${t(language, tierKey!)}`
                        : ''
                    }
                    checked={!widget.hidden}
                    onChange={(value) => onToggleWidget(widget.id, value)}
                  />
                  {installed ? (
                    <div className="cz-widget__meta">
                      <span className="cz-widget__permissions">
                        {installed.permissions.join(' / ') || '—'}
                      </span>
                      <span className="cz-widget-actions">
                        {installed.settings.length ? (
                          <button
                            className="cz-action"
                            type="button"
                            disabled={settingsBusy}
                            onClick={() => void openWidgetSettings(installed.id)}
                          >
                            {t(
                              language,
                              settingsFor === installed.id
                                ? 'widgets.settingsClose'
                                : 'widgets.settings'
                            )}
                          </button>
                        ) : null}
                        <button
                          className="cz-action"
                          type="button"
                          disabled={uninstalling === installed.id}
                          onClick={() => void uninstall(installed.id)}
                        >
                          {uninstalling === installed.id
                            ? '…'
                            : t(language, 'widgets.uninstall')}
                        </button>
                      </span>
                    </div>
                  ) : null}

                  {installed && settingsFor === installed.id && installed.settings.length ? (
                    <div className="cz-settings">
                      {installed.settings.map((field) =>
                        field.type === 'switch' ? (
                          <Switch
                            key={field.key}
                            id={`cz-set-${installed.id}-${field.key}`}
                            label={settingText(field.label, language, field.key)}
                            note={
                              field.description
                                ? settingText(field.description, language, '')
                                : ''
                            }
                            checked={settingsValues[field.key] === true}
                            onChange={(value) =>
                              void saveWidgetSetting(installed.id, field.key, value)
                            }
                          />
                        ) : (
                          <div className="cz-setrow" key={field.key}>
                            <div className="cz-setrow__copy">
                              <span className="cz-setrow__name">
                                {settingText(field.label, language, field.key)}
                              </span>
                              {field.description ? (
                                <span className="cz-setrow__note">
                                  {settingText(field.description, language, '')}
                                </span>
                              ) : null}
                            </div>
                            {field.type === 'select' ? (
                              <div className="cz-seg">
                                {(field.options ?? []).map((option) => (
                                  <button
                                    key={option.value}
                                    type="button"
                                    aria-pressed={settingsValues[field.key] === option.value}
                                    onClick={() =>
                                      void saveWidgetSetting(
                                        installed.id,
                                        field.key,
                                        option.value
                                      )
                                    }
                                  >
                                    {settingText(option.label, language, option.value)}
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <input
                                className="cz-input"
                                type={field.type === 'number' ? 'number' : 'text'}
                                value={String(settingsValues[field.key] ?? '')}
                                placeholder={field.placeholder}
                                min={field.min}
                                max={field.max}
                                onChange={(event) =>
                                  setSettingsValues((current) => ({
                                    ...current,
                                    [field.key]:
                                      field.type === 'number'
                                        ? Number(event.target.value)
                                        : event.target.value
                                  }))
                                }
                                onBlur={(event) =>
                                  void saveWidgetSetting(
                                    installed.id,
                                    field.key,
                                    field.type === 'number'
                                      ? Number(event.target.value)
                                      : event.target.value
                                  )
                                }
                              />
                            )}
                          </div>
                        )
                      )}
                    </div>
                  ) : null}
                </div>
              )
            })}

            {problems.length ? (
              <>
                <p className="cz-group">{t(language, 'widgets.problems')}</p>
                <p className="cz-note" style={{ margin: '0 2px 6px' }}>
                  {t(language, 'widgets.problemsNote')}
                </p>
                {problems.map((problem) => (
                  <div className="cz-setrow" key={`${problem.source}:${problem.dir}`}>
                    <div className="cz-setrow__copy">
                      <span className="cz-setrow__name">{problem.folder}</span>
                      <span className="cz-setrow__note">{problem.error}</span>
                    </div>
                    <button
                      className="cz-action"
                      type="button"
                      onClick={() => revealComponent(problem.dir)}
                    >
                      {t(language, 'widgets.reveal')}
                    </button>
                  </div>
                ))}
              </>
            ) : null}
            </Fold>

            <Fold
              id="cz-repos"
              title={t(language, 'widgets.repos')}
              count={catalogLoaded ? 1 : undefined}
              open={repoOpen}
              onToggle={() => {
                if (!repoOpen && !catalogLoaded) void loadCatalog(false)
                setRepoOpen((value) => !value)
              }}
            >
              <p className="cz-note" style={{ margin: '0 2px 6px' }}>
                {t(language, 'widgets.repoOfficialNote')}
              </p>
              <div className="cz-setrow">
                <div className="cz-setrow__copy">
                  <span className="cz-setrow__name">{t(language, 'widgets.repoOfficial')}</span>
                  <span className="cz-setrow__note">
                    {catalogUpdated
                      ? `${t(language, 'widgets.repoUpdated')} ${new Date(
                          catalogUpdated
                        ).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-GB')}`
                      : t(language, 'widgets.repoOfficialNote')}
                  </span>
                </div>
                <button
                  className="cz-action"
                  type="button"
                  disabled={catalogBusy}
                  onClick={() => void loadCatalog(true)}
                >
                  {catalogBusy
                    ? '…'
                    : catalogLoaded
                      ? t(language, 'widgets.catalogRefresh')
                      : t(language, 'widgets.repoBrowse')}
                </button>
              </div>

              {catalogBusy ? (
                <p className="cz-note">{t(language, 'widgets.repoLoading')}</p>
              ) : null}
              {catalogError ? <p className="cz-error">{catalogError}</p> : null}
              {catalogLoaded && repoEntries.length ? (
                <ul className="cz-catalog">
                  {repoEntries.map((entry) => {
                    const installed = registry.installed.some((item) => item.id === entry.id)
                    return (
                      <li className="cz-setrow" key={entry.id}>
                        <div className="cz-setrow__copy">
                          <span className="cz-setrow__name">
                            {pickLocalized(entry.name, language)}
                          </span>
                          <span className="cz-setrow__note">
                            {entry.id} · v{entry.version} ·{' '}
                            {entry.status === 'builtin'
                              ? t(language, 'widgets.catalogBuiltin')
                              : entry.status}
                            {pickLocalized(entry.summary, language)
                              ? ` — ${pickLocalized(entry.summary, language)}`
                              : ''}
                          </span>
                        </div>
                        {installed ? (
                          <span className="cz-installed">
                            {t(language, 'widgets.installedBadge')}
                          </span>
                        ) : entry.installable && entry.download ? (
                          <button
                            className="cz-action"
                            type="button"
                            disabled={urlBusy}
                            onClick={() => void installFromUrl(entry.download!, entry.sha256)}
                          >
                            {urlBusy ? '…' : t(language, 'widgets.catalogInstall')}
                          </button>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              ) : null}
              {catalogLoaded && !repoEntries.length && !catalogError && !catalogBusy ? (
                <p className="cz-note">{t(language, 'widgets.catalogEmpty')}</p>
              ) : null}

              <div className="cz-setrow">
                <div className="cz-setrow__copy">
                  <span className="cz-setrow__name">{t(language, 'widgets.repoAdd')}</span>
                  <span className="cz-setrow__note">{t(language, 'widgets.repoAddNote')}</span>
                </div>
                <button className="cz-action" type="button" disabled>
                  {t(language, 'widgets.repoAdd')}
                </button>
              </div>
            </Fold>

            <p className="cz-group">{t(language, 'widgets.get')}</p>

            <div className="cz-setrow">
              <div className="cz-setrow__copy">
                <span className="cz-setrow__name">{t(language, 'widgets.installWidget')}</span>
                <span className="cz-setrow__note">{t(language, 'widgets.installNote')}</span>
              </div>
              <button
                className="cz-action"
                type="button"
                disabled={installing}
                onClick={() => void install()}
              >
                {installing ? '…' : t(language, 'widgets.installAction')}
              </button>
            </div>

            <div className="cz-setrow">
              <div className="cz-setrow__copy">
                <span className="cz-setrow__name">{t(language, 'widgets.installUrl')}</span>
                <span className="cz-setrow__note">{t(language, 'widgets.installUrlNote')}</span>
              </div>
              <span className="cz-url">
                <input
                  className="cz-input"
                  type="url"
                  value={urlValue}
                  placeholder="https://example.com/clock.sill"
                  onChange={(event) => setUrlValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void installFromUrl(urlValue)
                  }}
                />
                <button
                  className="cz-action"
                  type="button"
                  disabled={urlBusy || !urlValue.trim()}
                  onClick={() => void installFromUrl(urlValue)}
                >
                  {urlBusy ? '…' : t(language, 'widgets.installUrlAction')}
                </button>
              </span>
            </div>

            {installError ? <p className="cz-error">{installError}</p> : null}

            <p className="cz-group">{t(language, 'widgets.developer')}</p>

            <div className="cz-setrow">
              <div className="cz-setrow__copy">
                <span className="cz-setrow__name">{t(language, 'widgets.create')}</span>
                <span className="cz-setrow__note">{t(language, 'widgets.createNote')}</span>
              </div>
              <button
                className="cz-action"
                type="button"
                disabled={creating}
                onClick={() => void createComponent()}
              >
                {creating ? '…' : t(language, 'widgets.createAction')}
              </button>
            </div>

            <div className="cz-setrow">
              <div className="cz-setrow__copy">
                <span className="cz-setrow__name">{t(language, 'widgets.skinsFolder')}</span>
                <span className="cz-setrow__note">{t(language, 'widgets.skinsFolderNote')}</span>
              </div>
              <button
                className="cz-action"
                type="button"
                onClick={() => void window.sill?.openSkinsFolder()}
              >
                {t(language, 'widgets.openSkinsFolder')}
              </button>
            </div>
          </>
        ) : null}

        {!searching && section === 'data' ? (
          <>
            <p className="cz-group">{t(language, 'general.monitoring')}</p>
            <div className="cz-setrow cz-setrow--stack">
              <div className="cz-setrow__copy">
                <span className="cz-setrow__name">{t(language, 'general.refresh')}</span>
                <span className="cz-setrow__note">{t(language, 'general.refreshNote')}</span>
              </div>
              <div
                className="cz-seg cz-seg--four"
                role="group"
                aria-label={t(language, 'general.refresh')}
              >
                {MONITOR_INTERVALS.map((interval) => (
                  <button
                    key={interval}
                    type="button"
                    aria-pressed={monitorIntervalMs === interval}
                    onClick={() => onMonitorIntervalChange(interval)}
                  >
                    {interval / 1000}s
                  </button>
                ))}
              </div>
              <p className="cz-note">{t(language, 'general.refreshHint')}</p>
            </div>

            <p className="cz-group">{t(language, 'weather.group')}</p>
            <Switch
              id="cz-network-consent"
              label={t(language, 'privacy.networkToggle')}
              note={t(language, 'privacy.networkToggleNote')}
              checked={networkConsent}
              onChange={onNetworkConsentChange}
            />
            <Switch
              id="cz-weather-network"
              label={t(language, 'weather.network')}
              note={t(language, 'weather.networkNote')}
              checked={networkConsent && weatherNetwork}
              onChange={onWeatherNetworkChange}
            />
            <div className="cz-field">
              <div className="cz-field__head">
                <label className="cz-field__name" htmlFor="cz-weather-search">
                  {t(language, 'weather.location')}
                </label>
                <span className="cz-field__value">{weatherLabel}</span>
              </div>

              <div className="cz-weather-actions">
                <button
                  className="cz-action"
                  type="button"
                  aria-pressed={!weatherCustom && weatherLocation === 'auto'}
                  onClick={() => {
                    onWeatherLocationChange('auto')
                    void window.sill?.refreshWeather()
                  }}
                >
                  {t(language, 'weather.auto')}
                </button>
              </div>

              <input
                id="cz-weather-search"
                className="cz-input cz-weather-search"
                type="search"
                value={weatherQuery}
                placeholder={t(language, 'weather.searchPlaceholder')}
                onChange={(event) => setWeatherQuery(event.currentTarget.value)}
              />

              {weatherSearching ? (
                <p className="cz-note">{t(language, 'weather.searching')}</p>
              ) : null}
              {weatherError ? <p className="cz-error">{weatherError}</p> : null}

              {weatherResults.length ? (
                <div className="cz-weather-results">
                  {weatherResults.map((result) => (
                    <button
                      key={`${result.id ?? result.name}:${result.latitude}:${result.longitude}`}
                      className="cz-weather-result"
                      type="button"
                      onClick={() => selectWeatherPlace(result)}
                    >
                      <span className="cz-weather-result__name">{result.name}</span>
                      <span className="cz-weather-result__meta">
                        {[result.admin1, result.country].filter(Boolean).join(' · ')}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="cz-chips">
                {WEATHER_CITIES.slice(0, 8).map((city) => (
                  <button
                    key={city.id}
                    className="cz-chip"
                    type="button"
                    aria-pressed={!weatherCustom && weatherLocation === city.id}
                    onClick={() => onWeatherLocationChange(city.id)}
                  >
                    {weatherCityName(city, language)}
                  </button>
                ))}
              </div>

              <p className="cz-note">
                {weatherCustom
                  ? t(language, 'weather.customNote')
                  : weatherLocation === 'auto'
                    ? t(language, 'weather.autoNote')
                    : t(language, 'weather.locationNote')}
              </p>
              <p className="cz-note">{t(language, 'weather.credit')}</p>
            </div>
          </>
        ) : null}

        {!searching && section === 'general' ? (
          <>
            <p className="cz-group">{t(language, 'general.interface')}</p>
            <div className="cz-setrow">
              <div className="cz-setrow__copy">
                <span className="cz-setrow__name">{t(language, 'general.language')}</span>
                <span className="cz-setrow__note">{t(language, 'general.languageNote')}</span>
              </div>
              <div className="cz-seg" role="group" aria-label={t(language, 'general.language')}>
                {LANGUAGES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={language === item.id}
                    onClick={() => onLanguageChange(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <Switch
              id="cz-settings-window"
              label={t(language, 'general.settingsWindow')}
              note={t(language, 'general.settingsWindowNote')}
              checked={settingsInWindow}
              onChange={onSettingsInWindowChange}
            />

            <p className="cz-group">{t(language, 'general.startupGroup')}</p>
            <Switch
              id="cz-autostart"
              label={t(language, 'behavior.startup')}
              note={t(language, 'behavior.startupNote')}
              checked={startAtLogin}
              onChange={onStartAtLoginChange}
            />

            <p className="cz-group">{t(language, 'general.shortcutGroup')}</p>
            <HotkeyRow hotkey={hotkey} language={language} onChange={onHotkeyChange} />

            <p className="cz-group">{t(language, 'general.diagnostics')}</p>
            <div className="cz-setrow">
              <div className="cz-setrow__copy">
                <span className="cz-setrow__name">{t(language, 'general.diagnostics')}</span>
                <span className="cz-setrow__note">{t(language, 'general.diagnosticsNote')}</span>
              </div>
              <button className="cz-action" type="button" onClick={() => void copyDiagnostics()}>
                {diagCopied ? t(language, 'general.copied') : t(language, 'general.copy')}
              </button>
            </div>
          </>
        ) : null}

        {!searching && section === 'updates' ? (
          <>
            <p className="cz-group">{t(language, 'updates.app')}</p>
            <Switch
              id="cz-auto-update"
              label={t(language, 'general.autoUpdate')}
              note={t(language, 'general.autoUpdateNote')}
              checked={autoUpdate}
              onChange={onAutoUpdateChange}
            />
            <div className="cz-setrow">
              <div className="cz-setrow__copy">
                <span className="cz-setrow__name">{t(language, 'general.updateStatus')}</span>
                <span className="cz-setrow__note">{updateText || '—'}</span>
              </div>
              <button
                className="cz-action"
                type="button"
                onClick={updateAction}
                disabled={updateBusy || update.status === 'unsupported'}
              >
                {update.status === 'unsupported'
                  ? t(language, 'general.unavailable')
                  : updateActionText}
              </button>
            </div>
            <p className="cz-note">{t(language, 'general.updateHint')}</p>

            <p className="cz-group">{t(language, 'updates.components')}</p>
            <div className="cz-setrow">
              <div className="cz-setrow__copy">
                <span className="cz-setrow__name">{t(language, 'widgets.catalog')}</span>
                <span className="cz-setrow__note">{t(language, 'widgets.catalogNote')}</span>
              </div>
              <button
                className="cz-action"
                type="button"
                disabled={catalogBusy}
                onClick={() => void loadCatalog(true)}
              >
                {catalogBusy ? '…' : t(language, 'widgets.catalogRefresh')}
              </button>
            </div>
            {catalogUpdates.length ? (
              catalogUpdates.map((update) => (
                <div className="cz-setrow" key={update.id}>
                  <div className="cz-setrow__copy">
                    <span className="cz-setrow__name">
                      {pickLocalized(update.name, language)}
                    </span>
                    <span className="cz-setrow__note">
                      v{update.from} → v{update.to}
                    </span>
                  </div>
                  <button
                    className="cz-action"
                    type="button"
                    disabled={urlBusy || updating === update.id}
                    onClick={() => void updateComponent(update)}
                  >
                    {updating === update.id ? '…' : t(language, 'widgets.update')}
                  </button>
                </div>
              ))
            ) : (
              <p className="cz-note">{t(language, 'updates.componentsEmpty')}</p>
            )}
            {catalogError ? <p className="cz-error">{catalogError}</p> : null}
          </>
        ) : null}

        {!searching && section === 'advanced' ? (
          <>
            <p className="cz-group">{t(language, 'advanced.integration')}</p>
            <div className="cz-setrow">
              <div className="cz-setrow__copy">
                <span className="cz-setrow__name">{t(language, 'widgets.assoc')}</span>
                <span className="cz-setrow__note">
                  {t(language, associated ? 'widgets.assocOn' : 'widgets.assocOff')}
                </span>
              </div>
              <button
                className="cz-action"
                type="button"
                disabled={assocBusy}
                onClick={() => void toggleAssociation()}
              >
                {assocBusy
                  ? '…'
                  : t(language, associated ? 'widgets.assocUnregister' : 'widgets.assocRegister')}
              </button>
            </div>

            <p className="cz-group">{t(language, 'advanced.folders')}</p>
            <UninstallSection language={language} part="data" />

            <p className="cz-group">{t(language, 'advanced.danger')}</p>
            <UninstallSection language={language} part="uninstall" />
          </>
        ) : null}

        {!searching && section === 'about' ? (
          <>
            <p className="cz-group">{t(language, 'general.about')}</p>
            <div className="cz-setrow">
              <div className="cz-setrow__copy">
                <span className="cz-setrow__name">{t(language, 'general.version')}</span>
                <span className="cz-setrow__note">sill</span>
              </div>
              <span className="cz-version">{version || '0.1.0'}</span>
            </div>

            <p className="cz-group">{t(language, 'about.links')}</p>
            <div className="cz-links">
              <a
                className="cz-link"
                href="https://github.com/Enkrid-Rao/sill"
                target="_blank"
                rel="noreferrer"
              >
                GitHub
              </a>
              <a
                className="cz-link"
                href="https://github.com/Enkrid-Rao/sill-components"
                target="_blank"
                rel="noreferrer"
              >
                Sill Components
              </a>
              <a
                className="cz-link"
                href="https://github.com/Enkrid-Rao/sill/blob/main/PRIVACY.md"
                target="_blank"
                rel="noreferrer"
              >
                {t(language, 'about.privacy')}
              </a>
              <a
                className="cz-link"
                href="https://github.com/Enkrid-Rao/sill/blob/main/THIRD-PARTY.md"
                target="_blank"
                rel="noreferrer"
              >
                {t(language, 'about.thirdParty')}
              </a>
              <a
                className="cz-link"
                href="https://github.com/Enkrid-Rao/sill/blob/main/LICENSE"
                target="_blank"
                rel="noreferrer"
              >
                MIT License
              </a>
            </div>

            <p className="cz-group">{t(language, 'about.credits')}</p>
            <p className="cz-note">Open-Meteo · LRCLIB · Instrument Sans / Instrument Serif</p>
          </>
        ) : null}
      </div>

      <footer className="cz-foot">
        <span className="cz-dot" aria-hidden="true" />
        {t(language, 'settings.saved')}
      </footer>
    </section>
  )
}
