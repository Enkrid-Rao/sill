import type { PanelSnapshot } from '../../shared/data'
import { getCollected, startCollector, stopCollector } from './collector'
import { resetCpu, sampleSystem } from './system'

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
  at: 0
}

function tick(): void {
  const system = sampleSystem()
  const extra = getCollected()
  snapshot = {
    ...system,
    down: extra?.down ?? 0,
    up: extra?.up ?? 0,
    gpu: extra?.gpu ?? null,
    gpuMem: extra?.gpuMem ?? null,
    gpuTotal: extra?.gpuTotal ?? null,
    procs: extra?.procs ?? [],
    media: extra?.media ?? null,
    at: Date.now()
  }
}

/** 面板显示时开始采样；隐藏时停掉，不在后台空转 */
export function startData(): void {
  if (timer) return
  resetCpu()
  startCollector()
  tick()
  timer = setInterval(tick, TICK_MS)
}

export function stopData(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  stopCollector()
}

export function getSnapshot(): PanelSnapshot {
  return snapshot
}
