import { describe, expect, it } from 'vitest'
import type { PanelSnapshot, TodoItem } from '../../../shared/data'
import type { ProviderContext } from './providers'
import { buildProviderData } from './providers'

const snapshot: PanelSnapshot = {
  cpu: 42,
  cores: 16,
  cpuGhz: 3.6,
  memPct: 55,
  memUsed: 8.8,
  memTotal: 16,
  swapPct: 3,
  swapUsed: 1.2,
  swapTotal: 32,
  down: 1024,
  up: 512,
  gpu: 33,
  gpuMem: 2048,
  gpuTotal: 8192,
  gpuProcs: [{ name: 'chrome', pct: 12 }],
  procs: [{ name: 'chrome', mb: 1200 }],
  media: {
    title: 'Song',
    artist: 'Artist',
    album: 'Album',
    status: 'Playing',
    position: 30,
    duration: 120,
    app: 'Spotify',
    artwork: 'data:image/png;base64,xx',
    lyricLine: 'hello'
  },
  weather: {
    temp: 21,
    high: 25,
    low: 16,
    code: 1,
    cityId: 'shanghai',
    cityName: 'Shanghai',
    auto: false,
    updatedAt: 1,
    stale: false,
    error: false
  },
  volume: 60,
  muted: false,
  at: 1
}

const todos: TodoItem[] = [{ id: 'a', text: 'write tests', done: false }]

const context: ProviderContext = {
  now: new Date(2026, 10, 18, 19, 5, 0),
  language: 'zh',
  snapshot,
  todos,
  mediaPosition: 30,
  mediaProgress: 25
}

describe('buildProviderData', () => {
  it('maps time fields', () => {
    const data = buildProviderData([{ id: 'now', source: 'time.now' }], context)
    expect(data.now).toMatchObject({
      time: '19:05',
      date: '2026-11-18',
      hour: 19,
      minute: 5,
      weekday: 2
    })
  })

  it('maps system providers', () => {
    const data = buildProviderData(
      [
        { id: 'cpu', source: 'system.cpu' },
        { id: 'memory', source: 'system.memory' },
        { id: 'gpu', source: 'system.gpu' },
        { id: 'network', source: 'system.network' },
        { id: 'processes', source: 'system.processes' }
      ],
      context
    )
    expect(data.cpu).toEqual({ usage: 42, cores: 16, speedGhz: 3.6 })
    expect(data.memory).toEqual({ percent: 55, usedGb: 8.8, totalGb: 16 })
    expect(data.gpu).toEqual({ usage: 33, memMb: 2048, totalMb: 8192 })
    expect(data.network).toEqual({ downBps: 1024, upBps: 512, sampledAt: null })
    expect(data.processes).toMatchObject({
      topRam: [{ name: 'chrome', mb: 1200 }],
      gpuMemMb: 2048
    })
  })

  it('maps media, weather and todo', () => {
    const data = buildProviderData(
      [
        { id: 'media', source: 'media.nowPlaying' },
        { id: 'weather', source: 'weather.current' },
        { id: 'todo', source: 'todo.list' }
      ],
      context
    )
    expect(data.media).toMatchObject({
      active: true,
      title: 'Song',
      progress: 25,
      volume: 60,
      artwork: 'data:image/png;base64,xx',
      lyricLine: 'hello',
      sampledAt: 1
    })
    expect(data.weather).toMatchObject({ temp: 21, cityId: 'shanghai', code: 1 })
    expect(data.todo).toEqual([{ id: 'a', text: 'write tests', done: false }])
  })

  it('keeps null-ish values instead of throwing', () => {
    const data = buildProviderData(
      [
        { id: 'cpu', source: 'system.cpu' },
        { id: 'media', source: 'media.nowPlaying' }
      ],
      { ...context, snapshot: null }
    )
    expect(data.cpu).toEqual({ usage: null, cores: null, speedGhz: null })
    expect(data.media).toMatchObject({ active: false, title: null })
  })
})

