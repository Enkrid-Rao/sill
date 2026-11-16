import type { PanelSnapshot } from '../../shared/data'
import { loadSettings } from '../settings'
import { getCollected, startCollector, stopCollector } from './collector'
import { getMediaControlState, startMediaControl, stopMediaControl } from './media-control'
import { resetCpu, sampleSystem } from './system'
import { getWeather, startWeather, stopWeather } from '../weather'

/** 面板显示后先等一个短窗口再采第一帧，避免 CPU 差值接近 0 显示成 0%。 */
const PRIME_MS = 250

type SnapshotListener = (snapshot: PanelSnapshot) => void

let timer: NodeJS.Timeout | null = null
let primeTimer: NodeJS.Timeout | null = null
let listener: SnapshotListener | null = null
let intervalMs = 2000

let snapshot: PanelSnapshot = {
  cpu: 0,
  cores: 0,
  memPct: 0,
  memUsed: 0,
  memTotal: 0,
  down: 0,
  up: 0,
  gpu: null,
  gpuMem: null,
  gpuTotal: null,
  procs: [],
  media: null,
  weather: null,
  volume: -1,
  muted: false,
  at: 0
}

function tick(): void {
  const system = sampleSystem()
  const extra = getCollected()
  const control = getMediaControlState()
  const next: PanelSnapshot = {
    ...system,
    down: extra?.down ?? 0,
    up: extra?.up ?? 0,
    gpu: extra?.gpu ?? null,
    gpuMem: extra?.gpuMem ?? null,
    gpuTotal: extra?.gpuTotal ?? null,
    procs: extra?.procs ?? [],
    media: extra?.media ?? null,
    weather: getWeather(),
    volume: control.volume,
    muted: control.muted,
    at: Date.now()
  }
  snapshot = next
  listener?.(next)
}

/**
 * 面板显示时开始采样；隐藏时停掉，不在后台空转。
 * 数据由主进程主动推给面板，不再依赖渲染进程轮询——这样快捷键唤出后不需要
 * 先点一下面板才能收到新数据。
 */
export function startData(onSnapshot?: SnapshotListener): void {
  if (onSnapshot) listener = onSnapshot
  const nextInterval = loadSettings().monitorIntervalMs

  if (timer) {
    if (nextInterval !== intervalMs) {
      intervalMs = nextInterval
      clearInterval(timer)
      startCollector(intervalMs)
      tick()
      timer = setInterval(tick, intervalMs)
    }
    return
  }

  if (primeTimer) {
    intervalMs = nextInterval
    return
  }

  intervalMs = nextInterval
  resetCpu()
  startCollector(intervalMs)
  startMediaControl()
  startWeather()
  primeTimer = setTimeout(() => {
    primeTimer = null
    tick()
    timer = setInterval(tick, intervalMs)
  }, PRIME_MS)
}

export function refreshDataCadence(): void {
  const nextInterval = loadSettings().monitorIntervalMs
  if (nextInterval === intervalMs) return
  intervalMs = nextInterval
  // 还在等第一帧：prime 回调会读新的 intervalMs。
  if (primeTimer || !timer) return
  clearInterval(timer)
  startCollector(intervalMs)
  tick()
  timer = setInterval(tick, intervalMs)
}

export function stopData(): void {
  if (primeTimer) {
    clearTimeout(primeTimer)
    primeTimer = null
  }
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  listener = null
  stopCollector()
  stopMediaControl()
  stopWeather()
}

export function getSnapshot(): PanelSnapshot {
  // 音量 / 静音由媒体控制进程即时回报，不必等下一个 tick；
  // 否则刚点完静音立刻拉快照会把旧值又盖回去。
  const control = getMediaControlState()
  return { ...snapshot, volume: control.volume, muted: control.muted }
}
