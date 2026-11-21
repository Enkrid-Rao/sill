import { net } from 'electron'
import type { MediaSample } from '../../shared/data'
import { lineIndexAt, parseLrc, pickSynced, type LyricLine, type SyncedCandidate } from '../../shared/lyrics'
import { loadSettings } from '../settings'

const API = 'https://lrclib.net/api/search'
const GET_API = 'https://lrclib.net/api/get'
const TIMEOUT_MS = 9000
const CACHE_MS = 30 * 60 * 1000
const RETRY_MS = 60 * 1000

interface CacheEntry {
  lines: LyricLine[]
  at: number
  loading: boolean
  ok: boolean
}

const cache = new Map<string, CacheEntry>()

function trackKey(media: MediaSample): string {
  return [
    media.artist ?? '',
    media.title ?? '',
    media.album ?? '',
    Math.round(Number(media.duration ?? 0))
  ].join('\u0000')
}

async function load(media: MediaSample, key: string): Promise<void> {
  const entry: CacheEntry = { lines: [], at: 0, loading: true, ok: false }
  cache.set(key, entry)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const headers = { 'user-agent': 'Sill/0.7 (media lyrics)' }
    const getParams = new URLSearchParams()
    getParams.set('track_name', media.title)
    if (media.artist) getParams.set('artist_name', media.artist)
    if (Number(media.duration) > 0) getParams.set('duration', String(Math.round(media.duration)))

    // /api/get 只返回一条，通常几 KB；先走它，避免 search 返回整页大 JSON 导致首句迟迟不出现。
    const exact = await net.fetch(`${GET_API}?${getParams.toString()}`, {
      signal: controller.signal,
      headers
    })
    let best = exact.ok
      ? pickSynced([(await exact.json()) as SyncedCandidate], Number(media.duration) || 0)
      : null

    if (!best) {
      const search = async (withArtist: boolean): Promise<unknown> => {
        const params = new URLSearchParams()
        params.set('track_name', media.title)
        if (withArtist && media.artist) params.set('artist_name', media.artist)
        if (withArtist && media.album) params.set('album_name', media.album)
        if (withArtist && Number(media.duration) > 0) {
          params.set('duration', String(Math.round(media.duration)))
        }
        const response = await net.fetch(`${API}?${params.toString()}`, {
          signal: controller.signal,
          headers
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json()
      }

      let list = await search(true)
      best = pickSynced(Array.isArray(list) ? list : [], Number(media.duration) || 0)
      if (!best) {
        // 很多播放器的 artist 标签并不规范；第一次没命中时放宽到歌名 + 时长。
        list = await search(false)
        best = pickSynced(Array.isArray(list) ? list : [], Number(media.duration) || 0)
      }
    }

    entry.lines = best?.syncedLyrics ? parseLrc(best.syncedLyrics) : []
    entry.ok = true
  } catch {
    entry.ok = false
  } finally {
    clearTimeout(timer)
    entry.loading = false
    entry.at = Date.now()
  }
}

/** 媒体卡当前歌词行；命中/失败都有缓存。网络请求只在该曲目第一次 tick 时触发。 */
export function getMediaLyricLine(
  media: MediaSample | null,
  now: number,
  mediaAt: number
): string | null {
  if (!media?.title) return null
  if (!loadSettings().networkConsent) return null
  const key = trackKey(media)
  const cached = cache.get(key)

  if (!cached) {
    void load(media, key)
    return null
  }

  if (cached.loading) return null
  if (!cached.ok && now - cached.at > RETRY_MS) {
    void load(media, key)
    return null
  }
  if (cached.ok && !cached.lines.length) return null
  if (cached.ok && now - cached.at > CACHE_MS) {
    void load(media, key)
    return null
  }

  const playing = media.status === 'Playing'
  const lag =
    playing && mediaAt > 0 ? Math.min(5, Math.max(0, (now - mediaAt) / 1000)) : 0
  const offset = (loadSettings().lyricsOffsetMs || 0) / 1000
  const index = lineIndexAt(cached.lines, Number(media.position ?? 0) + lag + offset)
  return index >= 0 ? cached.lines[index].text : null
}
