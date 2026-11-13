import { useEffect, useRef, useState } from 'react'
import { LANGUAGES, t, type Language } from '../../../shared/i18n'
import { PANEL_SHAPES, type PanelShape } from '../../../shared/layout'
import type { UpdateState } from '../../../shared/update'
import {
  ACCENT_SWATCHES,
  ATMO_STYLES,
  PRESETS,
  matchPreset,
  presetPatch,
  type Theme
} from '../../../shared/theme'
import { formatHotkey } from '../lib/hotkey'

type Tab = 'appearance' | 'behavior' | 'general'

interface Props {
  theme: Theme
  onChange: (patch: Partial<Theme>) => void
  onClose: () => void
  onReset: () => void
  hotkey: string
  onHotkeyChange: (accel: string) => Promise<boolean>
  panelShape: PanelShape
  onPanelShapeChange: (shape: PanelShape) => void
  side: 'left' | 'right'
  onSideChange: (side: 'left' | 'right') => void
  edgeGap: number
  onEdgeGapChange: (value: number) => void
  language: Language
  onLanguageChange: (language: Language) => void
  startAtLogin: boolean
  onStartAtLoginChange: (value: boolean) => void
  autoUpdate: boolean
  onAutoUpdateChange: (value: boolean) => void
  update: UpdateState
  onCheckUpdate: () => void
  version: string
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
  panelShape,
  onPanelShapeChange,
  side,
  onSideChange,
  edgeGap,
  onEdgeGapChange,
  language,
  onLanguageChange,
  startAtLogin,
  onStartAtLoginChange,
  autoUpdate,
  onAutoUpdateChange,
  update,
  onCheckUpdate,
  version
}: Props): React.JSX.Element {
  const closeRef = useRef<HTMLButtonElement>(null)
  const [tab, setTab] = useState<Tab>('appearance')
  const activePreset = matchPreset(theme)

  const updateText = ((): string => {
    switch (update.status) {
      case 'checking':
        return t(language, 'general.checking')
      case 'latest':
        return t(language, 'general.upToDate')
      case 'available':
        return `${t(language, 'general.updateAvailable')} v${update.version ?? ''}`
      case 'error':
        return update.reason === 'private'
          ? t(language, 'general.updatePrivate')
          : t(language, 'general.updateFailed')
      default:
        return ''
    }
  })()

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true })
  }, [])

  return (
    <section className="cz-sheet" role="dialog" aria-label={t(language, 'settings.title')} aria-modal="true">
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
        {(['appearance', 'behavior', 'general'] as const).map((id) => (
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

        {tab === 'behavior' ? (
          <>
            <p className="cz-group">{t(language, 'behavior.panel')}</p>
            <HotkeyRow hotkey={hotkey} language={language} onChange={onHotkeyChange} />

            <div className="cz-setrow cz-setrow--stack">
              <div className="cz-setrow__copy">
                <span className="cz-setrow__name">{t(language, 'behavior.shape')}</span>
                <span className="cz-setrow__note">{t(language, 'behavior.shapeNote')}</span>
              </div>
              <div className="cz-seg cz-seg--four" role="group" aria-label={t(language, 'behavior.shape')}>
                {PANEL_SHAPES.map((shape) => (
                  <button
                    key={shape.id}
                    type="button"
                    aria-pressed={panelShape === shape.id}
                    onClick={() => onPanelShapeChange(shape.id)}
                  >
                    {t(language, `shape.${shape.id}`)}
                  </button>
                ))}
              </div>
            </div>

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

            <p className="cz-group">{t(language, 'behavior.system')}</p>
            <Switch
              id="cz-autostart"
              label={t(language, 'behavior.startup')}
              note={t(language, 'behavior.startupNote')}
              checked={startAtLogin}
              onChange={onStartAtLoginChange}
            />
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
                onClick={onCheckUpdate}
                disabled={update.status === 'checking'}
              >
                {update.status === 'checking'
                  ? t(language, 'general.checking')
                  : t(language, 'general.checkNow')}
              </button>
            </div>

            <p className="cz-group">{t(language, 'general.about')}</p>
            <div className="cz-setrow">
              <div className="cz-setrow__copy">
                <span className="cz-setrow__name">{t(language, 'general.version')}</span>
                <span className="cz-setrow__note">sill</span>
              </div>
              <span className="cz-version">{version || '0.1.0'}</span>
            </div>
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
