import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { USER_DATA_DIR } from './paths'
import { loadSettings } from './settings'
import {
  DEFAULT_WEATHER_CITY,
  getWeatherCity,
  nearestWeatherCity,
  type WeatherCity,
  type WeatherSnapshot
} from '../shared/weather'

/**
 * 天气 provider。
 *
 * 只在面板显示时刷新；网络请求全部在主进程，renderer 只拿 snapshot.weather。
 * - 手动城市：直接用城市表坐标。
 * - 自动定位：ipwho.is 的 IP 粗略定位（不申请系统定位权限），
 *   落在已知城市 90km 内时用本地化城市名，否则保留 IP 返回的城市名。
 * - 天气数据：Open-Meteo，无 API key。
 * - 失败时保留上一次成功数据（stale=true）；没有缓存时返回 error 快照。
 */

const WEATHER_FILE = join(USER_DATA_DIR, 'weather.json')
const REFRESH_MS = 15 * 60 * 1000
const RETRY_MS = 30 * 1000
const AUTO_LOCATION_TTL = 6 * 60 * 60 * 1000
const REQUEST_TIMEOUT_MS = 12 * 1000

interface AutoLocation {
  at: number
  lat: number
  lon: number
  cityName: string
}

let current: WeatherSnapshot | null = loadCache()
let timer: NodeJS.Timeout | null = null
let retryTimer: NodeJS.Timeout | null = null
let wanted = false
let inflight: Promise<void> | null = null
let pendingRefresh = false
let autoLocation: AutoLocation | null = null

function clearRetry(): void {
  if (retryTimer) {
    clearTimeout(retryTimer)
    retryTimer = null
  }
}

/** 断网 / 超时后 30s 再试一次；下一次面板唤出也会立即试 */
function scheduleRetry(): void {
  if (!wanted || retryTimer) return
  retryTimer = setTimeout(() => {
    retryTimer = null
    if (wanted) void refreshWeather()
  }, RETRY_MS)
}

function loadCache(): WeatherSnapshot | null {
  try {
    const raw = JSON.parse(readFileSync(WEATHER_FILE, 'utf8')) as Record<string, unknown>
    if (!raw || typeof raw !== 'object') return null
    const cityId = typeof raw.cityId === 'string' ? raw.cityId : null
    const temp = typeof raw.temp === 'number' && Number.isFinite(raw.temp) ? raw.temp : null
    const high = typeof raw.high === 'number' && Number.isFinite(raw.high) ? raw.high : null
    const low = typeof raw.low === 'number' && Number.isFinite(raw.low) ? raw.low : null
    if (temp == null || high == null || low == null) return null
    return {
      temp,
      high,
      low,
      code: typeof raw.code === 'number' ? raw.code : -1,
      cityId,
      cityName: typeof raw.cityName === 'string' ? raw.cityName : '',
      auto: raw.auto === true,
      updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : 0,
      stale: true,
      error: false
    }
  } catch {
    return null
  }
}

function persist(weather: WeatherSnapshot): void {
  if (weather.temp == null || weather.high == null || weather.low == null) return
  try {
    mkdirSync(dirname(WEATHER_FILE), { recursive: true })
    const tmp = `${WEATHER_FILE}.tmp`
    writeFileSync(tmp, `${JSON.stringify(weather, null, 2)}\n`, 'utf8')
    renameSync(tmp, WEATHER_FILE)
  } catch (error) {
    console.error('[sill] 无法写入天气缓存：', error)
  }
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'user-agent': 'Sill/0.4 (weather)' }
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return (await response.json()) as unknown
  } finally {
    clearTimeout(timeout)
  }
}

interface LocationResult {
  city: WeatherCity | null
  cityName: string
  lat: number
  lon: number
  auto: boolean
}

interface AutoFix {
  lat: number
  lon: number
  cityName: string
}

/** IP 粗定位：按顺序尝试多个免费服务，谁先成功用谁；都不行才回退默认城市。 */
async function fetchAutoFix(): Promise<AutoFix> {
  const attempts: Array<() => Promise<AutoFix>> = [
    async () => {
      const raw = (await fetchJson('https://ipwho.is/')) as Record<string, unknown>
      if (raw.success === false) throw new Error('ipwho.is rejected')
      const lat = Number(raw.latitude)
      const lon = Number(raw.longitude)
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('ipwho.is no coords')
      return {
        lat,
        lon,
        cityName: String(raw.city || raw.region || raw.country || '').trim() || 'Unknown'
      }
    },
    async () => {
      const raw = (await fetchJson('https://ipapi.co/json/')) as Record<string, unknown>
      const lat = Number(raw.latitude)
      const lon = Number(raw.longitude)
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('ipapi.co no coords')
      return {
        lat,
        lon,
        cityName: String(raw.city || raw.region || raw.country_name || '').trim() || 'Unknown'
      }
    },
    async () => {
      const raw = (await fetchJson('https://ipinfo.io/json')) as Record<string, unknown>
      const loc = String(raw.loc ?? '').split(',')
      const lat = Number(loc[0])
      const lon = Number(loc[1])
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('ipinfo.io no coords')
      return {
        lat,
        lon,
        cityName: String(raw.city || raw.region || raw.country || '').trim() || 'Unknown'
      }
    }
  ]

  for (const attempt of attempts) {
    try {
      return await attempt()
    } catch (error) {
      console.warn('[sill] 定位服务失败：', error)
    }
  }
  throw new Error('all ip location providers failed')
}

async function resolveLocation(): Promise<LocationResult> {
  const settings = loadSettings()
  const custom = settings.weatherCustom

  if (custom) {
    return {
      city: null,
      cityName: custom.name,
      lat: custom.lat,
      lon: custom.lon,
      auto: false
    }
  }

  const setting = settings.weatherLocation

  if (setting !== 'auto') {
    const city = getWeatherCity(setting) ?? getWeatherCity(DEFAULT_WEATHER_CITY.id)
    return {
      city,
      cityName: city?.en ?? DEFAULT_WEATHER_CITY.en,
      lat: city?.lat ?? DEFAULT_WEATHER_CITY.lat,
      lon: city?.lon ?? DEFAULT_WEATHER_CITY.lon,
      auto: false
    }
  }

  if (autoLocation && Date.now() - autoLocation.at < AUTO_LOCATION_TTL) {
    return {
      city: nearestWeatherCity(autoLocation.lat, autoLocation.lon),
      cityName: autoLocation.cityName,
      lat: autoLocation.lat,
      lon: autoLocation.lon,
      auto: true
    }
  }

  try {
    const fix = await fetchAutoFix()
    autoLocation = { at: Date.now(), ...fix }
    return {
      city: nearestWeatherCity(fix.lat, fix.lon),
      cityName: fix.cityName,
      lat: fix.lat,
      lon: fix.lon,
      auto: true
    }
  } catch (error) {
    console.warn('[sill] 自动定位失败，回退到上海：', error)
    return {
      city: getWeatherCity(DEFAULT_WEATHER_CITY.id),
      cityName: DEFAULT_WEATHER_CITY.en,
      lat: DEFAULT_WEATHER_CITY.lat,
      lon: DEFAULT_WEATHER_CITY.lon,
      auto: true
    }
  }
}

async function fetchWeather(location: LocationResult): Promise<WeatherSnapshot> {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', String(location.lat))
  url.searchParams.set('longitude', String(location.lon))
  url.searchParams.set('current', 'temperature_2m,weather_code')
  url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min')
  url.searchParams.set('timezone', 'auto')
  url.searchParams.set('forecast_days', '1')

  const raw = (await fetchJson(url.toString())) as Record<string, unknown>
  const currentRaw = raw.current as Record<string, unknown> | undefined
  const dailyRaw = raw.daily as Record<string, unknown> | undefined
  const temp = Number(currentRaw?.temperature_2m)
  const code = Number(currentRaw?.weather_code)
  const high = Number((dailyRaw?.temperature_2m_max as unknown[] | undefined)?.[0])
  const low = Number((dailyRaw?.temperature_2m_min as unknown[] | undefined)?.[0])

  if (![temp, high, low].every(Number.isFinite)) throw new Error('invalid weather response')

  return {
    temp: Math.round(temp),
    high: Math.round(high),
    low: Math.round(low),
    code: Number.isFinite(code) ? Math.round(code) : -1,
    cityId: location.city?.id ?? null,
    cityName: location.cityName,
    auto: location.auto,
    updatedAt: Date.now(),
    stale: false,
    error: false
  }
}

async function fetchWeatherWithRetry(location: LocationResult): Promise<WeatherSnapshot> {
  try {
    return await fetchWeather(location)
  } catch {
    // 首次请求偶尔会在网络栈刚启动 / DNS 抖动时 abort；等 1.2s 再试一次
    await new Promise((resolve) => setTimeout(resolve, 1200))
    return fetchWeather(location)
  }
}

async function refresh(): Promise<void> {
  const settings = loadSettings()
  if (!settings.networkConsent || !settings.weatherNetwork) {
    const custom = settings.weatherCustom
    const city =
      settings.weatherLocation === 'auto'
        ? null
        : (getWeatherCity(settings.weatherLocation) ?? getWeatherCity(DEFAULT_WEATHER_CITY.id))
    current = {
      ...(current ?? {}),
      temp: current?.temp ?? null,
      high: current?.high ?? null,
      low: current?.low ?? null,
      code: current?.code ?? -1,
      cityId: custom ? null : (city?.id ?? current?.cityId ?? null),
      cityName: custom?.name ?? city?.en ?? current?.cityName ?? DEFAULT_WEATHER_CITY.en,
      auto: !custom && settings.weatherLocation === 'auto',
      updatedAt: current?.updatedAt ?? 0,
      stale: false,
      error: false,
      disabled: true
    }
    return
  }

  const location = await resolveLocation()
  try {
    const next = await fetchWeatherWithRetry(location)
    current = next
    clearRetry()
    persist(next)
  } catch (error) {
    console.warn('[sill] 天气获取失败：', error)
    if (current) {
      current = { ...current, stale: true }
    } else {
      current = {
        temp: null,
        high: null,
        low: null,
        code: -1,
        cityId: location.city?.id ?? null,
        cityName: location.cityName,
        auto: location.auto,
        updatedAt: 0,
        stale: true,
        error: true
      }
    }
    scheduleRetry()
  }
}

/** 清掉自动定位缓存，下一次 refresh 会重新走 IP 定位。 */
export function resetAutoLocation(): void {
  autoLocation = null
}

export function refreshWeather(): Promise<void> {
  if (inflight) {
    // 刷新途中换了城市：等当前请求结束，再用新设置跑一次
    pendingRefresh = true
    return inflight
  }
  inflight = refresh().finally(() => {
    inflight = null
    if (pendingRefresh) {
      pendingRefresh = false
      void refreshWeather()
    }
  })
  return inflight
}

export function startWeather(): void {
  if (timer) return
  wanted = true
  void refreshWeather()
  timer = setInterval(() => {
    if (wanted) void refreshWeather()
  }, REFRESH_MS)
}

export function stopWeather(): void {
  wanted = false
  clearRetry()
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

export function getWeather(): WeatherSnapshot | null {
  return current
}

