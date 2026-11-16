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

export interface MediaSample {
  title: string
  artist: string
  album: string
  /** Playing / Paused / Stopped / Closed */
  status: string
  position: number
  duration: number
  app: string
}

export interface PanelSnapshot {
  cpu: number
  cores: number
  memPct: number
  /** GB */
  memUsed: number
  /** GB */
  memTotal: number
  /** bytes/s */
  down: number
  up: number
  gpu: number | null
  /** MiB */
  gpuMem: number | null
  /** MiB */
  gpuTotal: number | null
  procs: ProcessSample[]
  media: MediaSample | null
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
