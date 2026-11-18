import type { TodoItem } from '../../../shared/data'
import type { WidgetDataBinding } from '../../../shared/dev-widget'
import { formatDate, t } from '../../../shared/i18n'
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

function providerValue(source: string, context: ProviderContext): unknown {
  const snapshot = context.snapshot
  switch (source) {
    case 'time.now':
      return {
        iso: localIso(context.now),
        epoch: Math.floor(context.now.getTime() / 1000),
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        time: `${String(context.now.getHours()).padStart(2, '0')}:${String(
          context.now.getMinutes()
        ).padStart(2, '0')}`,
        date: `${context.now.getFullYear()}-${String(context.now.getMonth() + 1).padStart(
          2,
          '0'
        )}-${String(context.now.getDate()).padStart(2, '0')}`,
        dateLabel: formatDate(context.now, context.language),
        weekday: (context.now.getDay() + 6) % 7,
        hour: context.now.getHours(),
        minute: context.now.getMinutes()
      }
    case 'system.cpu':
      return { usage: snapshot?.cpu ?? null, cores: snapshot?.cores ?? null }
    case 'system.memory':
      return {
        percent: snapshot?.memPct ?? null,
        usedGb: snapshot?.memUsed ?? null,
        totalGb: snapshot?.memTotal ?? null
      }
    case 'system.gpu':
      return {
        usage: snapshot?.gpu ?? null,
        memMb: snapshot?.gpuMem ?? null,
        totalMb: snapshot?.gpuTotal ?? null
      }
    case 'system.network':
      return { downBps: snapshot?.down ?? null, upBps: snapshot?.up ?? null }
    case 'system.processes':
      return {
        topRam: (snapshot?.procs ?? []).map((process) => ({
          name: process.name,
          mb: process.mb
        })),
        gpuMemMb: snapshot?.gpuMem ?? null,
        gpuTotalMb: snapshot?.gpuTotal ?? null
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
