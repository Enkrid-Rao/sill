// 内置「进程」卡：TOP RAM + GPU 进程 + 显存总量。
// 行结构交给 data-sill-repeat（宿主按 key 复用），这里只格式化数字并处理空态。
const el = (id) => root.getElementById(id)

const STALL_FRAMES = 8
let emptyFrames = 0

function gb(mb) {
  if (typeof mb !== 'number' || !Number.isFinite(mb)) return '—'
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`
}

function fillRows(selector, items, valueOf) {
  const rows = [...root.querySelectorAll(selector)]
  rows.forEach((row, index) => {
    const item = items[index]
    const name = row.querySelector('.proc__name')
    if (name) name.setAttribute('title', String(item?.name ?? ''))
    const value = row.querySelector('.proc__mb, .proc__pct')
    if (value) value.textContent = valueOf(item)
  })
}

sill.onData(({ data }) => {
  const proc = data.proc ?? {}
  const topRam = Array.isArray(proc.topRam) ? proc.topRam : []
  const topGpu = Array.isArray(proc.topGpu) ? proc.topGpu : []

  const stale = el('stale')
  if (stale) {
    const at = Number(proc.procsAt)
    const age = Number.isFinite(at) && at > 0 ? Math.max(0, (Date.now() - at) / 1000) : null
    const isStale = age != null && age > 8
    stale.hidden = !isStale
    if (isStale) stale.textContent = `~${Math.round(age)}s`
  }

  fillRows('.proc__rows--ram .proc__row', topRam, (item) => gb(item?.mb))
  fillRows('.proc__rows--gpu .proc__row', topGpu, (item) =>
    typeof item?.pct === 'number' && Number.isFinite(item.pct) ? `${Math.round(item.pct)}%` : '—'
  )

  const vram = el('vram')
  if (vram) {
    const used = proc.gpuMemMb
    const total = proc.gpuTotalMb
    vram.textContent =
      typeof used === 'number' && typeof total === 'number' && total > 0
        ? `${(used / 1024).toFixed(1)} / ${(total / 1024).toFixed(1)} GB`
        : ''
  }

  const placeholder = el('placeholder')
  const sampling = el('sampling')
  const empty = el('empty')
  if (placeholder && sampling && empty) {
    const hasRows = topRam.length > 0
    placeholder.hidden = hasRows
    if (hasRows) {
      emptyFrames = 0
      sampling.hidden = false
      empty.hidden = true
    } else {
      emptyFrames += 1
      const stalled = emptyFrames >= STALL_FRAMES
      sampling.hidden = stalled
      empty.hidden = !stalled
    }
  }
})

