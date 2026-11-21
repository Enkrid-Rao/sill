import type { Language, TranslationKey } from './i18n'

/**
 * 天气城市表。
 *
 * 天气 provider 用 Open-Meteo，不需要 API key；自动定位用 ipwho.is 的 IP 粗略定位。
 * 城市表只负责「把坐标映射回一个可显示的名字」，不参与网络请求。
 */
export interface WeatherCustomLocation {
  name: string
  lat: number
  lon: number
}

export interface WeatherCity {
  id: string
  en: string
  zh: string
  lat: number
  lon: number
}

export const WEATHER_CITIES: readonly WeatherCity[] = [
  { id: 'shanghai', en: 'Shanghai', zh: '上海', lat: 31.2304, lon: 121.4737 },
  { id: 'beijing', en: 'Beijing', zh: '北京', lat: 39.9042, lon: 116.4074 },
  { id: 'guangzhou', en: 'Guangzhou', zh: '广州', lat: 23.1291, lon: 113.2644 },
  { id: 'shenzhen', en: 'Shenzhen', zh: '深圳', lat: 22.5431, lon: 114.0579 },
  { id: 'hangzhou', en: 'Hangzhou', zh: '杭州', lat: 30.2741, lon: 120.1551 },
  { id: 'chengdu', en: 'Chengdu', zh: '成都', lat: 30.5728, lon: 104.0668 },
  { id: 'nanjing', en: 'Nanjing', zh: '南京', lat: 32.0603, lon: 118.7969 },
  { id: 'wuhan', en: 'Wuhan', zh: '武汉', lat: 30.5928, lon: 114.3055 },
  { id: 'xian', en: "Xi'an", zh: '西安', lat: 34.3416, lon: 108.9398 },
  { id: 'chongqing', en: 'Chongqing', zh: '重庆', lat: 29.563, lon: 106.5516 },
  { id: 'suzhou', en: 'Suzhou', zh: '苏州', lat: 31.2989, lon: 120.5853 },
  { id: 'tianjin', en: 'Tianjin', zh: '天津', lat: 39.0842, lon: 117.2009 },
  { id: 'qingdao', en: 'Qingdao', zh: '青岛', lat: 36.0671, lon: 120.3826 },
  { id: 'xiamen', en: 'Xiamen', zh: '厦门', lat: 24.4798, lon: 118.0894 },
  { id: 'changsha', en: 'Changsha', zh: '长沙', lat: 28.2282, lon: 112.9388 },
  { id: 'zhengzhou', en: 'Zhengzhou', zh: '郑州', lat: 34.7466, lon: 113.6254 },
  { id: 'kunming', en: 'Kunming', zh: '昆明', lat: 25.0389, lon: 102.7183 },
  { id: 'dalian', en: 'Dalian', zh: '大连', lat: 38.914, lon: 121.6147 },
  { id: 'ningbo', en: 'Ningbo', zh: '宁波', lat: 29.8683, lon: 121.544 },
  { id: 'wuxi', en: 'Wuxi', zh: '无锡', lat: 31.4912, lon: 120.3119 },
  { id: 'hongkong', en: 'Hong Kong', zh: '香港', lat: 22.3193, lon: 114.1694 },
  { id: 'taipei', en: 'Taipei', zh: '台北', lat: 25.033, lon: 121.5654 },
  { id: 'tokyo', en: 'Tokyo', zh: '东京', lat: 35.6762, lon: 139.6503 },
  { id: 'singapore', en: 'Singapore', zh: '新加坡', lat: 1.3521, lon: 103.8198 },
  { id: 'london', en: 'London', zh: '伦敦', lat: 51.5072, lon: -0.1276 },
  { id: 'newyork', en: 'New York', zh: '纽约', lat: 40.7128, lon: -74.006 },
  { id: 'sanfrancisco', en: 'San Francisco', zh: '旧金山', lat: 37.7749, lon: -122.4194 }
]

export const DEFAULT_WEATHER_CITY = WEATHER_CITIES[0]

/** 设置里保存的自定义地点；名字只是显示用，坐标才是数据源。 */
export function normalizeWeatherCustom(value: unknown): WeatherCustomLocation | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 60) : ''
  const lat = Number(raw.lat)
  const lon = Number(raw.lon)
  if (!name) return null
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return null
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) return null
  return { name, lat, lon }
}

export function getWeatherCity(id: string): WeatherCity | null {
  return WEATHER_CITIES.find((city) => city.id === id) ?? null
}

export function isWeatherCityId(id: string): boolean {
  return WEATHER_CITIES.some((city) => city.id === id)
}

export function weatherCityName(city: WeatherCity, language: Language): string {
  return language === 'zh' ? city.zh : city.en
}

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180
  const dLat = (lat2 - lat1) * rad
  const dLon = (lon2 - lon1) * rad
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a)))
}

/** 自动定位落在已知城市 90km 内时，显示本地化城市名；否则保留 IP 返回的城市名 */
export function nearestWeatherCity(lat: number, lon: number, maxKm = 90): WeatherCity | null {
  let best: WeatherCity | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (const city of WEATHER_CITIES) {
    const distance = distanceKm(lat, lon, city.lat, city.lon)
    if (distance < bestDistance) {
      best = city
      bestDistance = distance
    }
  }
  return best && bestDistance <= maxKm ? best : null
}

export type WeatherCondition =
  | 'clear'
  | 'mainlyClear'
  | 'partlyCloudy'
  | 'overcast'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'snow'
  | 'showers'
  | 'thunder'

/** WMO weather code → 一个语义条件；未知 code 一律按局部多云处理 */
export function describeWeatherCode(code: number): WeatherCondition {
  if (code === 0) return 'clear'
  if (code === 1) return 'mainlyClear'
  if (code === 2) return 'partlyCloudy'
  if (code === 3) return 'overcast'
  if (code === 45 || code === 48) return 'fog'
  if (code >= 51 && code <= 57) return 'drizzle'
  if (code >= 61 && code <= 67) return 'rain'
  if (code >= 80 && code <= 82) return 'showers'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
  if (code >= 95 && code <= 99) return 'thunder'
  return 'partlyCloudy'
}

const CONDITION_KEYS: Record<WeatherCondition, TranslationKey> = {
  clear: 'weather.clear',
  mainlyClear: 'weather.mainlyClear',
  partlyCloudy: 'weather.partlyCloudy',
  overcast: 'weather.overcast',
  fog: 'weather.fog',
  drizzle: 'weather.drizzle',
  rain: 'weather.rain',
  snow: 'weather.snow',
  showers: 'weather.showers',
  thunder: 'weather.thunder'
}

export function weatherConditionKey(code: number): TranslationKey {
  return CONDITION_KEYS[describeWeatherCode(code)]
}

export interface WeatherSnapshot {
  /** 摄氏度；null = 还没拿到有效数据 */
  temp: number | null
  high: number | null
  low: number | null
  /** WMO weather code；-1 = 无效 */
  code: number
  cityId: string | null
  /** IP 返回的城市名；manual 城市用城市表的本地化名字覆盖 */
  cityName: string
  auto: boolean
  updatedAt: number
  stale: boolean
  error: boolean
  /** 用户关闭联网 / 尚未同意隐私说明 */
  disabled?: boolean
}

