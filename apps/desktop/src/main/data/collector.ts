import { spawn, type ChildProcess } from 'node:child_process'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import type { MediaSample, ProcessSample } from '../../shared/data'
import { RESOURCES_DIR } from '../paths'

/** collector.ps1 每 2 秒输出的一行 JSON */
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
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script],
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
      } catch {
        // 半行或格式不完整：丢掉，等下一行
      }
    })
  }

  proc.on('error', (error) => {
    console.error('[sill] collector 启动失败：', error)
    child = null
  })

  proc.on('exit', () => {
    child = null
    if (!wanted) return
    restartTimer = setTimeout(spawnCollector, 5000)
  })
}

export function startCollector(): void {
  wanted = true
  if (child) return
  spawnCollector()
}

export function stopCollector(): void {
  wanted = false
  if (restartTimer) {
    clearTimeout(restartTimer)
    restartTimer = null
  }
  child?.kill()
  child = null
  // 不清 latest：下次唤出先用上一帧，避免面板先闪一段「—」
}

export function getCollected(): CollectedSample | null {
  return latest
}
