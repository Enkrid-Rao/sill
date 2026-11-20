import { formatDate, t, type Language } from '../../../shared/i18n'
import {
  describeWeatherCode,
  getWeatherCity,
  weatherCityName,
  weatherConditionKey,
  type WeatherSnapshot
} from '../../../shared/weather'

const CLOUD_PATH =
  'M14.4 33.6h12.9a4.6 4.6 0 0 0 0-9.2 6.9 6.9 0 0 0-13-1.5 4.6 4.6 0 0 0 .1 10.7Z'

function Sun({ cx = 20, cy = 20, r = 6 }: { cx?: number; cy?: number; r?: number }): React.JSX.Element {
  return (
    <g stroke="var(--accent-2)" strokeWidth="1.3" strokeLinecap="round">
      <circle cx={cx} cy={cy} r={r} fill="rgba(255,255,255,.06)" />
      {Array.from({ length: 8 }, (_, index) => {
        const angle = (index * Math.PI) / 4
        return (
          <line
            key={index}
            x1={cx + Math.cos(angle) * (r + 2.1)}
            y1={cy + Math.sin(angle) * (r + 2.1)}
            x2={cx + Math.cos(angle) * (r + 4.2)}
            y2={cy + Math.sin(angle) * (r + 4.2)}
          />
        )
      })}
    </g>
  )
}

function Moon(): React.JSX.Element {
  return (
    <path
      d="M25.6 5.4a8.1 8.1 0 1 0 8 10.2 6.5 6.5 0 0 1-8-10.2Z"
      fill="rgba(255,255,255,.06)"
      stroke="var(--accent-2)"
      strokeWidth="1.3"
      strokeLinejoin="round"
    />
  )
}

function Cloud(): React.JSX.Element {
  return (
    <path
      d={CLOUD_PATH}
      fill="rgba(230,244,238,.07)"
      stroke="rgba(226,239,233,.85)"
      strokeWidth="1.25"
      strokeLinejoin="round"
    />
  )
}

function Rain({ snow = false }: { snow?: boolean }): React.JSX.Element {
  if (snow) {
    return (
      <g fill="rgba(226,239,233,.85)">
        <circle cx="14" cy="36" r="1.1" />
        <circle cx="20" cy="37" r="1.1" />
        <circle cx="26" cy="36" r="1.1" />
      </g>
    )
  }
  return (
    <g stroke="rgba(180,224,236,.8)" strokeWidth="1.25" strokeLinecap="round">
      <line x1="14" y1="35.5" x2="13" y2="38" />
      <line x1="20" y1="36" x2="19" y2="38.5" />
      <line x1="26" y1="35.5" x2="25" y2="38" />
    </g>
  )
}

function WeatherIcon({ code, night }: { code: number; night: boolean }): React.JSX.Element {
  if (code === -2) {
    return (
      <svg className="weather__icon" viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <Cloud />
      </svg>
    )
  }

  if (code < 0) {
    return (
      <svg className="weather__icon" viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <Moon />
        <Cloud />
      </svg>
    )
  }

  const condition = describeWeatherCode(code)
  const sunOrMoon = night ? <Moon /> : <Sun />

  if (condition === 'clear') {
    return (
      <svg className="weather__icon" viewBox="0 0 40 40" fill="none" aria-hidden="true">
        {sunOrMoon}
      </svg>
    )
  }

  if (condition === 'mainlyClear') {
    return (
      <svg className="weather__icon" viewBox="0 0 40 40" fill="none" aria-hidden="true">
        {sunOrMoon}
        <path
          d="M9.5 27.4h12.2a3.4 3.4 0 0 0 0-6.8 5.6 5.6 0 0 0-10.6-1.2 3.4 3.4 0 0 0-1.6 8Z"
          fill="rgba(230,244,238,.06)"
          stroke="rgba(226,239,233,.75)"
          strokeWidth="1.15"
          strokeLinejoin="round"
        />
      </svg>
    )
  }

  if (condition === 'partlyCloudy') {
    return (
      <svg className="weather__icon" viewBox="0 0 40 40" fill="none" aria-hidden="true">
        {night ? <Moon /> : <Sun cx={25} cy={14} r={5} />}
        <Cloud />
      </svg>
    )
  }

  if (condition === 'fog') {
    return (
      <svg className="weather__icon" viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <Cloud />
        <g stroke="rgba(226,239,233,.55)" strokeWidth="1.1" strokeLinecap="round">
          <line x1="10" y1="36" x2="28" y2="36" />
          <line x1="13" y1="38.5" x2="25" y2="38.5" />
        </g>
      </svg>
    )
  }

  if (condition === 'rain' || condition === 'drizzle' || condition === 'showers') {
    return (
      <svg className="weather__icon" viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <Cloud />
        <Rain />
      </svg>
    )
  }

  if (condition === 'snow') {
    return (
      <svg className="weather__icon" viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <Cloud />
        <Rain snow />
      </svg>
    )
  }

  if (condition === 'thunder') {
    return (
      <svg className="weather__icon" viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <Cloud />
        <path d="m21 33-4 7h4l-2 4 8-8h-4l3-3Z" fill="var(--accent-2)" stroke="none" />
      </svg>
    )
  }

  return (
    <svg className="weather__icon" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <Cloud />
    </svg>
  )
}

interface Props {
  now: Date
  language: Language
  weather: WeatherSnapshot | null
}

/** 时钟 + 日期 + 天气。天气来自主进程天气 provider，失败时保留上一次成功数据。 */
export function HeroWidget({ now, language, weather }: Props): React.JSX.Element {
  const dateLabel = formatDate(now, language)
  const timeLabel = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const city = weather?.cityId ? getWeatherCity(weather.cityId) : null
  const cityLabel = city
    ? weatherCityName(city, language)
    : weather?.cityName || t(language, 'weather.locating')
  const hasTemp = weather?.temp != null
  const stale = Boolean(weather?.stale || weather?.error) && hasTemp
  const condition = !weather
    ? t(language, 'weather.loading')
    : weather.error || !hasTemp
      ? t(language, 'weather.unavailable')
      : t(language, weatherConditionKey(weather.code))
  const high = weather?.high
  const low = weather?.low
  const range =
    high != null && low != null
      ? `${t(language, 'weather.high')} ${Math.round(high)}° · ${t(language, 'weather.low')} ${Math.round(low)}°`
      : ''
  const updatedTitle =
    stale && weather?.updatedAt
      ? new Date(weather.updatedAt).toLocaleTimeString(language === 'zh' ? 'zh-CN' : 'en-GB', {
          hour: '2-digit',
          minute: '2-digit'
        })
      : undefined

  return (
    <>
      <div className="cap card__date">{dateLabel}</div>
      <div className="num">{timeLabel}</div>
      <div className="row card__weather" data-stale={stale ? 'true' : undefined}>
        <div className="weather__now">
          <WeatherIcon
            code={hasTemp ? (weather?.code ?? -1) : -2}
            night={now.getHours() < 6 || now.getHours() >= 18}
          />
          <div>
            <div className="weather__temp">{hasTemp ? `${Math.round(weather.temp as number)}°` : '--°'}</div>
            <div className="sub weather__condition" title={updatedTitle}>
              {condition}
              {stale ? <span className="weather__stale">{t(language, 'weather.stale')}</span> : null}
            </div>
          </div>
        </div>
        <div className="cap weather__side" title={cityLabel}>
          <span className="weather__city">{cityLabel}</span>
          <span className="weather__range">{range || '\u00A0'}</span>
        </div>
      </div>
    </>
  )
}
