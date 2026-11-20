import { describe, expect, it } from 'vitest'
import { lineIndexAt, parseLrc, pickSynced } from './lyrics'

describe('lyrics', () => {
  it('parses and dedupes LRC lines', () => {
    const lines = parseLrc('[00:01.20]one\n[00:02.50]two\n[00:02.60]two\n[00:03.00]three')
    expect(lines).toEqual([
      { time: 1.2, text: 'one' },
      { time: 2.5, text: 'two' },
      { time: 3, text: 'three' }
    ])
  })

  it('picks the synced candidate closest to duration', () => {
    const best = pickSynced(
      [
        { duration: 200, syncedLyrics: '[00:00.00]a' },
        { duration: 123, syncedLyrics: '[00:00.00]b' },
        { duration: 120, plainLyrics: 'c' }
      ],
      122
    )
    expect(best?.syncedLyrics).toContain('b')
    expect(
      pickSynced([{ duration: 200, syncedLyrics: '[00:00.00]a' }], 90)
    ).toBeNull()
  })

  it('finds the active line, including before the first line', () => {
    const lines = parseLrc('[00:05.00]first\n[00:10.00]second')
    expect(lineIndexAt(lines, 4.9)).toBe(-1)
    expect(lineIndexAt(lines, 5)).toBe(0)
    expect(lineIndexAt(lines, 10.1)).toBe(1)
  })
})
