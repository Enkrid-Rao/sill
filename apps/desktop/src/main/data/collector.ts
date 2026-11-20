import { spawn, type ChildProcess } from 'node:child_process'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import type { GpuProcessSample, MediaSample, ProcessSample } from '../../shared/data'
import { RESOURCES_DIR } from '../paths'

/** collector.ps1 按当前监测间隔输出的一行 JSON */
export interface CollectedSample {
  /** collector 输出这一行的时间；媒体 position 也以它为基准 */
  sampledAt: number
  down: number
  up: number
  gpu: number | null
  gpuMem: number | null
  gpuTotal: number | null
  gpuProcs: GpuProcessSample[]
  swapUsedMb: number | null
  swapTotalMb: number | null
  procs: ProcessSample[]
  media: MediaSample | null
}

let child: ChildProcess | null = null
let wanted = false
let restartTimer: NodeJS.Timeout | null = null
let latest: CollectedSample | null = null
let latestAt = 0
let intervalMs = 2000
let gpuTimer: NodeJS.Timeout | null = null
let gpuChild: ChildProcess | null = null

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

function normalizeGpuProcs(raw: unknown): GpuProcessSample[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({
      name: String(item.name ?? ''),
      pct: Math.max(0, Math.min(100, Math.round(Number(item.pct) || 0)))
    }))
    .filter((item) => item.name && item.pct > 0)
    .slice(0, 3)
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
    app: String(media.app ?? ''),
    artwork: typeof media.artwork === 'string' ? media.artwork : null,
    lyricLine: typeof media.lyricLine === 'string' ? media.lyricLine : null
  }
}

function scheduleGpuProcs(delay = 15000): void {
  if (!wanted || gpuTimer || gpuChild) return
  gpuTimer = setTimeout(() => {
    gpuTimer = null
    sampleGpuProcs()
  }, delay)
}

/**
 * GPU 进程计数单独跑：Get-Counter 在这台机器上可能阻塞数秒，
 * 放进主采集循环会把 1s/2s 的 JSON 行拖成 10s+，视图就会误判为 stale。
 */
function sampleGpuProcs(): void {
  if (!wanted || gpuChild) return
  const script = join(RESOURCES_DIR, 'gpu-procs.ps1')
  const proc = spawn(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }
  )
  gpuChild = proc
  let output = ''
  const timeout = setTimeout(() => proc.kill(), 30000)

  proc.stdout?.on('data', (chunk: Buffer) => {
    output += chunk.toString('utf8')
  })
  proc.on('error', () => {
    clearTimeout(timeout)
    if (gpuChild === proc) gpuChild = null
    scheduleGpuProcs()
  })
  proc.on('exit', () => {
    clearTimeout(timeout)
    if (gpuChild === proc) gpuChild = null
    const text = output.trim()
    if (text && latest) {
      try {
        latest = { ...latest, gpuProcs: normalizeGpuProcs(JSON.parse(text)) }
      } catch {
        // 半截输出：下一次再试
      }
    }
    scheduleGpuProcs()
  })
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
    { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }
  )
  child = proc
  proc.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf8').trim()
    if (text) console.error('[sill] collector stderr:', text.slice(0, 500))
  })

  if (proc.stdout) {
    const lines = createInterface({ input: proc.stdout })
    lines.on('line', (line) => {
      const text = line.trim()
      if (!text.startsWith('{')) return
      try {
        const raw = JSON.parse(text) as Record<string, unknown>
        const procs = normalizeProcs(raw.procs)
        const gpuProcs = normalizeGpuProcs(raw.gpuProcs)
        latest = {
          sampledAt: Date.now(),
          down: Number(raw.down) || 0,
          up: Number(raw.up) || 0,
          gpu: raw.gpu == null ? null : Number(raw.gpu),
          gpuMem: raw.gpuMem == null ? null : Number(raw.gpuMem),
          gpuTotal: raw.gpuTotal == null ? null : Number(raw.gpuTotal),
          gpuProcs: gpuProcs.length ? gpuProcs : (latest?.gpuProcs ?? []),
          swapUsedMb: raw.swapUsedMb == null ? null : Number(raw.swapUsedMb),
          swapTotalMb: raw.swapTotalMb == null ? null : Number(raw.swapTotalMb),
          // 进程采样偶尔会给空数组（CIM/PowerShell 忙），不要让这一帧把
          // 上一帧已经画出来的进程行清空：保留 last good，等下一帧。
          procs: procs.length ? procs : (latest?.procs ?? []),
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

  proc.on('exit', (code) => {
    if (child !== proc) return
    child = null
    console.error('[sill] collector exited', code)
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
  if (!child) spawnCollector()
  scheduleGpuProcs(12000)
}

export function stopCollector(): void {
  wanted = false
  if (restartTimer) {
    clearTimeout(restartTimer)
    restartTimer = null
  }
  if (gpuTimer) {
    clearTimeout(gpuTimer)
    gpuTimer = null
  }
  const gpu = gpuChild
  gpuChild = null
  gpu?.kill()
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






