/** 主进程采集、渲染进程消费的面板数据。 */

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
  at: number
}

export interface TodoItem {
  id: string
  text: string
  done: boolean
}
