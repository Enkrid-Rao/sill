import type { PanelSnapshot } from '../../shared/data'
import { loadSettings } from '../settings'
import { getCollected, startCollector } from './collector'
import { getMediaControlState, startMediaControl, stopMediaControl } from './media-control'
import { getMediaLyricLine } from './lyrics'
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
  cpuGhz: null,
  memPct: 0,
  memUsed: 0,
  memTotal: 0,
  swapPct: null,
  swapUsed: null,
  swapTotal: null,
  down: 0,
  up: 0,
  gpu: null,
  gpuMem: null,
  gpuTotal: null,
  gpuProcs: [],
  procs: [],
  procsAt: 0,
  gpuAt: 0,
  media: null,
  mediaAt: 0,
  weather: null,
  volume: -1,
  muted: false,
  at: 0
}

function tick(): void {
  const system = sampleSystem()
  const extra = getCollected()
  const control = getMediaControlState()
  const swapPct =
    extra?.swapTotalMb && extra.swapTotalMb > 0
      ? Number((((extra.swapUsedMb ?? 0) / extra.swapTotalMb) * 100).toFixed(1))
      : null
  const swapUsed = extra?.swapUsedMb == null ? null : extra.swapUsedMb / 1024
  const swapTotal = extra?.swapTotalMb == null ? null : extra.swapTotalMb / 1024
  const media = extra ? extra.media : snapshot.media
  const mediaAt = extra ? extra.sampledAt : (snapshot.mediaAt ?? 0)
  const mediaWithLyric = media
    ? { ...media, lyricLine: getMediaLyricLine(media, Date.now(), mediaAt) }
    : null
  const next: PanelSnapshot = {
    ...system,
    cpuGhz: system.speedGhz,
    // 采集缺一帧时保留上一帧的值；只有拿到新鲜样本时才覆盖。
    // 这样“偶尔漏采”不会把已经显示出来的进程 / 网络 / 媒体卡清空。
    down: extra ? extra.down : snapshot.down,
    up: extra ? extra.up : snapshot.up,
    gpu: extra?.gpu ?? snapshot.gpu,
    gpuMem: extra?.gpuMem ?? snapshot.gpuMem,
    gpuTotal: extra?.gpuTotal ?? snapshot.gpuTotal,
    gpuProcs: extra ? extra.gpuProcs : snapshot.gpuProcs,
    swapPct: swapPct ?? snapshot.swapPct,
    swapUsed: swapUsed ?? snapshot.swapUsed,
    swapTotal: swapTotal ?? snapshot.swapTotal,
    procs: extra ? extra.procs : snapshot.procs,
    procsAt: extra ? extra.sampledAt : (snapshot.procsAt ?? 0),
    gpuAt: extra ? extra.sampledAt : (snapshot.gpuAt ?? 0),
    media: mediaWithLyric,
    mediaAt,
    weather: getWeather(),
    volume: control.volume,
    muted: control.muted,
    at: Date.now()
  }
  snapshot = next
  listener?.(next)
}

/**
 * 面板显示时开始组装/推送快照；隐藏时停掉推送和媒体/天气，
 * 但保留 collector 常驻，这样下次唤出时 GPU / 网络已经是热的。
 */
export function startData(onSnapshot?: SnapshotListener): void {
  if (onSnapshot) listener = onSnapshot
  const nextInterval = loadSettings().monitorIntervalMs

  // 唤出面板时先把上一帧推给渲染进程：哪怕 collector 正在重启，
  // 卡片也先显示缓存，而不是从“正在采样…”重新开始。
  if (snapshot.at > 0) listener?.(getSnapshot())

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
  // 即使面板当前隐藏，也要让常驻 collector 换到新节拍。
  startCollector(intervalMs)
  // 还在等第一帧：prime 回调会读新的 intervalMs。
  if (primeTimer || !timer) return
  clearInterval(timer)
  tick()
  timer = setInterval(tick, intervalMs)
}

/** 应用启动时先把 collector 拉起来，第一次快捷键唤出时就有 GPU / 网速可显示。 */
export function warmCollector(): void {
  intervalMs = loadSettings().monitorIntervalMs
  startCollector(intervalMs)
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
  // collector 故意不停：常驻采样是“唤出即有网速 / GPU”的前提。
  // 应用退出时由 main/index.ts 调 stopCollector()。
  stopMediaControl()
  stopWeather()
}

export function getSnapshot(): PanelSnapshot {
  // 音量 / 静音由媒体控制进程即时回报，不必等下一个 tick；
  // 否则刚点完静音立刻拉快照会把旧值又盖回去。
  const control = getMediaControlState()
  return { ...snapshot, volume: control.volume, muted: control.muted }
}





