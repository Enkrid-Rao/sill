import { useCallback, useEffect, useRef, useState } from 'react'
import { formatDate, t, type Language } from '../../shared/i18n'
import { DEFAULT_THEME, normalizeTheme, type Theme } from '../../shared/theme'
import { CustomizeSheet } from './components/CustomizeSheet'
import { formatHotkey } from './lib/hotkey'
import { applyTheme } from './lib/theme'

function useClock(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])
  return now
}

function Bar({
  label,
  value,
  pct,
  warm = false
}: {
  label: string
  value: string
  pct: number
  warm?: boolean
}): React.JSX.Element {
  return (
    <div>
      <div className="row lbl">
        <span>{label}</span>
        <span className="val">{value}</span>
      </div>
      <div className={`bar${warm ? ' bar--warm' : ''}`} style={{ marginTop: 6 }}>
        <i style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function MoonCloud(): React.JSX.Element {
  return (
    <svg width="30" height="30" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <path
        d="M25.6 5.4a8.1 8.1 0 1 0 8 10.2 6.5 6.5 0 0 1-8-10.2Z"
        fill="rgba(255,255,255,.06)"
        stroke="var(--accent-2)"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path
        d="M14.4 33.6h12.9a4.6 4.6 0 0 0 0-9.2 6.9 6.9 0 0 0-13-1.5 4.6 4.6 0 0 0 .1 10.7Z"
        fill="rgba(230,244,238,.07)"
        stroke="rgba(226,239,233,.85)"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function BrandMark(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10.4" fill="rgba(255,255,255,.08)" stroke="rgba(255,255,255,.28)" strokeWidth=".8" />
      <path
        d="M5.1 13.6c2.2-2.6 4.4-2.6 6.5-.1 2.1 2.5 4.4 2.4 7.1-.4"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="16.7" cy="8.1" r="1.8" fill="var(--accent-2)" />
    </svg>
  )
}

function SlidersIcon(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M2.8 4.4h10.4M2.8 8h10.4M2.8 11.6h10.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <circle cx="6" cy="4.4" r="1.55" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="10.3" cy="8" r="1.55" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="6.9" cy="11.6" r="1.55" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

const TASK_KEYS = ['todo.one', 'todo.two', 'todo.three'] as const

export default function App(): React.JSX.Element {
  const now = useClock()
  const [visible, setVisible] = useState(false)
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME)
  const [customizing, setCustomizing] = useState(false)
  const [hotkey, setHotkey] = useState('Alt+Q')
  const [side, setSide] = useState<'left' | 'right'>('right')
  const [edgeGap, setEdgeGap] = useState(30)
  const [language, setLanguage] = useState<Language>('en')
  const [startAtLogin, setStartAtLogin] = useState(false)
  const [pinned, setPinned] = useState(true)
  const [version, setVersion] = useState('')
  const themeRef = useRef<Theme>(DEFAULT_THEME)
  const saveTimer = useRef<number | null>(null)

  // 主题变化 → 写 CSS 变量（唯一的渲染入口）
  useEffect(() => {
    themeRef.current = theme
    applyTheme(theme)
  }, [theme])

  // 启动时把 settings 读进来；读不到就用默认值（浏览器预览也走这条）
  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const settings = await window.sill?.getSettings()
        if (alive && settings) {
          setTheme(normalizeTheme(settings.theme))
          setHotkey(settings.hotkey)
          setSide(settings.side)
          setEdgeGap(settings.edgeGap)
          setLanguage(settings.language)
          setStartAtLogin(settings.startAtLogin)
          setPinned(settings.pinned)
        }
        const appVersion = await window.sill?.getVersion()
        if (alive && appVersion) setVersion(appVersion)
      } catch {
        // 保持默认值
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  // 拖动滑杆时不必每次落盘：停下 220ms 再写 settings.json
  const updateTheme = useCallback((patch: Partial<Theme>) => {
    const next = normalizeTheme({ ...themeRef.current, ...patch })
    themeRef.current = next
    setTheme(next)
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      void window.sill?.updateSettings({ theme: next })
    }, 220)
  }, [])

  const resetTheme = useCallback(() => {
    updateTheme({ ...DEFAULT_THEME })
  }, [updateTheme])

  /** 换热键：主进程试注册成功才落盘；失败保留旧键 */
  const changeHotkey = useCallback(async (accel: string): Promise<boolean> => {
    const result = await window.sill?.setHotkey(accel)
    if (result?.ok) {
      setHotkey(result.hotkey)
      return true
    }
    return false
  }, [])

  /** 换边：主进程会把窗口挪到新一侧，下次唤出从对应方向滑入 */
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

  const changeFlags = useCallback(
    async (patch: { startAtLogin?: boolean; pinned?: boolean }) => {
      const next = await window.sill?.updateSettings(patch)
      if (!next) return
      setStartAtLogin(next.startAtLogin)
      setPinned(next.pinned)
    },
    []
  )

  // 语言：同步 <html lang>，让中文标题不走合成斜体
  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  useEffect(() => {
    const off = window.sill?.onPanelState((next) => {
      setVisible(next)
      if (!next) setCustomizing(false)
    })
    return () => off?.()
  }, [])

  // 面板不抢焦点，Esc 由主进程全局接管；盖着设置面板时先关这一层
  useEffect(() => {
    const off = window.sill?.onEscape(() => setCustomizing(false))
    return () => off?.()
  }, [])

  // 告诉主进程「有覆盖层」，Esc 的优先级据此切换
  useEffect(() => {
    void window.sill?.setOverlayOpen(customizing)
  }, [customizing])

  const dateLabel = formatDate(now, language)
  const timeLabel = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

  return (
    <div className="rail" data-visible={visible} data-customizing={customizing}>
      <span className="rail__atmo" aria-hidden="true" />
      <span className="rail__grain" aria-hidden="true" />
      <span className="rail__halo" aria-hidden="true" />
      <span className="rail__sheen" aria-hidden="true" />
      <span className="rail__rim" aria-hidden="true" />

      <div className="rail__scroll" inert={customizing}>
        <div className="sheet">
          <header className="row sheet__head">
            <div className="brand">
              <BrandMark />
              <span className="brand__word">sill</span>
            </div>
            <div className="headtools">
              <span className="chip">{formatHotkey(hotkey)}</span>
              <button
                className="iconbtn"
                type="button"
                aria-label={t(language, 'settings.title')}
                aria-haspopup="dialog"
                aria-expanded={customizing}
                title={t(language, 'settings.title')}
                onClick={() => setCustomizing(true)}
              >
                <SlidersIcon />
              </button>
            </div>
          </header>

          <section className="card card--hero">
            <div className="cap">{dateLabel}</div>
            <div className="num">{timeLabel}</div>
            <div className="row card__weather">
              <div className="weather__now">
                <MoonCloud />
                <div>
                  <div className="weather__temp">14°</div>
                  <div className="sub" style={{ fontSize: 11.5 }}>
                    {t(language, 'weather.condition')}
                  </div>
                </div>
              </div>
              <div className="cap weather__side">
                {t(language, 'weather.city')}
                <br />
                {t(language, 'weather.range')}
              </div>
            </div>
          </section>

          <section className="card">
            <div className="row" style={{ marginBottom: 13 }}>
              <span className="cap">{t(language, 'system.title')}</span>
              <span className="cap">{t(language, 'system.cores')}</span>
            </div>
            <div className="system__bars">
              <Bar label={t(language, 'metric.cpu')} value="42%" pct={42} />
              <Bar label={t(language, 'metric.memory')} value="61% · 19.5 GB" pct={61} />
              <Bar label={t(language, 'metric.gpu')} value="8%" pct={8} warm />
              <Bar label={t(language, 'metric.network')} value="↓ 1.2 MB/s" pct={22} />
            </div>
          </section>

          <section className="card">
            <div className="row" style={{ marginBottom: 9 }}>
              <span className="cap">{t(language, 'system.topRam')}</span>
              <span className="cap">{t(language, 'system.memory')}</span>
            </div>
            <div className="proc">
              <b>chrome.exe</b>
              <span>2.4 GB</span>
            </div>
            <div className="proc">
              <b>Code.exe</b>
              <span>1.1 GB</span>
            </div>
            <div className="row" style={{ marginTop: 11 }}>
              <span className="cap">{t(language, 'system.topGpu')}</span>
              <span className="cap">chrome.exe · 26%</span>
            </div>
          </section>

          <section className="card">
            <div className="cap" style={{ marginBottom: 11 }}>
              {t(language, 'media.nowPlaying')}
            </div>
            <div className="row">
              <div className="media__now">
                <span className="cover" />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5 }}>Nightcall</div>
                  <div className="sub" style={{ fontSize: 11.5 }}>
                    Kavinsky · OutRun
                  </div>
                </div>
              </div>
              <span className="cap">2:48</span>
            </div>
            <div className="bar" style={{ marginTop: 13 }}>
              <i style={{ width: '38%' }} />
            </div>
          </section>

          <section className="card card--grow">
            <div className="row" style={{ marginBottom: 12 }}>
              <span className="cap">{t(language, 'todo.today')}</span>
              <span className="cap">{t(language, 'todo.open')}</span>
            </div>
            <div className="tasks">
              {TASK_KEYS.map((key) => (
                <div className="task" key={key}>
                  <span className="dot" />
                  {t(language, key)}
                </div>
              ))}
            </div>
            <div className="addrow">
              <span className="plus" />
              {t(language, 'todo.add')}
            </div>
          </section>
        </div>
      </div>

      <div className="footer">
        <span className="sub" style={{ fontSize: 11.5 }}>
          {t(language, 'footer.dismiss')}
        </span>
        <span className="cap">{t(language, 'footer.version')}</span>
      </div>

      {customizing ? (
        <CustomizeSheet
          theme={theme}
          onChange={updateTheme}
          onClose={() => setCustomizing(false)}
          onReset={resetTheme}
          hotkey={hotkey}
          onHotkeyChange={changeHotkey}
          side={side}
          onSideChange={changeSide}
          edgeGap={edgeGap}
          onEdgeGapChange={changeEdgeGap}
          language={language}
          onLanguageChange={changeLanguage}
          startAtLogin={startAtLogin}
          onStartAtLoginChange={(value) => void changeFlags({ startAtLogin: value })}
          pinned={pinned}
          onPinnedChange={(value) => void changeFlags({ pinned: value })}
          version={version}
        />
      ) : null}
    </div>
  )
}
