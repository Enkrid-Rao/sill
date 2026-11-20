// 内置「系统」卡：CPU / RAM / GPU 三条读数 + 网络吞吐。
// 数字、单位、网络方向和 aria 都由这里格式化；绑定只负责弧长与静态文案。
const el = (id) => root.getElementById(id)

const STALL_FRAMES = 6
let emptyFrames = 0

function formatRate(bytes) {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${Math.round(bytes)} B/s`
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KB/s`
  return `${(bytes / 1024 ** 2).toFixed(1)} MB/s`
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function setBar(id, value) {
  const bar = el(id)
  if (!bar) return
  if (!finite(value)) {
    bar.removeAttribute('aria-valuenow')
    return
  }
  bar.setAttribute('aria-valuenow', String(Math.round(Math.max(0, Math.min(100, value)))))
}

sill.onData(({ data }) => {
  const cpu = data.cpu ?? {}
  const mem = data.mem ?? {}
  const gpu = data.gpu ?? {}
  const net = data.net ?? {}
  const hasSamples = finite(cpu.usage) || finite(mem.percent)

  const cpuEl = el('cpu')
  if (cpuEl) cpuEl.textContent = finite(cpu.usage) ? `${Math.round(cpu.usage)}%` : '—'

  const memEl = el('mem')
  if (memEl) {
    memEl.textContent = finite(mem.percent)
      ? `${Math.round(mem.percent)}% · ${Number(mem.usedGb ?? 0).toFixed(1)} GB`
      : '—'
  }

  const gpuEl = el('gpu')
  if (gpuEl) gpuEl.textContent = finite(gpu.usage) ? `${Math.round(gpu.usage)}%` : '—'

  const netEl = el('net')
  if (netEl) {
    const down = formatRate(net.downBps)
    const up = formatRate(net.upBps)
    netEl.textContent =
      down === '—' && up === '—' ? '—' : `↓ ${down} · ↑ ${up}`
  }

  setBar('cpuBar', cpu.usage)
  setBar('memBar', mem.percent)
  setBar('gpuBar', gpu.usage)

  const hint = el('hint')
  const sampling = el('hintSampling')
  const stalled = el('hintStalled')
  if (hint && sampling && stalled) {
    if (hasSamples) {
      emptyFrames = 0
      hint.hidden = true
      stalled.hidden = true
      sampling.hidden = false
    } else {
      emptyFrames += 1
      hint.hidden = false
      const dead = emptyFrames >= STALL_FRAMES
      stalled.hidden = !dead
      sampling.hidden = dead
    }
  }
})
