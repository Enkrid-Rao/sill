import { formatDate, t, type Language } from '../../../shared/i18n'

function MoonCloud(): React.JSX.Element {
  return (
    <svg width="30" height="30" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <path
        d="M25.6 5.4a8.1 8.1 0 1 0 8 10.2 6.5 6.5 0 0 1-8-10.2Z"
        fill="rgba(255,255,255,.06)"
        stroke="var(--accent-2)"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path
        d="M14.4 33.6h12.9a4.6 4.6 0 0 0 0-9.2 6.9 6.9 0 0 0-13-1.5 4.6 4.6 0 0 0 .1 10.7Z"
        fill="rgba(230,244,238,.07)"
        stroke="rgba(226,239,233,.85)"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
    </svg>
  )
}

interface Props {
  now: Date
  language: Language
}

/** 时钟 + 日期 + 天气。天气仍是占位，等 Provider 接口统一收纳。 */
export function HeroWidget({ now, language }: Props): React.JSX.Element {
  const dateLabel = formatDate(now, language)
  const timeLabel = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

  return (
    <>
      <div className="cap">{dateLabel}</div>
      <div className="num">{timeLabel}</div>
      <div className="row card__weather">
        <div className="weather__now">
          <MoonCloud />
          <div>
            <div className="weather__temp">14°</div>
            <div className="sub weather__condition">
              {t(language, 'weather.condition')}
            </div>
          </div>
        </div>
        <div className="cap weather__side">
          {t(language, 'weather.city')}
          <br />
          {t(language, 'weather.range')}
        </div>
      </div>
    </>
  )
}
