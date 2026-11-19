import { useEffect, useRef, useState } from 'react'
import { MONITOR_INTERVALS } from '../../../shared/data'
import { LANGUAGES, t, type Language } from '../../../shared/i18n'
import {
  getWeatherCity,
  WEATHER_CITIES,
  weatherCityName
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

type Tab = 'appearance' | 'panel' | 'widgets' | 'data' | 'general'

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
  onWeatherLocationChange: (value: string) => void
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

/** 数据位置 + 卸载入口。两种发布形态的行为不同，全部由主进程的 UninstallInfo 决定。 */
function UninstallSection({ language }: { language: Language }): React.JSX.Element {
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
      <p className="cz-group">{t(language, 'general.dataUninstall')}</p>

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

function Details({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <div className={`cz-details${open ? ' is-open' : ''}`}>
      <button
        className="cz-details__head"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{label}</span>
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
      {open ? <div className="cz-details__body">{children}</div> : null}
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
  onWeatherLocationChange,
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
  layoutMode,
  onLayoutModeChange,
  widgets,
  onToggleWidget,
  version,
  columns,
  standalone = false
}: Props): React.JSX.Element {
  const closeRef = useRef<HTMLButtonElement>(null)
  const [tab, setTab] = useState<Tab>('appearance')
  const registry = useWidgetRegistry()
  const [installing, setInstalling] = useState(false)
  const [uninstalling, setUninstalling] = useState<string | null>(null)
  const [installError, setInstallError] = useState('')
  const [associated, setAssociated] = useState(false)
  const [assocBusy, setAssocBusy] = useState(false)
  const [creating, setCreating] = useState(false)
  const [problems, setProblems] = useState<ComponentProblem[]>([])
  const [settingsFor, setSettingsFor] = useState<string | null>(null)
  const [settingsValues, setSettingsValues] = useState<Record<string, unknown>>({})
  const [settingsBusy, setSettingsBusy] = useState(false)
  const [urlValue, setUrlValue] = useState('')
  const [urlBusy, setUrlBusy] = useState(false)
  const [catalog, setCatalog] = useState<CatalogEntry[]>([])
  const [catalogBusy, setCatalogBusy] = useState(false)
  const [catalogError, setCatalogError] = useState('')
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
  const weatherCity = weatherLocation === 'auto' ? null : getWeatherCity(weatherLocation)
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

  const installFromUrl = async (url: string): Promise<void> => {
    const trimmed = url.trim()
    if (!trimmed) return
    setInstallError('')
    setUrlBusy(true)
    const result = await window.sill?.installWidgetFromUrl?.(trimmed)
    setUrlBusy(false)
    if (result && !result.ok && result.error !== '已取消') {
      setInstallError(result.error ?? t(language, 'widgets.installFailed'))
    }
    if (result?.ok) setUrlValue('')
    void loadDiagnostics()
  }

  const updateComponent = async (update: CatalogUpdate): Promise<void> => {
    setUpdating(update.id)
    await installFromUrl(update.download)
    setUpdating(null)
    void loadCatalog(true)
  }

  const loadCatalog = async (force = false): Promise<void> => {
    setCatalogBusy(true)
    setCatalogError('')
    const result = await window.sill?.getWidgetCatalog?.(force)
    setCatalogBusy(false)
    if (!result) return
    setCatalog(result.entries)
    if (!result.ok) setCatalogError(result.error ?? t(language, 'widgets.catalogFailed'))
  }

  useEffect(() => {
    if (tab === 'widgets') void loadCatalog(false)
  }, [tab])

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

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true })
  }, [])

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
        {(['appearance', 'panel', 'widgets', 'data', 'general'] as const).map((id) => (
          <button
            key={id}
            className="cz-tab"
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
          >
            {t(language, `tab.${id}`)}
          </button>
        ))}
      </div>

      <div className="cz-body" key={tab}>
        {tab === 'appearance' ? (
          <>
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

            <Details label={t(language, 'appearance.details')}>
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
            </Details>

            <p className="cz-note">{t(language, 'appearance.note')}</p>
          </>
        ) : null}

        {tab === 'panel' ? (
          <>
            <p className="cz-group">{t(language, 'behavior.panel')}</p>
            <HotkeyRow hotkey={hotkey} language={language} onChange={onHotkeyChange} />

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

            <Slider
              id="cz-edge"
              label={t(language, 'behavior.edge')}
              value={edgeGap}
              min={0}
              max={80}
              suffix="px"
              onChange={onEdgeGapChange}
            />

          </>
        ) : null}

        {tab === 'widgets' ? (
          <>
            <p className="cz-group">{t(language, 'widgets.install')}</p>

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

            {installError ? <p className="cz-error">{installError}</p> : null}

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

            {catalog.length ? (
              <ul className="cz-catalog">
                {catalog.map((entry) => (
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
                    {entry.installable && entry.download ? (
                      <button
                        className="cz-action"
                        type="button"
                        disabled={urlBusy}
                        onClick={() => void installFromUrl(entry.download!)}
                      >
                        {urlBusy ? '…' : t(language, 'widgets.catalogInstall')}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}

            {catalogError ? <p className="cz-error">{catalogError}</p> : null}
            {!catalog.length && !catalogError && !catalogBusy ? (
              <p className="cz-note">{t(language, 'widgets.catalogEmpty')}</p>
            ) : null}

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

            <p className="cz-group">{t(language, 'widgets.visibility')}</p>
            <p className="cz-note" style={{ margin: '0 2px 6px' }}>
              {t(language, 'widgets.visibilityNote')}
            </p>
            {widgets.map((widget) => (
              <Switch
                key={widget.id}
                id={`cz-widget-${widget.id}`}
                label={widget.label}
                note=""
                checked={!widget.hidden}
                onChange={(value) => onToggleWidget(widget.id, value)}
              />
            ))}

            <p className="cz-group">{t(language, 'widgets.installed')}</p>
            {catalogUpdates.length ? (
              <>
                <p className="cz-group">{t(language, 'widgets.updates')}</p>
                <p className="cz-note" style={{ margin: '0 2px 6px' }}>
                  {t(language, 'widgets.updatesNote')}
                </p>
                {catalogUpdates.map((update) => (
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
                ))}
              </>
            ) : null}
            {registry.installed.length ? (
              registry.installed.map((item) => (
                <div key={item.id}>
                  <div className="cz-setrow">
                    <div className="cz-setrow__copy">
                      <span className="cz-setrow__name">{item.name}</span>
                      <span className="cz-setrow__note">
                        {item.id} · v{item.version} ·{' '}
                        {t(
                          language,
                          item.tier === 'static'
                            ? 'widgets.tier.static'
                            : item.tier === 'script'
                              ? 'widgets.tier.script'
                              : item.tier === 'isolated'
                                ? 'widgets.tier.isolated'
                                : 'widgets.tier.node'
                        )}{' '}
                        · {item.permissions.join(' / ') || '—'}
                      </span>
                    </div>
                    <span className="cz-widget-actions">
                      {item.settings.length ? (
                        <button
                          className="cz-action"
                          type="button"
                          disabled={settingsBusy}
                          onClick={() => void openWidgetSettings(item.id)}
                        >
                          {t(
                            language,
                            settingsFor === item.id ? 'widgets.settingsClose' : 'widgets.settings'
                          )}
                        </button>
                      ) : null}
                      <button
                        className="cz-action"
                        type="button"
                        disabled={uninstalling === item.id}
                        onClick={() => void uninstall(item.id)}
                      >
                        {t(language, 'widgets.uninstall')}
                      </button>
                    </span>
                  </div>

                  {settingsFor === item.id && item.settings.length ? (
                    <div className="cz-settings">
                      {item.settings.map((field) =>
                        field.type === 'switch' ? (
                          <Switch
                            key={field.key}
                            id={`cz-set-${item.id}-${field.key}`}
                            label={settingText(field.label, language, field.key)}
                            note={
                              field.description
                                ? settingText(field.description, language, '')
                                : ''
                            }
                            checked={settingsValues[field.key] === true}
                            onChange={(value) => void saveWidgetSetting(item.id, field.key, value)}
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
                                      void saveWidgetSetting(item.id, field.key, option.value)
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
                                    item.id,
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
              ))
            ) : (
              <p className="cz-note">{t(language, 'widgets.installedEmpty')}</p>
            )}
          </>
        ) : null}

        {tab === 'data' ? (
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
            <div className="cz-field cz-field--select">
              <div className="cz-field__head">
                <label className="cz-field__name" htmlFor="cz-weather-location">
                  {t(language, 'weather.location')}
                </label>
                <span className="cz-field__value">
                  {weatherCity ? weatherCityName(weatherCity, language) : t(language, 'weather.auto')}
                </span>
              </div>
              <select
                id="cz-weather-location"
                className="cz-select"
                value={weatherLocation}
                onChange={(event) => onWeatherLocationChange(event.currentTarget.value)}
              >
                <option value="auto">{t(language, 'weather.auto')}</option>
                {WEATHER_CITIES.map((city) => (
                  <option key={city.id} value={city.id}>
                    {weatherCityName(city, language)}
                  </option>
                ))}
              </select>
              <p className="cz-note">
                {weatherLocation === 'auto'
                  ? t(language, 'weather.autoNote')
                  : t(language, 'weather.locationNote')}
              </p>
              <p className="cz-note">{t(language, 'weather.credit')}</p>
            </div>
          </>
        ) : null}

        {tab === 'general' ? (
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

            <p className="cz-group">{t(language, 'behavior.system')}</p>
            <Switch
              id="cz-autostart"
              label={t(language, 'behavior.startup')}
              note={t(language, 'behavior.startupNote')}
              checked={startAtLogin}
              onChange={onStartAtLoginChange}
            />

            <p className="cz-group">{t(language, 'general.updates')}</p>
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

            <p className="cz-group">{t(language, 'general.about')}</p>
            <div className="cz-setrow">
              <div className="cz-setrow__copy">
                <span className="cz-setrow__name">{t(language, 'general.version')}</span>
                <span className="cz-setrow__note">sill</span>
              </div>
              <span className="cz-version">{version || '0.1.0'}</span>
            </div>

            <UninstallSection language={language} />
          </>
        ) : null}
      </div>

      <footer className="cz-foot">
        <span className="cz-dot" aria-hidden="true" />
        {t(language, `footer.${tab}`)}
        {tab === 'appearance' ? (
          <button className="cz-reset" type="button" onClick={onReset}>
            {t(language, 'footer.reset')}
          </button>
        ) : null}
      </footer>
    </section>
  )
}