import { spawn, type ChildProcess } from 'node:child_process'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import type { MediaControlState } from '../../shared/data'
import { RESOURCES_DIR } from '../paths'

/**
 * 媒体控制：一个常驻的 Windows PowerShell 5.1 子进程。
 *
 * - 传输键走 SMTC（TryTogglePlayPause / TrySkipNext / TrySkipPrevious），
 *   所以作用在真正持有媒体会话的那个应用上，而不是「Sill 自己」。
 * - 音量走默认渲染设备的 WASAPI master volume（系统音量），
 *   不是某个播放器的应用内音量 —— SMTC 没有音量接口。
 * - 只在面板显示时启动（和 collector 同一生命周期），隐藏后立刻退出。
 */

let child: ChildProcess | null = null
let wanted = false
let restartTimer: NodeJS.Timeout | null = null
let pollTimer: NodeJS.Timeout | null = null
let polling = false

interface Pending {
  resolve: (state: MediaControlState | null) => void
  timer: NodeJS.Timeout
}

const pending: Pending[] = []

let state: MediaControlState = {
  ok: false,
  volume: -1,
  muted: false,
  status: '',
  title: '',
  artist: ''
}

function normalize(raw: unknown): MediaControlState | null {
  if (!raw || typeof raw !== 'object') return null
  const src = raw as Record<string, unknown>
  const volume = Number(src.volume)
  return {
    ok: src.ok === true,
    volume: Number.isFinite(volume) ? Math.max(-1, Math.min(100, Math.round(volume))) : -1,
    muted: src.muted === true,
    status: String(src.status ?? ''),
    title: String(src.title ?? ''),
    artist: String(src.artist ?? '')
  }
}

function settle(next: MediaControlState | null): void {
  const waiter = pending.shift()
  if (!waiter) return
  clearTimeout(waiter.timer)
  waiter.resolve(next)
}

function spawnHelper(): void {
  if (!wanted || child) return
  const script = join(RESOURCES_DIR, 'media-control.ps1')
  const proc = spawn(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script],
    { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] }
  )
  child = proc

  if (proc.stdout) {
    const lines = createInterface({ input: proc.stdout })
    lines.on('line', (line) => {
      const text = line.trim()
      if (!text.startsWith('{')) return
      try {
        const next = normalize(JSON.parse(text))
        if (!next) return
        state = next
        settle(next)
      } catch {
        // 半行 / 启动时的杂项输出：丢掉
      }
    })
  }

  proc.on('error', (error) => {
    console.error('[sill] 媒体控制启动失败：', error)
    child = null
    settle(null)
  })

  proc.on('exit', () => {
    child = null
    settle(null)
    if (!wanted) return
    restartTimer = setTimeout(spawnHelper, 1500)
  })
}

function ensureHelper(): boolean {
  if (child) return true
  spawnHelper()
  return Boolean(child)
}

function send(command: string, timeoutMs = 8000): Promise<MediaControlState | null> {
  if (!ensureHelper() || !child || !child.stdin || child.stdin.destroyed) {
    return Promise.resolve(null)
  }
  return new Promise((resolve) => {
    const waiter: Pending = {
      resolve,
      timer: setTimeout(() => {
        const index = pending.indexOf(waiter)
        if (index >= 0) pending.splice(index, 1)
        resolve(null)
      }, timeoutMs)
    }
    pending.push(waiter)
    try {
      child?.stdin?.write(`${command}\n`)
    } catch {
      clearTimeout(waiter.timer)
      const index = pending.indexOf(waiter)
      if (index >= 0) pending.splice(index, 1)
      resolve(null)
    }
  })
}

async function refresh(): Promise<void> {
  if (polling) return
  polling = true
  try {
    const next = await send('get')
    if (next) state = next
  } finally {
    polling = false
  }
}

export function startMediaControl(): void {
  wanted = true
  if (restartTimer) {
    clearTimeout(restartTimer)
    restartTimer = null
  }
  if (!child) spawnHelper()
  if (!pollTimer) {
    // 首次 get 会先等 PowerShell 编译完 C# 互操作（约 1s），之后再轮询就很轻
    void refresh()
    pollTimer = setInterval(() => void refresh(), 4000)
  }
}

export function stopMediaControl(): void {
  wanted = false
  if (restartTimer) {
    clearTimeout(restartTimer)
    restartTimer = null
  }
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  child?.kill()
  child = null
  while (pending.length) settle(null)
}

export function getMediaControlState(): MediaControlState {
  return state
}

export type MediaAction = 'playpause' | 'play' | 'pause' | 'next' | 'prev' | 'stop' | 'mute'

const ACTIONS: readonly MediaAction[] = ['playpause', 'play', 'pause', 'next', 'prev', 'stop', 'mute']

export async function mediaCommand(action: unknown, value?: unknown): Promise<MediaControlState | null> {
  let command: string
  if (action === 'volume') {
    const n = Number(value)
    if (!Number.isFinite(n)) return null
    command = `volume ${Math.max(0, Math.min(100, Math.round(n)))}`
  } else if (typeof action === 'string' && (ACTIONS as readonly string[]).includes(action)) {
    command = action
  } else {
    return null
  }

  const next = await send(command)
  if (next) state = next
  return next
}
