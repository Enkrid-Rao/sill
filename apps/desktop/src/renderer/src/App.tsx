import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { MediaControlState, PanelSnapshot, TodoItem } from '../../shared/data'
import { t } from '../../shared/i18n'
import { columnsForWidth, type WidgetBox } from '../../shared/layout'
import { CustomizeSheet } from './components/CustomizeSheet'
import { ResizeHandles } from './components/ResizeHandles'
import { formatHotkey } from './lib/hotkey'
import { useSillSettings } from './lib/useSillSettings'
import { useWidgetRegistry } from './widgets/WidgetRegistryProvider'
import type { WidgetContext } from './widgets/types'
import { WidgetShell } from './widgets/WidgetShell'

function useClock(active: boolean): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    if (!active) return
    setNow(new Date())
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [active])
  return now
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

export default function App(): React.JSX.Element {
  const registry = useWidgetRegistry()
  const settings = useSillSettings()
  const [visible, setVisible] = useState(false)
  const now = useClock(visible)
  const [customizing, setCustomizing] = useState(false)
  const [columns, setColumns] = useState<1 | 2 | 3>(() => columnsForWidth(window.innerWidth))
  const [snapshot, setSnapshot] = useState<PanelSnapshot | null>(null)
  const [todos, setTodos] = useState<TodoItem[]>([])
  const [tick, setTick] = useState(0)
  const [editing, setEditing] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [componentUpdates, setComponentUpdates] = useState(0)
  const [dismissedUpdate, setDismissedUpdate] = useState<string | null>(null)
  const sheetRef = useRef<HTMLDivElement>(null)

  const { layout, setLayout } = settings
  const layoutRef = useRef(layout)
  const setLayoutRef = useRef(setLayout)
  layoutRef.current = layout
  setLayoutRef.current = setLayout

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

  const pullSnapshot = useCallback(async (): Promise<void> => {
    const next = await window.sill?.getSnapshot()
    if (next) setSnapshot(next)
  }, [])

  // 主进程在面板可见时主动推快照，渲染进程不再轮询；隐藏时主进程停采样
  useEffect(() => {
    const off = window.sill?.onSnapshot((next) => setSnapshot(next))
    return () => off?.()
  }, [])

  // 后台检查到的组件更新：只显示一个小圆点，点进设置再决定更不更
  useEffect(() => {
    let alive = true
    void window.sill
      ?.getWidgetUpdates()
      .then((state) => {
        if (alive && state) setComponentUpdates(state.count)
      })
      .catch(() => undefined)
    const off = window.sill?.onWidgetUpdates((state) => setComponentUpdates(state.count))
    return () => {
      alive = false
      off?.()
    }
  }, [])

  // 第一次显示 / 重新显示时补一次，防止 push 发生在监听器挂上之前
  useEffect(() => {
    if (visible) void pullSnapshot()
  }, [visible, pullSnapshot])

  // 待办由 hook 之外的面板数据层持有：启动时读一次，之后靠 add/toggle/remove 的返回值同步
  useEffect(() => {
    let alive = true
    void window.sill?.listTodos().then((next) => {
      if (alive && next) setTodos(next)
    })
    return () => {
      alive = false
    }
  }, [])

  // 播放中的进度每秒推进一次，避免只按采样间隔跳；面板隐藏时不需要更新
  useEffect(() => {
    if (!visible || snapshot?.media?.status !== 'Playing') return
    const id = window.setInterval(() => setTick((value) => value + 1), 1000)
    return () => window.clearInterval(id)
  }, [visible, snapshot?.media?.status])

  const addTodo = useCallback(async (text: string) => {
    const next = await window.sill?.addTodo(text)
    if (next) setTodos(next)
  }, [])

  const toggleTodo = useCallback(async (id: string) => {
    const next = await window.sill?.toggleTodo(id)
    if (next) setTodos(next)
  }, [])

  const updateTodo = useCallback(async (id: string, text: string) => {
    const next = await window.sill?.updateTodo(id, text)
    if (next) setTodos(next)
  }, [])

  const restoreTodo = useCallback(async (item: TodoItem, index: number) => {
    const next = await window.sill?.restoreTodo(item, index)
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
    (id: string, direction: -1 | 1) => {
      const order = [...layout.order]
      const index = order.indexOf(id)
      const target = index + direction
      if (index < 0 || target < 0 || target >= order.length) return
      ;[order[index], order[target]] = [order[target], order[index]]
      setLayout({ ...layout, order })
    },
    [layout, setLayout]
  )

  const dropCard = useCallback(
    (from: string, to: string) => {
      if (from === to) return
      const order = [...layout.order]
      const a = order.indexOf(from)
      const b = order.indexOf(to)
      if (a < 0 || b < 0) return
      ;[order[a], order[b]] = [order[b], order[a]]
      setLayout({ ...layout, order })
    },
    [layout, setLayout]
  )

  const setCardSpan = useCallback(
    (id: string, span: number) => {
      setLayout({ ...layout, spans: { ...layout.spans, [id]: span } })
    },
    [layout, setLayout]
  )

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

  // 独立设置窗口里的「编辑布局」：关闭设置后由主进程唤出面板并进入编辑态
  useEffect(() => {
    const off = window.sill?.onEditLayout(() => {
      setCustomizing(false)
      setEditing(true)
    })
    return () => off?.()
  }, [])

  // 告诉主进程「有覆盖层」，Esc 的优先级据此切换
  useEffect(() => {
    void window.sill?.setOverlayOpen(customizing || editing)
  }, [customizing, editing])

  const openSettings = useCallback(async (): Promise<void> => {
    // 设置窗口可能还开着但开关已经被关掉：这时仍然聚焦它，避免叠出两层设置 UI
    const windowOpen = (await window.sill?.isSettingsWindowOpen()) === true
    if (windowOpen || settings.settingsInWindow) void window.sill?.openSettingsWindow()
    else setCustomizing(true)
  }, [settings.settingsInWindow])

  // 托盘更新气泡点击后打开设置（主进程发 settings:open）
  useEffect(() => {
    const off = window.sill?.onOpenSettings(() => void openSettings())
    return () => off?.()
  }, [openSettings])

  const update = settings.update
  const updateVisible =
    (update.status === 'available' ||
      update.status === 'downloading' ||
      update.status === 'downloaded') &&
    (!update.version || dismissedUpdate !== update.version)
  const updateLabel = update.version ? `Sill ${update.version}` : 'Sill'

  const media = snapshot?.media ?? null
  const mediaPosition = useMemo(() => {
    if (!media) return 0
    if (media.status !== 'Playing' || !snapshot) return media.position
    const elapsed = (Date.now() - snapshot.at) / 1000
    return Math.min(media.duration || Number.MAX_SAFE_INTEGER, media.position + elapsed)
    // tick 只用来按秒重算
  }, [media, snapshot, tick])
  const mediaProgress = media && media.duration > 0 ? (mediaPosition / media.duration) * 100 : 0

  const visibleOrder = layout.order.filter((id) => !layout.hidden.includes(id))
  const free = layout.mode === 'free'
  const freeReady = free && visibleOrder.every((id) => Boolean(layout.boxes[id]))
  const canvasHeight = freeReady
    ? Math.max(
        0,
        ...visibleOrder.map((id) => {
          const box = layout.boxes[id]
          return box ? box.y + box.h : 0
        })
      ) + 24
    : undefined

  // 新增组件 / 第一次进 free：按当时 flow 的真实排布量一次尺寸，补出缺失的 box。
  // 刻意不把 snapshot 放进依赖：数据每 1–5s 换一次引用，依赖它会让定时器永远被打断，
  // 结果就是「面板 layout.json 写着 free，实际一直按 flow 画」。
  // 量尺寸同步做（useLayoutEffect 时卡片已经在 DOM 里），不排 rAF：依赖一变就会
  // cleanup，rAF 会被取消，之前正是这样漏掉的。
  const seededRef = useRef('')
  const refineTimerRef = useRef<number | null>(null)
  useLayoutEffect(() => {
    // 磁盘布局还没回来之前不能写：否则补种会用默认布局覆盖用户的 hidden / boxes。
    if (!settings.layoutReady || !free || !snapshot) return
    const visible = layout.order.filter((id) => !layout.hidden.includes(id))
    const missing = visible.filter((id) => !layout.boxes[id])
    if (!missing.length) return
    const signature = `${visible.join('|')}#${missing.join('|')}`
    if (seededRef.current === signature) return
    seededRef.current = signature

    const sheet = sheetRef.current
    if (!sheet) {
      seededRef.current = ''
      return
    }
    const latest = layoutRef.current
    const stillMissing = latest.order
      .filter((id) => !latest.hidden.includes(id))
      .filter((id) => !latest.boxes[id])
    if (!stillMissing.length) return

    const base = sheet.getBoundingClientRect()
    const boxes = { ...latest.boxes }
    let changed = false
    for (const element of sheet.querySelectorAll<HTMLElement>('.card')) {
      const id = element.dataset.card
      if (!id || !stillMissing.includes(id)) continue
      const rect = element.getBoundingClientRect()
      boxes[id] = {
        x: Math.max(0, Math.round(rect.left - base.left)),
        y: Math.max(0, Math.round(rect.top - base.top)),
        w: Math.max(120, Math.round(rect.width)),
        h: Math.max(48, Math.round(rect.height))
      }
      changed = true
    }
    if (!changed) return
    setLayoutRef.current({ ...latest, boxes })

    // 媒体 / 进程这类卡的首帧是空的，数据晚到后才变高。对这次自动补出来的
    // box 做一次「只增不减」的修正，避免内容被 overflow:hidden 裁掉。
    const seededIds = stillMissing.slice()
    if (refineTimerRef.current) window.clearTimeout(refineTimerRef.current)
    refineTimerRef.current = window.setTimeout(() => {
      refineTimerRef.current = null
      const current = sheetRef.current
      if (!current) return
      const latestLayout = layoutRef.current
      const grown = { ...latestLayout.boxes }
      // 补种时的 y 是按「当时更矮的卡」算的；长高后要把下面的卡一起往下推，
      // 否则会出现叠卡。
      let grew = false
      for (const element of current.querySelectorAll<HTMLElement>('.card')) {
        const id = element.dataset.card
        if (!id || !seededIds.includes(id)) continue
        const box = grown[id]
        if (!box) continue
        const needed = Math.ceil(element.scrollHeight)
        if (needed <= box.h + 1) continue
        const delta = needed - box.h
        const oldBottom = box.y + box.h
        grown[id] = { ...box, h: needed }
        for (const other of Object.keys(grown)) {
          if (other === id) continue
          const target = grown[other]
          if (target.y >= oldBottom) grown[other] = { ...target, y: target.y + delta }
        }
        grew = true
      }
      if (grew) setLayoutRef.current({ ...latestLayout, boxes: grown })
    }, 2800)
  }, [free, snapshot, layout.order, layout.hidden, layout.boxes, settings.layoutReady])

  useEffect(
    () => () => {
      if (refineTimerRef.current) window.clearTimeout(refineTimerRef.current)
    },
    []
  )
  const updateBox = useCallback(
    (id: string, box: WidgetBox) => {
      settings.setLayout({
        ...layout,
        boxes: { ...layout.boxes, [id]: box }
      })
    },
    [layout, settings]
  )

  /** 组件只认这一份 context：数据、语言、宿主回调都在这里 */
  const widgetContext: WidgetContext = {
    language: settings.language,
    now,
    snapshot,
    todos,
    mediaPosition,
    mediaProgress,
    mediaCommand,
    onAddTodo: addTodo,
    onToggleTodo: toggleTodo,
    onUpdateTodo: updateTodo,
    onRestoreTodo: restoreTodo,
    onRemoveTodo: removeTodo
  }

  return (
    <div
      className="rail"
      data-visible={visible}
      data-customizing={customizing}
      data-editing={editing}
    >
      <span className="rail__atmo" aria-hidden="true" />
      <span className="rail__grain" aria-hidden="true" />
      <span className="rail__halo" aria-hidden="true" />
      <span className="rail__sheen" aria-hidden="true" />
      <span className="rail__rim" aria-hidden="true" />

      {editing ? (
        <div className="layout-bar">
          <span className="layout-bar__label">{t(settings.language, 'layout.title')}</span>
          <span className="layout-bar__hint">{t(settings.language, 'layout.hint')}</span>
          <button type="button" onClick={() => void settings.resetLayout()}>
            {t(settings.language, 'layout.reset')}
          </button>
          <button
            type="button"
            onClick={() =>
              settings.setLayout({
                ...layout,
                mode: layout.mode === 'free' ? 'flow' : 'free'
              })
            }
          >
            {t(
              settings.language,
              layout.mode === 'free' ? 'layout.flow' : 'layout.free'
            )}
          </button>
          <button type="button" className="layout-bar__done" onClick={() => setEditing(false)}>
            {t(settings.language, 'layout.done')}
          </button>
        </div>
      ) : null}

      <div className="rail__scroll" inert={customizing}>
        <div
          className="sheet"
          data-cols={columns}
          data-free={freeReady ? 'true' : undefined}
          ref={sheetRef}
          style={freeReady ? { minHeight: `${canvasHeight}px` } : undefined}
        >
          <header className="row sheet__head">
            <div className="brand">
              <BrandMark />
              <span className="brand__word">sill</span>
            </div>
            <div className="headtools">
              <span className="chip">{formatHotkey(settings.hotkey)}</span>
              <button
                className="iconbtn"
                type="button"
                aria-label={t(settings.language, 'settings.title')}
                aria-haspopup="dialog"
                aria-expanded={customizing}
                title={t(settings.language, 'settings.title')}
                data-updates={componentUpdates > 0 ? 'true' : undefined}
                onClick={() => void openSettings()}
              >
                <SlidersIcon />
              </button>
            </div>
          </header>

          {visibleOrder.map((id) => {
            const definition = registry.byId[id]
            if (!definition) return null
            return (
              <WidgetShell
                key={id}
                definition={definition}
                layout={layout}
                columns={columns}
                editing={editing}
                free={freeReady}
                box={layout.boxes[id]}
                dragId={dragId}
                language={settings.language}
                onMove={moveCard}
                onSpan={setCardSpan}
                onBox={(box) => updateBox(id, box)}
                onDragStart={setDragId}
                onDragEnd={() => setDragId(null)}
                onDrop={dropCard}
              >
                {definition.render(widgetContext)}
              </WidgetShell>
            )
          })}
          {!visibleOrder.length ? (
            <div className="sheet__empty sub">{t(settings.language, 'widgets.empty')}</div>
          ) : null}
        </div>
      </div>

      {updateVisible ? (
        <div className="update-banner" role="status">
          <div className="update-banner__copy">
            <span className="update-banner__title">
              {update.status === 'available'
                ? `${t(settings.language, 'general.updateAvailable')} · ${updateLabel}`
                : update.status === 'downloading'
                  ? `${t(settings.language, 'general.downloading')} ${update.progress ?? 0}%`
                  : t(settings.language, 'general.updateReady')}
            </span>
            {update.status === 'downloaded' ? (
              <span className="update-banner__note">
                {t(settings.language, 'general.updateHint')}
              </span>
            ) : null}
          </div>
          {update.status === 'available' ? (
            <button
              className="update-banner__action"
              type="button"
              onClick={() => settings.downloadUpdate()}
            >
              {t(settings.language, 'general.download')}
            </button>
          ) : update.status === 'downloaded' ? (
            <button
              className="update-banner__action"
              type="button"
              onClick={() => settings.installUpdate()}
            >
              {t(settings.language, 'general.restartUpdate')}
            </button>
          ) : null}
          <button
            className="update-banner__dismiss"
            type="button"
            aria-label={t(settings.language, 'general.later')}
            onClick={() => setDismissedUpdate(update.version ?? '')}
          >
            ×
          </button>
        </div>
      ) : null}

      <div className="footer">
        <span className="sub">{t(settings.language, 'footer.dismiss')}</span>
        <span className="cap">sill{settings.version ? ` · v${settings.version}` : ''}</span>
      </div>

      {customizing ? (
        <CustomizeSheet
          theme={settings.theme}
          onChange={settings.updateTheme}
          onClose={() => {
            settings.flushTheme()
            setCustomizing(false)
          }}
          onReset={settings.resetTheme}
          hotkey={settings.hotkey}
          onHotkeyChange={settings.changeHotkey}
          panelWidth={settings.panelWidth}
          panelHeight={settings.panelHeight}
          maxWidth={settings.limits.maxWidth}
          maxHeight={settings.limits.maxHeight}
          columns={columns}
          onPanelWidthChange={settings.changePanelWidth}
          onPanelHeightChange={settings.changePanelHeight}
          onPanelSizeChange={settings.changePanelSize}
          onResetSize={settings.resetPanelSize}
          side={settings.side}
          onSideChange={settings.changeSide}
          edgeGap={settings.edgeGap}
          onEdgeGapChange={settings.changeEdgeGap}
          language={settings.language}
          onLanguageChange={settings.changeLanguage}
          settingsInWindow={settings.settingsInWindow}
          onSettingsInWindowChange={settings.changeSettingsInWindow}
          weatherLocation={settings.weatherLocation}
          onWeatherLocationChange={settings.changeWeatherLocation}
          monitorIntervalMs={settings.monitorIntervalMs}
          onMonitorIntervalChange={settings.changeMonitorIntervalMs}
          startAtLogin={settings.startAtLogin}
          onStartAtLoginChange={settings.changeStartAtLogin}
          autoUpdate={settings.autoUpdate}
          onAutoUpdateChange={settings.changeAutoUpdate}
          update={settings.update}
          onCheckUpdate={settings.checkUpdate}
          onDownloadUpdate={settings.downloadUpdate}
          onInstallUpdate={settings.installUpdate}
          onEditLayout={() => {
            setCustomizing(false)
            setEditing(true)
          }}
          layoutMode={layout.mode}
          onLayoutModeChange={(mode) => settings.setLayout({ ...layout, mode })}
          widgets={settings.widgets}
          onToggleWidget={settings.toggleWidget}
          version={settings.version}
        />
      ) : null}

      <ResizeHandles
        side={settings.side}
        language={settings.language}
        onCommitted={(width) => {
          setColumns(columnsForWidth(width))
        }}
      />
    </div>
  )
}
