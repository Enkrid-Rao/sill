import type { TodoItem } from '../../../shared/data'
import type { WidgetDataBinding } from '../../../shared/dev-widget'
import { formatDate, t, type Language } from '../../../shared/i18n'
import { getWeatherCity, weatherCityName, weatherConditionKey } from '../../../shared/weather'
import type { WidgetContext } from './types'

export interface ProviderContext extends Pick<
  WidgetContext,
  'now' | 'language' | 'snapshot' | 'todos' | 'mediaPosition' | 'mediaProgress'
> {}

function localIso(now: Date): string {
  const offset = -now.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const pad = (value: number): string => String(Math.abs(value)).padStart(2, '0')
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  return `${date}T${time}${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`
}

function mediaValue(context: ProviderContext): Record<string, unknown> {
  const media = context.snapshot?.media
  return {
    active: Boolean(media && media.status !== 'Stopped' && media.status !== 'Closed'),
    title: media?.title ?? null,
    artist: media?.artist ?? null,
    album: media?.album ?? null,
    status: media?.status ?? 'Closed',
    app: media?.app ?? null,
    position: context.mediaPosition,
    progress: context.mediaProgress,
    duration: media?.duration ?? 0,
    artwork: media?.artwork ?? null,
    lyricLine: media?.lyricLine ?? null,
    lyricsOffsetMs: context.snapshot?.lyricsOffsetMs ?? 0,
    /** 媒体样本到达时间；歌词据此补偿采样/传输延迟 */
    sampledAt: context.snapshot?.mediaAt ?? context.snapshot?.at ?? 0,
    volume: context.snapshot?.volume ?? -1,
    muted: context.snapshot?.muted ?? false
  }
}

function weatherValue(context: ProviderContext): Record<string, unknown> {
  const weather = context.snapshot?.weather
  if (!weather) return {}
  const city = weather.cityId ? getWeatherCity(weather.cityId) : null
  return {
    temp: weather.temp,
    high: weather.high,
    low: weather.low,
    code: weather.code,
    condition: weather.code >= 0 ? t(context.language, weatherConditionKey(weather.code)) : null,
    cityId: weather.cityId,
    cityName: city ? weatherCityName(city, context.language) : weather.cityName,
    auto: weather.auto,
    updatedAt: weather.updatedAt,
    stale: weather.stale,
    error: weather.error
  }
}

function timeValue(now: Date, language: Language): Record<string, unknown> {
  return {
    iso: localIso(now),
    epoch: Math.floor(now.getTime() / 1000),
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate()
    ).padStart(2, '0')}`,
    dateLabel: formatDate(now, language),
    weekday: (now.getDay() + 6) % 7,
    hour: now.getHours(),
    minute: now.getMinutes()
  }
}

function providerValue(source: string, context: ProviderContext): unknown {
  const snapshot = context.snapshot
  switch (source) {
    case 'time.now':
      return timeValue(context.now, context.language)
    /**
     * 整份宿主状态。宿主加字段时组件不用等升级：直接读 state.snapshot.xxx。
     * 也省掉「每来一个字段就加一个 provider、改一次宿主」的循环。
     */
    case 'host.state':
      return {
        ...timeValue(context.now, context.language),
        language: context.language,
        snapshot: snapshot ?? {},
        todos: (context.todos ?? []).map((item: TodoItem) => ({
          id: item.id,
          text: item.text,
          done: item.done
        })),
        media: mediaValue(context),
        weather: weatherValue(context)
      }
    case 'system.cpu':
      return {
        usage: snapshot?.cpu ?? null,
        cores: snapshot?.cores ?? null,
        speedGhz: snapshot?.cpuGhz ?? null
      }
    case 'system.memory':
      return {
        percent: snapshot?.memPct ?? null,
        usedGb: snapshot?.memUsed ?? null,
        totalGb: snapshot?.memTotal ?? null
      }
    case 'system.swap':
      return {
        percent: snapshot?.swapPct ?? null,
        usedGb: snapshot?.swapUsed ?? null,
        totalGb: snapshot?.swapTotal ?? null
      }
    case 'system.gpu':
      return {
        usage: snapshot?.gpu ?? null,
        memMb: snapshot?.gpuMem ?? null,
        totalMb: snapshot?.gpuTotal ?? null
      }
    case 'system.network':
      return {
        downBps: snapshot?.down ?? null,
        upBps: snapshot?.up ?? null,
        sampledAt: snapshot?.procsAt ?? null
      }
    case 'system.processes':
      return {
        topRam: (snapshot?.procs ?? []).map((process) => ({
          name: process.name,
          mb: process.mb
        })),
        topGpu: (snapshot?.gpuProcs ?? []).map((process) => ({
          name: process.name,
          pct: process.pct
        })),
        gpuMemMb: snapshot?.gpuMem ?? null,
        gpuTotalMb: snapshot?.gpuTotal ?? null,
        procsAt: snapshot?.procsAt ?? null,
        gpuAt: snapshot?.gpuAt ?? null
      }
    case 'media.nowPlaying':
      return mediaValue(context)
    case 'weather.current':
      return weatherValue(context)
    case 'todo.list':
      return (context.todos ?? []).map((item: TodoItem) => ({
        id: item.id,
        text: item.text,
        done: item.done
      }))
    default:
      return null
  }
}

export function buildProviderData(
  bindings: readonly WidgetDataBinding[],
  context: ProviderContext
): Record<string, unknown> {
  const data: Record<string, unknown> = {}
  for (const binding of bindings) {
    data[binding.id] = providerValue(binding.source, context)
  }
  return data
}

