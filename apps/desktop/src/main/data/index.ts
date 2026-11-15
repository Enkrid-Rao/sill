import type { PanelSnapshot } from '../../shared/data'
import { getCollected, startCollector, stopCollector } from './collector'
import { getMediaControlState, startMediaControl, stopMediaControl } from './media-control'
import { resetCpu, sampleSystem } from './system'
import { getWeather, startWeather, stopWeather } from '../weather'

const TICK_MS = 1500

let timer: NodeJS.Timeout | null = null

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
  snapshot = {
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
}

/** 面板显示时开始采样；隐藏时停掉，不在后台空转 */
export function startData(): void {
  if (timer) return
  resetCpu()
  startCollector()
  startMediaControl()
  startWeather()
  tick()
  timer = setInterval(tick, TICK_MS)
}

export function stopData(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  stopCollector()
  stopMediaControl()
  stopWeather()
}

export function getSnapshot(): PanelSnapshot {
  // 音量 / 静音由媒体控制进程即时回报，不必等下一个 1.5s tick；
  // 否则刚点完静音立刻拉快照会把旧值又盖回去。
  const control = getMediaControlState()
  return { ...snapshot, volume: control.volume, muted: control.muted }
}
