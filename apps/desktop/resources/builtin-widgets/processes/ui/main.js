// 内置「进程」卡：TOP 内存 + 显存占用。
const gb = (mb) => {
  if (mb == null || !Number.isFinite(Number(mb))) return '—'
  const value = Number(mb)
  return value >= 1024 ? (value / 1024).toFixed(1) + ' GB' : Math.round(value) + ' MB'
}

sill.onData(({ data }) => {
  const proc = data.proc ?? {}
  const rows = root.getElementById('rows')
  const placeholder = root.getElementById('placeholder')
  const topRam = proc.topRam ?? []
  if (placeholder) placeholder.hidden = topRam.length > 0
  if (rows) {
    const fragment = document.createDocumentFragment()
    for (const item of topRam.slice(0, 3)) {
      const row = document.createElement('div')
      row.className = 'proc__row'

      const name = document.createElement('span')
      name.className = 'proc__name'
      name.textContent = String(item?.name ?? '')

      const value = document.createElement('span')
      value.className = 'proc__mb'
      value.textContent = gb(item?.mb)

      row.append(name, value)
      fragment.append(row)
    }
    rows.replaceChildren(fragment)
  }

  const gpu = root.getElementById('gpu')
  if (gpu) {
    const used = proc.gpuMemMb
    const total = proc.gpuTotalMb
    gpu.textContent =
      used == null || total == null
        ? '—'
        : (used / 1024).toFixed(1) + ' / ' + (total / 1024).toFixed(1) + ' GB'
  }

  const gpuSection = root.getElementById('gpuSection')
  const gpuRows = root.getElementById('gpuRows')
  const topGpu = Array.isArray(proc.topGpu) ? proc.topGpu : []
  if (gpuSection) gpuSection.hidden = topGpu.length === 0
  if (gpuRows) {
    const fragment = document.createDocumentFragment()
    for (const item of topGpu.slice(0, 3)) {
      const row = document.createElement('div')
      row.className = 'proc__row'

      const name = document.createElement('span')
      name.className = 'proc__name'
      name.textContent = String(item?.name ?? '')

      const value = document.createElement('span')
      value.className = 'proc__pct'
      value.textContent = `${Math.round(Number(item?.pct) || 0)}%`

      row.append(name, value)
      fragment.append(row)
    }
    gpuRows.replaceChildren(fragment)
  }
})

