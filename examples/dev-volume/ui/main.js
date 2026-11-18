const { execFile } = require('node:child_process')
const path = require('node:path')

let helper = ''
let started = false
let busy = false
let latest = null
let timer = null

const master = document.querySelector('#master')
const masterValue = document.querySelector('#master-value')
const masterMute = document.querySelector('#master-mute')
const apps = document.querySelector('#apps')
const status = document.querySelector('#status')

function run(command, ...args) {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', helper, command, ...args],
      { windowsHide: true, timeout: 8000 },
      (error, stdout, stderr) => {
        if (error) return reject(new Error((stderr || error.message).trim()))
        try {
          resolve(JSON.parse(stdout))
        } catch {
          reject(new Error('helper 返回了非法 JSON'))
        }
      }
    )
  })
}

function render(state) {
  latest = state
  const volume = Math.round((state.master?.volume ?? 0) * 100)
  master.value = String(volume)
  masterValue.textContent = `${volume}%`
  masterMute.textContent = state.master?.muted ? '取消静音' : '静音'

  apps.replaceChildren()
  const sessions = Array.isArray(state.sessions) ? state.sessions : []
  if (!sessions.length) {
    const empty = document.createElement('div')
    empty.className = 'audio__empty'
    empty.textContent = '当前没有活跃的音频会话'
    apps.append(empty)
    return
  }

  for (const session of sessions) {
    const row = document.createElement('div')
    row.className = 'audio__row'

    const name = document.createElement('span')
    name.className = 'audio__name'
    name.textContent = session.name || `PID ${session.pid}`
    name.title = `${session.name} · PID ${session.pid} · ${session.count || 1} 个会话`

    const slider = document.createElement('input')
    slider.type = 'range'
    slider.min = '0'
    slider.max = '100'
    slider.step = '1'
    slider.value = String(Math.round((session.volume ?? 0) * 100))

    const value = document.createElement('span')
    value.className = 'audio__value'
    value.textContent = `${slider.value}%`

    const mute = document.createElement('button')
    mute.className = 'audio__mute'
    mute.type = 'button'
    mute.textContent = session.muted ? '取消静音' : '静音'

    slider.addEventListener('input', () => {
      value.textContent = `${slider.value}%`
    })
    slider.addEventListener('change', async () => {
      try {
        render(await run('set-volume', '-ProcessId', String(session.pid), '-Value', String(slider.value / 100)))
      } catch (error) {
        status.textContent = String(error.message || error)
      }
    })
    mute.addEventListener('click', async () => {
      try {
        render(await run('set-mute', '-ProcessId', String(session.pid), '-Muted', session.muted ? 'false' : 'true'))
      } catch (error) {
        status.textContent = String(error.message || error)
      }
    })

    row.append(name, slider, value, mute)
    apps.append(row)
  }
}

async function refresh() {
  if (!helper || busy) return
  busy = true
  try {
    status.textContent = '正在读取音频会话…'
    render(await run('list'))
    status.textContent = latest?.sessions?.length
      ? `已读取 ${latest.sessions.length} 个应用`
      : '当前没有活跃的音频会话'
  } catch (error) {
    status.textContent = String(error.message || error)
  } finally {
    busy = false
  }
}

master.addEventListener('input', () => {
  masterValue.textContent = `${master.value}%`
})
master.addEventListener('change', async () => {
  try {
    render(await run('set-master', '-Value', String(master.value / 100)))
  } catch (error) {
    status.textContent = String(error.message || error)
  }
})
masterMute.addEventListener('click', async () => {
  try {
    render(await run('set-master-mute', '-Muted', latest?.master?.muted ? 'false' : 'true'))
  } catch (error) {
    status.textContent = String(error.message || error)
  }
})
document.querySelector('#refresh').addEventListener('click', () => void refresh())

sill.ready(({ dir }) => {
  if (started) return
  started = true
  if (!dir) {
    status.textContent = '需要 trusted 组件才能访问本机 helper'
    return
  }
  helper = path.join(dir, 'ui/assets/audio-helper.ps1')
  void refresh()
  timer = setInterval(() => void refresh(), 2500)
})

window.addEventListener('beforeunload', () => {
  if (timer) clearInterval(timer)
})
