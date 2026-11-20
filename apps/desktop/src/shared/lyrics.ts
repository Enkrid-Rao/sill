export interface LyricLine {
  time: number
  text: string
}

/** LRC 文本 → 去重、按时间排序的行；与歌词组件保持同一套解析规则。 */
export function parseLrc(source: unknown): LyricLine[] {
  const parsed: LyricLine[] = []
  for (const raw of String(source ?? '').split('\n')) {
    const times = [...raw.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)]
    if (!times.length) continue
    const content = raw.replace(/\[[^\]]*\]/g, '').trim()
    if (!content) continue
    for (const match of times) {
      const minutes = Number(match[1])
      const seconds = Number(match[2])
      const fraction = match[3] ? Number(`0.${match[3]}`) : 0
      parsed.push({ time: minutes * 60 + seconds + fraction, text: content })
    }
  }
  parsed.sort((a, b) => a.time - b.time)

  const deduped: LyricLine[] = []
  for (const line of parsed) {
    const prev = deduped[deduped.length - 1]
    if (prev && prev.text === line.text && line.time - prev.time < 0.35) continue
    deduped.push(line)
  }
  return deduped
}

export interface SyncedCandidate {
  duration?: unknown
  syncedLyrics?: unknown
  plainLyrics?: unknown
  instrumental?: unknown
}

/** 从 LRCLIB 搜索结果里挑同步歌词；时长差超过 8 秒视为不匹配，避免给错歌词。 */
export function pickSynced(
  candidates: readonly SyncedCandidate[],
  duration: number
): SyncedCandidate | null {
  const synced = candidates.filter((item) => item?.syncedLyrics)
  if (!synced.length) return null
  const distance = (item: SyncedCandidate): number =>
    Math.abs(Number(item.duration ?? 0) - Number(duration ?? 0))
  const near = synced.find((item) => Number(item.duration) > 0 && distance(item) <= 8)
  if (near) return near
  if (!(Number(duration) > 0)) {
    return [...synced].sort((a, b) => distance(a) - distance(b))[0] ?? null
  }
  return null
}

/** 当前时间对应的歌词行；第一行之前返回 -1。 */
export function lineIndexAt(lines: readonly LyricLine[], at: number): number {
  let low = 0
  let high = lines.length - 1
  let found = -1
  while (low <= high) {
    const middle = (low + high) >> 1
    if (lines[middle].time <= at) {
      found = middle
      low = middle + 1
    } else {
      high = middle - 1
    }
  }
  return found
}
