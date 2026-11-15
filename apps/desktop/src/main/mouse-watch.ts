import { spawn, type ChildProcess } from 'node:child_process'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { RESOURCES_DIR } from './paths'

/**
 * 面板不抢焦点，BrowserWindow 收不到 blur，所以用一个轻量 PowerShell
 * 轮询全局左键。只在面板显示期间存在；隐藏即 kill。
 */
let child: ChildProcess | null = null
let wanted = false
let restartTimer: NodeJS.Timeout | null = null
let handler: (() => void) | null = null

function spawnWatcher(): void {
  if (!wanted || child) return
  const script = join(RESOURCES_DIR, 'mouse-watch.ps1')
  const proc = spawn(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }
  )
  child = proc

  if (proc.stdout) {
    createInterface({ input: proc.stdout }).on('line', (line) => {
      if (line.trim() === 'click') handler?.()
    })
  }

  proc.on('error', (error) => {
    console.error('[sill] 外部点击监视器启动失败：', error)
    child = null
  })

  proc.on('exit', () => {
    child = null
    if (!wanted) return
    restartTimer = setTimeout(spawnWatcher, 1500)
  })
}

export function startMouseWatch(onClick: () => void): void {
  handler = onClick
  wanted = true
  if (child) return
  spawnWatcher()
}

export function stopMouseWatch(): void {
  wanted = false
  handler = null
  if (restartTimer) {
    clearTimeout(restartTimer)
    restartTimer = null
  }
  child?.kill()
  child = null
}

// 父进程退出时别把 PowerShell 留在后台
process.once('exit', () => {
  child?.kill()
})
