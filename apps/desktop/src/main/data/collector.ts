import { spawn, type ChildProcess } from 'node:child_process'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import type { MediaSample, ProcessSample } from '../../shared/data'
import { RESOURCES_DIR } from '../paths'

/** collector.ps1 按当前监测间隔输出的一行 JSON */
export interface CollectedSample {
  down: number
  up: number
  gpu: number | null
  gpuMem: number | null
  gpuTotal: number | null
  procs: ProcessSample[]
  media: MediaSample | null
}

let child: ChildProcess | null = null
let wanted = false
let restartTimer: NodeJS.Timeout | null = null
let latest: CollectedSample | null = null
let latestAt = 0
let intervalMs = 2000

function normalizeProcs(raw: unknown): ProcessSample[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({
      name: String(item.name ?? ''),
      mb: Number(item.mb) || 0
    }))
    .filter((item) => item.name)
}

function normalizeMedia(raw: unknown): MediaSample | null {
  if (!raw || typeof raw !== 'object') return null
  const media = raw as Record<string, unknown>
  const title = String(media.title ?? '')
  if (!title) return null
  return {
    title,
    artist: String(media.artist ?? ''),
    album: String(media.album ?? ''),
    status: String(media.status ?? ''),
    position: Number(media.position) || 0,
    duration: Number(media.duration) || 0,
    app: String(media.app ?? '')
  }
}

function spawnCollector(): void {
  if (!wanted || child) return
  const script = join(RESOURCES_DIR, 'collector.ps1')
  const proc = spawn(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      script,
      '-IntervalMs',
      String(intervalMs)
    ],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }
  )
  child = proc

  if (proc.stdout) {
    const lines = createInterface({ input: proc.stdout })
    lines.on('line', (line) => {
      const text = line.trim()
      if (!text.startsWith('{')) return
      try {
        const raw = JSON.parse(text) as Record<string, unknown>
        latest = {
          down: Number(raw.down) || 0,
          up: Number(raw.up) || 0,
          gpu: raw.gpu == null ? null : Number(raw.gpu),
          gpuMem: raw.gpuMem == null ? null : Number(raw.gpuMem),
          gpuTotal: raw.gpuTotal == null ? null : Number(raw.gpuTotal),
          procs: normalizeProcs(raw.procs),
          media: normalizeMedia(raw.media)
        }
        latestAt = Date.now()
      } catch {
        // 半行或格式不完整：丢掉，等下一行
      }
    })
  }

  proc.on('error', (error) => {
    console.error('[sill] collector 启动失败：', error)
    if (child === proc) child = null
  })

  proc.on('exit', () => {
    if (child !== proc) return
    child = null
    if (!wanted) return
    restartTimer = setTimeout(spawnCollector, 5000)
  })
}

export function startCollector(nextIntervalMs = 2000): void {
  wanted = true
  const next = Math.max(500, Math.min(10000, Math.round(nextIntervalMs) || 2000))
  if (restartTimer) {
    clearTimeout(restartTimer)
    restartTimer = null
  }
  if (next !== intervalMs) {
    intervalMs = next
    if (child) {
      const old = child
      child = null
      old.kill()
    }
  }
  if (child) return
  spawnCollector()
}

export function stopCollector(): void {
  wanted = false
  if (restartTimer) {
    clearTimeout(restartTimer)
    restartTimer = null
  }
  const old = child
  child = null
  old?.kill()
}

export function getCollected(): CollectedSample | null {
  if (!latest) return null
  // 采集进程卡住时不要无限展示旧数据；阈值按当前采样间隔放宽。
  if (Date.now() - latestAt > Math.max(intervalMs * 2, 4000)) return null
  return latest
}
