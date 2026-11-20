import { useEffect, useRef, useState } from 'react'
import type { MediaControlState, MediaSample } from '../../../../shared/data'
import { t, type Language } from '../../../../shared/i18n'

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = Math.floor(seconds % 60)
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
  }
  return `${minutes}:${String(rest).padStart(2, '0')}`
}

function PrevIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4.6 3.4v9.2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12.2 3.9 6.5 8l5.7 4.1V3.9Z" fill="currentColor" />
    </svg>
  )
}

function NextIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M11.4 3.4v9.2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M3.8 3.9 9.5 8l-5.7 4.1V3.9Z" fill="currentColor" />
    </svg>
  )
}

function PlayIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M5.9 3.2v9.6L13 8 5.9 3.2Z" fill="currentColor" />
    </svg>
  )
}

function PauseIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <rect x="4.5" y="3.2" width="2.5" height="9.6" rx="1.1" fill="currentColor" />
      <rect x="9" y="3.2" width="2.5" height="9.6" rx="1.1" fill="currentColor" />
    </svg>
  )
}

function VolumeIcon({ muted }: { muted: boolean }): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 6.1h2.2L8.4 3.3v9.4L5.2 9.9H3z" fill="currentColor" />
      {muted ? (
        <path
          d="m10.4 6 3.1 3.1M13.5 6l-3.1 3.1"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      ) : (
        <>
          <path
            d="M10.4 5.6a3.2 3.2 0 0 1 0 4.8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
          <path
            d="M12.2 4a5.4 5.4 0 0 1 0 8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.1"
            strokeLinecap="round"
            opacity=".7"
          />
        </>
      )}
    </svg>
  )
}

/** 播放中的三格小均衡器：比一个静态「Playing」更有生命感 */
function Equalizer(): React.JSX.Element {
  return (
    <span className="media__eq" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  )
}

interface Props {
  media: MediaSample | null
  position: number
  progress: number
  volume: number
  muted: boolean
  language: Language
  onCommand: (
    action: 'playpause' | 'next' | 'prev' | 'mute' | 'volume',
    value?: number
  ) => Promise<MediaControlState | null>
}

export function MediaWidget({
  media,
  position,
  progress,
  volume: volumeProp,
  muted: mutedProp,
  language,
  onCommand
}: Props): React.JSX.Element {
  const [override, setOverride] = useState<string | null>(null)
  const [volume, setVolume] = useState(volumeProp >= 0 ? volumeProp : 0)
  const [muted, setMuted] = useState(mutedProp)
  const [volumeHud, setVolumeHud] = useState(false)
  const dragging = useRef(false)
  const volumeTimer = useRef<number | null>(null)

  // 命令的乐观状态最多撑到下一次快照；采集端（collector）有 2s 延迟，
  // 所以不能一看到旧状态就把乐观状态清掉，等它追上或超时再清。
  useEffect(() => {
    if (!override) return
    if (media?.status === override) {
      setOverride(null)
      return
    }
    const timer = window.setTimeout(() => setOverride(null), 2600)
    return () => window.clearTimeout(timer)
  }, [media?.status, override])

  useEffect(() => {
    if (!dragging.current && volumeProp >= 0) setVolume(volumeProp)
  }, [volumeProp])

  useEffect(() => {
    if (!dragging.current) setMuted(mutedProp)
  }, [mutedProp])

  useEffect(
    () => () => {
      if (volumeTimer.current) window.clearTimeout(volumeTimer.current)
    },
    []
  )

  const status = override ?? media?.status ?? ''
  const playing = status === 'Playing'
  // volume = -1：系统音量还没读上来，不能当成「用户把音量调到 0」
  const volumeReady = volumeProp >= 0

  const send = async (action: 'playpause' | 'next' | 'prev' | 'mute'): Promise<void> => {
    if (action === 'playpause') setOverride(playing ? 'Paused' : 'Playing')
    if (action === 'mute') setMuted((value) => !value)
    const next = await onCommand(action)
    if (!next) {
      if (action === 'playpause') setOverride(null)
      if (action === 'mute') setMuted(mutedProp)
      return
    }
    // 播放/暂停后 SMTC 的 PlaybackStatus 常常还停在旧值（应用要几十到几百毫秒才更新），
    // 所以这里不拿 next.status 覆盖乐观状态，交给采集快照追上或 2.6s 超时。
    if (!next.ok && action === 'playpause') setOverride(null)
    if (action === 'mute') setMuted(next.muted)
    if (next.volume >= 0) setVolume(next.volume)
  }

  const commitVolume = (value: number): void => {
    dragging.current = false
    setVolumeHud(false)
    if (volumeTimer.current) window.clearTimeout(volumeTimer.current)
    volumeTimer.current = window.setTimeout(() => {
      void onCommand('volume', value).then((next) => {
        if (next && next.volume >= 0) setVolume(next.volume)
        if (next) setMuted(next.muted)
      })
    }, 80)
  }

  const changeVolume = (value: number): void => {
    setVolume(value)
    if (volumeTimer.current) window.clearTimeout(volumeTimer.current)
    // 键盘微调没有 pointerup，这里兜一个短防抖
    volumeTimer.current = window.setTimeout(() => {
      if (!dragging.current) {
        void onCommand('volume', value).then((next) => {
          if (next && next.volume >= 0) setVolume(next.volume)
        })
      }
    }, 320)
  }

  if (!media) {
    return <div className="media__empty sub">{t(language, 'media.nothing')}</div>
  }

  const artist = [media.artist, media.album].filter(Boolean).join(' · ') || media.app
  const statusLabel = status === 'Paused' ? t(language, 'media.paused') : ''

  return (
    <>
      <div className="media" data-playing={playing}>
        <div className="media__now">
          <span className="cover" data-playing={playing} aria-hidden="true">
            <i className="cover__shine" />
          </span>
          <div className="media__info">
            <div className="media__title" title={media.title}>
              {media.title}
            </div>
            <div className="sub media__artist" title={artist}>
              {artist}
            </div>
          </div>
          {playing ? <Equalizer /> : null}
        </div>

        <div className="bar media__progress" aria-hidden="true">
          <i style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </div>
        <div className="media__meta-row">
          <span className="cap media__status">{statusLabel}</span>
          <span className="cap media__time">
            {formatClock(position)} / {formatClock(media.duration)}
          </span>
        </div>

        <div className="media__deck">
          <div className="media__transport" role="group" aria-label={t(language, 'media.nowPlaying')}>
            <button
              type="button"
              className="media__btn"
              aria-label={t(language, 'media.previous')}
              title={t(language, 'media.previous')}
              onClick={() => void send('prev')}
            >
              <PrevIcon />
            </button>
            <button
              type="button"
              className="media__btn media__btn--play"
              aria-label={playing ? t(language, 'media.pause') : t(language, 'media.play')}
              title={playing ? t(language, 'media.pause') : t(language, 'media.play')}
              onClick={() => void send('playpause')}
            >
              {playing ? <PauseIcon /> : <PlayIcon />}
            </button>
            <button
              type="button"
              className="media__btn"
              aria-label={t(language, 'media.next')}
              title={t(language, 'media.next')}
              onClick={() => void send('next')}
            >
              <NextIcon />
            </button>
          </div>

          <div className={`media__volume${volumeHud ? ' is-dragging' : ''}${volumeReady ? '' : ' is-pending'}`}>
            <button
              type="button"
              className="media__btn media__btn--small"
              aria-label={muted ? t(language, 'media.unmute') : t(language, 'media.mute')}
              aria-pressed={muted}
              title={muted ? t(language, 'media.unmute') : t(language, 'media.mute')}
              onClick={() => void send('mute')}
            >
              <VolumeIcon muted={muted} />
            </button>
            <input
              className="media__range"
              type="range"
              min={0}
              max={100}
              step={1}
              value={volume}
              disabled={!volumeReady}
              aria-label={t(language, 'media.volume')}
              aria-valuetext={volumeReady ? `${volume}%` : '—'}
              title={t(language, 'media.volume')}
              style={{ '--range-progress': `${volume}%` } as React.CSSProperties}
              onPointerDown={() => {
                dragging.current = true
                setVolumeHud(true)
              }}
              onPointerUp={() => commitVolume(volume)}
              onPointerCancel={() => commitVolume(volume)}
              onChange={(event) => changeVolume(Number(event.currentTarget.value))}
              onKeyDown={() => {
                dragging.current = false
                setVolumeHud(true)
              }}
              onBlur={() => setVolumeHud(false)}
            />
            <output className="media__volpct" aria-hidden={!volumeHud}>
              {!volumeReady ? '--' : muted ? '—' : `${volume}%`}
            </output>
          </div>
        </div>
      </div>
    </>
  )
}
