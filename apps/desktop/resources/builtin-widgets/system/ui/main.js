// 内置「系统」卡：数据由 manifest 绑定，数字格式化与网络条在 JS 里做。
const el = (id) => root.getElementById(id)

function bytes(bps) {
  if (!Number.isFinite(bps)) return '—'
  if (bps >= 1024 * 1024) return (bps / 1024 / 1024).toFixed(1) + ' MB/s'
  if (bps >= 1024) return Math.round(bps / 1024) + ' KB/s'
  return Math.round(bps) + ' B/s'
}

sill.onData(({ data }) => {
  const cpu = data.cpu
  const mem = data.mem
  const gpu = data.gpu
  const net = data.net

  const cpuEl = el('cpu')
  if (cpuEl) cpuEl.textContent = cpu?.usage == null ? '—' : Math.round(cpu.usage) + '%'

  const memEl = el('mem')
  if (memEl) {
    memEl.textContent =
      mem?.percent == null
        ? '—'
        : Math.round(mem.percent) + '% · ' + Number(mem.usedGb ?? 0).toFixed(1) + ' GB'
  }

  const gpuEl = el('gpu')
  if (gpuEl) gpuEl.textContent = gpu?.usage == null ? '—' : Math.round(gpu.usage) + '%'

  const netEl = el('net')
  if (netEl) netEl.textContent = net?.downBps == null ? '—' : '↓ ' + bytes(net.downBps)

  // 网络没有百分比 provider：按 1 MB/s 满格，只做活动指示
  const netBar = el('netbar')
  if (netBar) {
    const value = Math.min(100, Math.round((Number(net?.downBps ?? 0) / (1024 * 1024)) * 100))
    netBar.style.setProperty('--sill-value', String(value))
  }
})
