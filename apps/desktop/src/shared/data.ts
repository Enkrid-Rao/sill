/** 主进程采集、渲染进程消费的面板数据。 */

import type { WeatherSnapshot } from './weather'

/** 可选的系统监测刷新间隔（毫秒）。 */
export const MONITOR_INTERVALS = [1000, 2000, 3000, 5000] as const

export type MonitorInterval = (typeof MONITOR_INTERVALS)[number]

export const DEFAULT_MONITOR_INTERVAL: MonitorInterval = 2000

export function normalizeMonitorInterval(value: unknown): MonitorInterval {
  const numeric = Number(value)
  return MONITOR_INTERVALS.find((interval) => interval === numeric) ?? DEFAULT_MONITOR_INTERVAL
}

export interface ProcessSample {
  name: string
  mb: number
}

export interface GpuProcessSample {
  name: string
  /** 各 GPU 引擎利用率之和，夹到 0–100 */
  pct: number
}

export interface MediaSample {
  title: string
  artist: string
  album: string
  /** Playing / Paused / Stopped / Closed */
  status: string
  position: number
  duration: number
  app: string
  /** 封面 data URL；当前 Windows SMTC 读取器暂未填充，留给后续官方接口 */
  artwork?: string | null
  /** 当前歌词行；由共享 lyrics provider 后续填充，组件自己不经过音乐 App 私有接口 */
  lyricLine?: string | null
}

export interface PanelSnapshot {
  cpu: number
  cores: number
  /** 约略 CPU 主频（GHz）；null = 系统没提供 */
  cpuGhz?: number | null
  memPct: number
  /** GB */
  memUsed: number
  /** GB */
  memTotal: number
  /** 虚拟内存（commit）使用率 0–100 */
  swapPct: number | null
  /** GB */
  swapUsed: number | null
  /** GB */
  swapTotal: number | null
  /** bytes/s */
  down: number
  up: number
  gpu: number | null
  /** MiB */
  gpuMem: number | null
  /** MiB */
  gpuTotal: number | null
  gpuProcs: GpuProcessSample[]
  procs: ProcessSample[]
  media: MediaSample | null
  /** 媒体样本最后一次到达的时间；0 / undefined = 还没拿到过（不是“没有播放”） */
  mediaAt?: number
  weather: WeatherSnapshot | null
  /** 系统主音量 0–100；-1 = 还没读上来 */
  volume: number
  muted: boolean
  at: number
}

/** 媒体控制进程回报的一份状态（传输键 + 系统音量） */
export interface MediaControlState {
  ok: boolean
  volume: number
  muted: boolean
  status: string
  title: string
  artist: string
}

export interface TodoItem {
  id: string
  text: string
  done: boolean
}



