import { describe, expect, it } from 'vitest'
import { isPrereleaseVersion } from './update'

describe('update channel', () => {
  it('recognizes beta / rc / dev builds', () => {
    expect(isPrereleaseVersion('0.7.0-beta.1')).toBe(true)
    expect(isPrereleaseVersion('0.7.0-rc.1')).toBe(true)
    expect(isPrereleaseVersion('0.7.0-dev.2')).toBe(true)
  })

  it('keeps stable builds on Latest only', () => {
    expect(isPrereleaseVersion('0.7.0')).toBe(false)
    expect(isPrereleaseVersion('1.0.0')).toBe(false)
  })
})
