// 内置「进程」卡：TOP 内存 + 显存占用。
const gb = (mb) => {
  if (mb == null || !Number.isFinite(Number(mb))) return '—'
  const value = Number(mb)
  return value >= 1024 ? (value / 1024).toFixed(1) + ' GB' : Math.round(value) + ' MB'
}

sill.onData(({ data }) => {
  const proc = data.proc ?? {}
  const rows = root.getElementById('rows')
  if (rows) {
    const fragment = document.createDocumentFragment()
    for (const item of (proc.topRam ?? []).slice(0, 3)) {
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
})
