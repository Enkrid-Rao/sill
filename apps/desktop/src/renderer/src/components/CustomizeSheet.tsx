import { useEffect, useRef } from 'react'
import {
  ACCENT_SWATCHES,
  ATMO_STYLES,
  PRESETS,
  TINT_SWATCHES,
  matchPreset,
  presetPatch,
  type Theme
} from '../../../shared/theme'

interface Props {
  theme: Theme
  onChange: (patch: Partial<Theme>) => void
  onClose: () => void
  onReset: () => void
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
    <label className="cz-row" htmlFor={id}>
      <span className="cz-switchrow__copy">
        <span className="cz-switchrow__name">{label}</span>
        <span className="cz-switchrow__note">{note}</span>
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

export function CustomizeSheet({ theme, onChange, onClose, onReset }: Props): React.JSX.Element {
  const closeRef = useRef<HTMLButtonElement>(null)
  const activePreset = matchPreset(theme)

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true })
  }, [])

  return (
    <section className="cz-sheet" role="dialog" aria-label="Customize appearance" aria-modal="true">
      <header className="cz-head">
        <div>
          <div className="cap">Customize</div>
          <h2 className="cz-title">Make it yours.</h2>
        </div>
        <button
          className="iconbtn"
          type="button"
          aria-label="Close customize"
          title="Close"
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

      <div className="cz-body">
        <p className="cz-label">Presets</p>
        <div className="cz-grid" role="group" aria-label="Theme presets">
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

        <div className="cz-switchrow cz-label--spaced">
          <span className="cz-switchrow__copy">
            <span className="cz-switchrow__name">Atmosphere</span>
            <span className="cz-switchrow__note">Light field inside the glass</span>
          </span>
          <label className="cz-toggle" title="Atmosphere">
            <input
              className="cz-check"
              type="checkbox"
              aria-label="Atmosphere"
              checked={theme.atmosphere}
              onChange={(event) => onChange({ atmosphere: event.currentTarget.checked })}
            />
            <span className="cz-switch" aria-hidden="true" />
          </label>
        </div>

        <div
          className={`cz-grid cz-atmo-grid${theme.atmosphere ? '' : ' is-disabled'}`}
          role="group"
          aria-label="Atmosphere style"
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
          label="Intensity"
          value={theme.atmoStrength}
          min={0}
          max={100}
          suffix="%"
          disabled={!theme.atmosphere}
          onChange={(value) => onChange({ atmoStrength: value })}
        />

        <div className="cz-divider" />

        <p className="cz-label">Background</p>
        <div className="cz-swatches" role="group" aria-label="Background colour">
          {TINT_SWATCHES.map((tint) => (
            <button
              key={tint.name}
              className="cz-swatch"
              type="button"
              aria-pressed={theme.hue === tint.hue && theme.tintSat === tint.tint}
              aria-label={`${tint.name} background`}
              title={tint.name}
              style={{ '--sw': `hsl(${tint.hue} ${tint.tint}% 26%)` } as React.CSSProperties}
              onClick={() => onChange({ hue: tint.hue, tintSat: tint.tint })}
            />
          ))}
        </div>

        <Slider
          id="cz-hue"
          label="Hue"
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
          label="Tint strength"
          value={theme.tintSat}
          min={0}
          max={60}
          suffix="%"
          onChange={(value) => onChange({ tintSat: value })}
        />
        <Slider
          id="cz-opacity"
          label="Glass opacity"
          value={theme.glassOpacity}
          min={30}
          max={100}
          suffix="%"
          onChange={(value) => onChange({ glassOpacity: value })}
        />

        <div className="cz-divider" />

        <p className="cz-label">Accent</p>
        <div className="cz-swatches" role="group" aria-label="Accent colour">
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
        <Slider
          id="cz-accent-hue"
          label="Hue"
          value={theme.accentHue}
          min={0}
          max={359}
          suffix="°"
          hue
          thumb={`hsl(${theme.accentHue} 82% 66%)`}
          onChange={(value) => onChange({ accentHue: value })}
        />

        <div className="cz-divider" />

        <p className="cz-label">Effects</p>
        <Switch
          id="cz-halo"
          label="Halo"
          note="Top-left light across the glass"
          checked={theme.halo}
          onChange={(value) => onChange({ halo: value })}
        />
        <Slider
          id="cz-halo-strength"
          label="Halo strength"
          value={theme.haloStrength}
          min={0}
          max={100}
          suffix="%"
          disabled={!theme.halo}
          onChange={(value) => onChange({ haloStrength: value })}
        />
        <Switch
          id="cz-grain"
          label="Grain"
          note="Soft light-field texture in the glass"
          checked={theme.grain}
          onChange={(value) => onChange({ grain: value })}
        />

        <p className="cz-note">
          Glass stays static: baked texture and gradients, never a live blur of the desktop.
        </p>
      </div>

      <footer className="cz-foot">
        <span className="cz-dot" aria-hidden="true" />
        Changes save locally
        <button className="cz-reset" type="button" onClick={onReset}>
          Reset
        </button>
      </footer>
    </section>
  )
}
