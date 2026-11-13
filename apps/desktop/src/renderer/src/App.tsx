import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MediaControlState, PanelSnapshot, TodoItem } from '../../shared/data'
import { formatDate, t, type Language } from '../../shared/i18n'
import {
  clampSpan,
  columnsForWidth,
  DEFAULT_LAYOUT,
  normalizeLayout,
  PANEL_MAX_WIDTH,
  PANEL_MIN_HEIGHT,
  PANEL_MIN_WIDTH,
  PANEL_PRESETS,
  type CardId,
  type PanelLayout
} from '../../shared/layout'
import { DEFAULT_THEME, normalizeTheme, type Theme } from '../../shared/theme'
import type { UpdateState } from '../../shared/update'
import { CustomizeSheet } from './components/CustomizeSheet'
import { ResizeHandles } from './components/ResizeHandles'
import { MediaWidget } from './components/widgets/MediaWidget'
import { TodoWidget } from './components/widgets/TodoWidget'
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

function formatRate(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B/s'
  if (bytes < 1024) return `${Math.round(bytes)} B/s`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB/s`
  return `${(bytes / 1024 ** 2).toFixed(1)} MB/s`
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
        <i style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
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

const EMPTY_UPDATE: UpdateState = { status: 'idle' }

/** 当前屏的尺寸上限（和主进程 panel.ts 的 sizeLimits 同一条公式） */
function screenLimits(edgeGap: number): { maxWidth: number; maxHeight: number } {
  return {
    maxWidth: Math.max(
      PANEL_MIN_WIDTH,
      Math.min(PANEL_MAX_WIDTH, window.screen.availWidth - edgeGap * 2 - 16)
    ),
    maxHeight: Math.max(PANEL_MIN_HEIGHT, window.screen.availHeight - 80)
  }
}

export default function App(): React.JSX.Element {
  const now = useClock()
  const [visible, setVisible] = useState(false)
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME)
  const [customizing, setCustomizing] = useState(false)
  const [hotkey, setHotkey] = useState('Alt+Q')
  const [panelWidth, setPanelWidth] = useState(384)
  const [panelHeight, setPanelHeight] = useState(0)
  const [columns, setColumns] = useState<1 | 2 | 3>(() => columnsForWidth(window.innerWidth))
  const [side, setSide] = useState<'left' | 'right'>('right')
  const [edgeGap, setEdgeGap] = useState(30)
  const [language, setLanguage] = useState<Language>('en')
  const [startAtLogin, setStartAtLogin] = useState(false)
  const [autoUpdate, setAutoUpdate] = useState(true)
  const [version, setVersion] = useState('')
  const [snapshot, setSnapshot] = useState<PanelSnapshot | null>(null)
  const [todos, setTodos] = useState<TodoItem[]>([])
  const [update, setUpdate] = useState<UpdateState>(EMPTY_UPDATE)
  const [tick, setTick] = useState(0)
  const [panelLayout, setPanelLayout] = useState<PanelLayout>(DEFAULT_LAYOUT)
  const [editing, setEditing] = useState(false)
  const [dragId, setDragId] = useState<CardId | null>(null)
  const themeRef = useRef<Theme>(DEFAULT_THEME)
  const saveTimer = useRef<number | null>(null)

  // 主题变化 → 写 CSS 变量（唯一的渲染入口）
  useEffect(() => {
    themeRef.current = theme
    applyTheme(theme)
  }, [theme])

  // 窗口尺寸变化（拖拽把手 / 设置滑杆 / 换屏）→ 只在跨过列数阈值时重排
  useEffect(() => {
    const onResize = (): void => {
      setColumns((current) => {
        const next = columnsForWidth(window.innerWidth)
        return next === current ? current : next
      })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // 启动时把 settings 读进来；读不到就用默认值（浏览器预览也走这条）
  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const settings = await window.sill?.getSettings()
        if (alive && settings) {
          setTheme(normalizeTheme(settings.theme))
          setHotkey(settings.hotkey)
          setPanelWidth(settings.panelWidth)
          setPanelHeight(settings.panelHeight)
          setSide(settings.side)
          setEdgeGap(settings.edgeGap)
          setLanguage(settings.language)
          setStartAtLogin(settings.startAtLogin)
          setAutoUpdate(settings.autoUpdate)
        }
        const appVersion = await window.sill?.getVersion()
        if (alive && appVersion) setVersion(appVersion)
        const todosNow = await window.sill?.listTodos()
        if (alive && todosNow) setTodos(todosNow)
        const updateState = await window.sill?.getUpdateState()
        if (alive && updateState) setUpdate(updateState)
        const layoutNow = await window.sill?.getLayout()
        if (alive && layoutNow) setPanelLayout(normalizeLayout(layoutNow))
      } catch {
        // 保持默认值
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  // 主进程查到新版本时推过来
  useEffect(() => {
    const off = window.sill?.onUpdateState((next) => setUpdate(next))
    return () => off?.()
  }, [])

  const pullSnapshot = useCallback(async (): Promise<void> => {
    const next = await window.sill?.getSnapshot()
    if (next) setSnapshot(next)
  }, [])

  // 面板可见时才拉快照；隐藏时主进程也停采样
  useEffect(() => {
    if (!visible) return
    void pullSnapshot()
    const id = window.setInterval(() => void pullSnapshot(), 1500)
    return () => window.clearInterval(id)
  }, [visible, pullSnapshot])

  // 播放中的进度每秒推进一次，避免 1.5s 一跳
  useEffect(() => {
    if (snapshot?.media?.status !== 'Playing') return
    const id = window.setInterval(() => setTick((value) => value + 1), 1000)
    return () => window.clearInterval(id)
  }, [snapshot?.media?.status])

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

  const changePanelWidth = useCallback((value: number) => {
    setPanelWidth(value)
    void window.sill?.updateSettings({ panelWidth: value })
  }, [])

  const changePanelHeight = useCallback((value: number) => {
    setPanelHeight(value)
    // 高度滑杆 = 明确的「重新居中」，把拖底边留下的垂直偏移清掉
    void window.sill?.updateSettings({ panelHeight: value, panelOffsetY: 0 })
  }, [])

  /** 预设：宽高一次写入，避免两次 reanchor 把窗口挪两遍 */
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

  const changeEdgeGap = useCallback((value: number) => {
    setEdgeGap(value)
    void window.sill?.updateSettings({ edgeGap: value })
  }, [])

  const changeLanguage = useCallback((next: Language) => {
    setLanguage(next)
    void window.sill?.updateSettings({ language: next })
  }, [])

  const changeAutoUpdate = useCallback((value: boolean) => {
    setAutoUpdate(value)
    void window.sill?.updateSettings({ autoUpdate: value })
  }, [])

  const changeStartAtLogin = useCallback((value: boolean) => {
    setStartAtLogin(value)
    void window.sill?.updateSettings({ startAtLogin: value })
  }, [])

  const checkUpdate = useCallback(() => {
    setUpdate({ status: 'checking' })
    void window.sill?.checkForUpdates().then((next) => {
      if (next) setUpdate(next)
    })
  }, [])

  const addTodo = useCallback(async (text: string) => {
    const next = await window.sill?.addTodo(text)
    if (next) setTodos(next)
  }, [])

  const toggleTodo = useCallback(async (id: string) => {
    const next = await window.sill?.toggleTodo(id)
    if (next) setTodos(next)
  }, [])

  const removeTodo = useCallback(async (id: string) => {
    const next = await window.sill?.removeTodo(id)
    if (next) setTodos(next)
  }, [])

  /** 媒体控制：命令返回的状态先写进本地快照，再补一次完整快照 */
  const mediaCommand = useCallback(
    async (
      action: 'playpause' | 'next' | 'prev' | 'mute' | 'volume',
      value?: number
    ): Promise<MediaControlState | null> => {
      const next = (await window.sill?.mediaCommand(action, value)) ?? null
      if (next) {
        setSnapshot((current) =>
          current
            ? {
                ...current,
                volume: next.volume >= 0 ? next.volume : current.volume,
                muted: next.muted,
                media:
                  current.media && next.status
                    ? { ...current.media, status: next.status }
                    : current.media
              }
            : current
        )
      }
      // 采集进程每 2s 才拿到新的播放状态；稍等再补一次完整快照，
      // 不要立刻拉，否则会用旧状态覆盖掉上面的命令结果。
      window.setTimeout(() => void pullSnapshot(), 900)
      return next
    },
    [pullSnapshot]
  )

  const moveCard = useCallback(
    (id: CardId, direction: -1 | 1) => {
      const order = [...panelLayout.order]
      const index = order.indexOf(id)
      const target = index + direction
      if (index < 0 || target < 0 || target >= order.length) return
      ;[order[index], order[target]] = [order[target], order[index]]
      const next = { ...panelLayout, order }
      setPanelLayout(next)
      void window.sill?.setLayout(next)
    },
    [panelLayout]
  )

  const dropCard = useCallback(
    (from: CardId, to: CardId) => {
      if (from === to) return
      const order = [...panelLayout.order]
      const a = order.indexOf(from)
      const b = order.indexOf(to)
      if (a < 0 || b < 0) return
      ;[order[a], order[b]] = [order[b], order[a]]
      const next = { ...panelLayout, order }
      setPanelLayout(next)
      void window.sill?.setLayout(next)
    },
    [panelLayout]
  )

  const setCardSpan = useCallback(
    (id: CardId, span: number) => {
      const next = { ...panelLayout, spans: { ...panelLayout.spans, [id]: span } }
      setPanelLayout(next)
      void window.sill?.setLayout(next)
    },
    [panelLayout]
  )

  const resetLayout = useCallback(() => {
    void window.sill?.resetLayout().then((saved) => {
      if (saved) setPanelLayout(saved)
    })
  }, [])

  useEffect(() => {
    let alive = true
    // 面板可能在这个监听器挂上之前就已经唤出（比如 --smoke），主动问一次当前状态
    void window.sill?.isPanelVisible().then((next) => {
      if (alive && next) setVisible(true)
    })
    const off = window.sill?.onPanelState((next) => {
      setVisible(next)
      if (!next) setCustomizing(false)
    })
    return () => {
      alive = false
      off?.()
    }
  }, [])

  // 面板不抢焦点，Esc 由主进程全局接管；设置面板或布局编辑开着时先关那一层
  useEffect(() => {
    const off = window.sill?.onEscape(() => {
      if (editing) setEditing(false)
      else setCustomizing(false)
    })
    return () => off?.()
  }, [editing])

  // 告诉主进程「有覆盖层」，Esc 的优先级据此切换
  useEffect(() => {
    void window.sill?.setOverlayOpen(customizing || editing)
  }, [customizing, editing])

  // 语言：同步 <html lang>，让中文标题不走合成斜体
  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  const dateLabel = formatDate(now, language)
  const timeLabel = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const openCount = todos.filter((item) => !item.done).length
  const limits = useMemo(() => screenLimits(edgeGap), [edgeGap])

  const media = snapshot?.media ?? null
  const mediaPosition = useMemo(() => {
    if (!media) return 0
    if (media.status !== 'Playing' || !snapshot) return media.position
    const elapsed = (Date.now() - snapshot.at) / 1000
    return Math.min(media.duration || Number.MAX_SAFE_INTEGER, media.position + elapsed)
    // tick 只用来按秒重算
  }, [media, snapshot, tick])
  const mediaProgress = media && media.duration > 0 ? (mediaPosition / media.duration) * 100 : 0

  const gpuValue = snapshot?.gpu != null ? `${snapshot.gpu}%` : '—'
  const vramValue =
    snapshot?.gpuMem != null
      ? `${(snapshot.gpuMem / 1024).toFixed(1)} / ${((snapshot.gpuTotal ?? 0) / 1024).toFixed(1)} GB`
      : '—'

  /** 卡片实际占几列；待办在三列时如果没有手动设过跨列，就默认独占整行 */
  const effectiveSpan = (id: CardId): number => {
    const configured = panelLayout.spans[id]
    if (id === 'todo' && configured === undefined && columns === 3) return columns
    return clampSpan(configured, columns)
  }

  /** 每张卡片的网格属性 + 拖拽事件；order 同时作用于单列 flex 和多列 grid */
  const cardAttrs = (
    id: CardId,
    extra = ''
  ): React.ComponentProps<'section'> & { 'data-card': CardId } => ({
    className: `card ${extra}`.trim(),
    'data-card': id,
    style: {
      order: panelLayout.order.indexOf(id),
      ...(columns > 1 ? { gridColumn: `span ${effectiveSpan(id)}` } : {})
    },
    draggable: editing,
    onDragStart: (event) => {
      if (!editing) return
      event.dataTransfer.setData('text/plain', id)
      event.dataTransfer.effectAllowed = 'move'
      setDragId(id)
    },
    onDragOver: (event) => {
      if (!editing || !dragId) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
    },
    onDrop: (event) => {
      if (!editing) return
      event.preventDefault()
      const from = (event.dataTransfer.getData('text/plain') || dragId) as CardId
      if (from) dropCard(from, id)
      setDragId(null)
    },
    onDragEnd: () => setDragId(null)
  })

  const cardTools = (id: CardId): React.JSX.Element => (
    <div className="card-tools" draggable={false} onDragStart={(event) => event.preventDefault()}>
      <span className="card-tools__grip" aria-hidden="true">
        ⠿
      </span>
      <button
        type="button"
        aria-label={t(language, 'layout.up')}
        title={t(language, 'layout.up')}
        onClick={() => moveCard(id, -1)}
      >
        ↑
      </button>
      <button
        type="button"
        aria-label={t(language, 'layout.down')}
        title={t(language, 'layout.down')}
        onClick={() => moveCard(id, 1)}
      >
        ↓
      </button>
      <span className="card-tools__spans" title={t(language, 'layout.columns')}>
        {Array.from({ length: columns }, (_, index) => index + 1).map((span) => (
          <button
            key={span}
            type="button"
            aria-pressed={effectiveSpan(id) === span}
            onClick={() => setCardSpan(id, span)}
          >
            {span}
          </button>
        ))}
      </span>
    </div>
  )

  return (
    <div className="rail" data-visible={visible} data-customizing={customizing} data-editing={editing}>
      <span className="rail__atmo" aria-hidden="true" />
      <span className="rail__grain" aria-hidden="true" />
      <span className="rail__halo" aria-hidden="true" />
      <span className="rail__sheen" aria-hidden="true" />
      <span className="rail__rim" aria-hidden="true" />

      {editing ? (
        <div className="layout-bar">
          <span className="layout-bar__label">{t(language, 'layout.title')}</span>
          <span className="layout-bar__hint">{t(language, 'layout.hint')}</span>
          <button type="button" onClick={resetLayout}>
            {t(language, 'layout.reset')}
          </button>
          <button type="button" className="layout-bar__done" onClick={() => setEditing(false)}>
            {t(language, 'layout.done')}
          </button>
        </div>
      ) : null}

      <div className="rail__scroll" inert={customizing}>
        <div className="sheet" data-cols={columns}>
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

          <section {...cardAttrs('hero', 'card--hero')}>
            {editing ? cardTools('hero') : null}
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

          <section {...cardAttrs('system')}>
            {editing ? cardTools('system') : null}
            <div className="row" style={{ marginBottom: 13 }}>
              <span className="cap">{t(language, 'system.title')}</span>
              <span className="cap">
                {snapshot ? `${snapshot.cores} ${t(language, 'system.coresUnit')}` : '—'}
              </span>
            </div>
            <div className="system__bars">
              <Bar
                label={t(language, 'metric.cpu')}
                value={snapshot ? `${snapshot.cpu}%` : '—'}
                pct={snapshot?.cpu ?? 0}
              />
              <Bar
                label={t(language, 'metric.memory')}
                value={
                  snapshot
                    ? `${snapshot.memPct}% · ${snapshot.memUsed.toFixed(1)} GB`
                    : '—'
                }
                pct={snapshot?.memPct ?? 0}
              />
              <Bar label={t(language, 'metric.gpu')} value={gpuValue} pct={snapshot?.gpu ?? 0} warm />
              <Bar
                label={t(language, 'metric.network')}
                value={snapshot ? `↓ ${formatRate(snapshot.down)}` : '—'}
                pct={snapshot ? Math.min(100, (snapshot.down / (1024 ** 2)) * 20) : 0}
              />
            </div>
          </section>

          <section {...cardAttrs('processes')}>
            {editing ? cardTools('processes') : null}
            <div className="row" style={{ marginBottom: 9 }}>
              <span className="cap">{t(language, 'system.topRam')}</span>
              <span className="cap">{t(language, 'system.memory')}</span>
            </div>
            {(snapshot?.procs ?? []).slice(0, 2).map((proc) => (
              <div className="proc" key={proc.name}>
                <b>{proc.name}</b>
                <span>{(proc.mb / 1024).toFixed(1)} GB</span>
              </div>
            ))}
            {!snapshot?.procs?.length ? <div className="proc proc--empty">—</div> : null}
            <div className="row" style={{ marginTop: 11 }}>
              <span className="cap">{t(language, 'system.topGpu')}</span>
              <span className="cap">{vramValue}</span>
            </div>
          </section>

          <section {...cardAttrs('media')}>
            {editing ? cardTools('media') : null}
            <div className="row" style={{ marginBottom: 11 }}>
              <span className="cap">{t(language, 'media.nowPlaying')}</span>
            </div>
            <MediaWidget
              media={media}
              position={mediaPosition}
              progress={mediaProgress}
              volume={snapshot?.volume ?? -1}
              muted={snapshot?.muted ?? false}
              language={language}
              onCommand={mediaCommand}
            />
          </section>

          <section {...cardAttrs('todo', 'card--grow')}>
            {editing ? cardTools('todo') : null}
            <div className="row" style={{ marginBottom: 12 }}>
              <span className="cap">{t(language, 'todo.today')}</span>
              <span className="cap">
                {openCount} {t(language, 'todo.open')}
              </span>
            </div>
            <TodoWidget
              items={todos}
              language={language}
              onAdd={addTodo}
              onToggle={toggleTodo}
              onRemove={removeTodo}
            />
          </section>
        </div>
      </div>

      <div className="footer">
        <span className="sub" style={{ fontSize: 11.5 }}>
          {t(language, 'footer.dismiss')}
        </span>
        <span className="cap">sill{version ? ` · v${version}` : ''}</span>
      </div>

      {customizing ? (
        <CustomizeSheet
          theme={theme}
          onChange={updateTheme}
          onClose={() => setCustomizing(false)}
          onReset={resetTheme}
          hotkey={hotkey}
          onHotkeyChange={changeHotkey}
          panelWidth={panelWidth}
          panelHeight={panelHeight}
          maxWidth={limits.maxWidth}
          maxHeight={limits.maxHeight}
          columns={columns}
          onPanelWidthChange={changePanelWidth}
          onPanelHeightChange={changePanelHeight}
          onPanelSizeChange={changePanelSize}
          onResetSize={resetPanelSize}
          side={side}
          onSideChange={changeSide}
          edgeGap={edgeGap}
          onEdgeGapChange={changeEdgeGap}
          language={language}
          onLanguageChange={changeLanguage}
          startAtLogin={startAtLogin}
          onStartAtLoginChange={changeStartAtLogin}
          autoUpdate={autoUpdate}
          onAutoUpdateChange={changeAutoUpdate}
          update={update}
          onCheckUpdate={checkUpdate}
          onEditLayout={() => {
            setCustomizing(false)
            setEditing(true)
          }}
          version={version}
        />
      ) : null}

      <ResizeHandles
        side={side}
        language={language}
        onCommitted={(width, height) => {
          setPanelWidth(width)
          setPanelHeight(height)
          setColumns(columnsForWidth(width))
        }}
      />
    </div>
  )
}
