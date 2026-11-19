import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { state } = vi.hoisted(() => ({ state: { dir: '' } }))

vi.mock('./paths', () => ({
  get USER_DATA_DIR() {
    return state.dir
  }
}))

import { isAlreadyTrusted, rememberTrust, resetTrustCache, trustedTier } from './trust'

beforeEach(() => {
  state.dir = mkdtempSync(join(tmpdir(), 'sill-trust-'))
  resetTrustCache()
})

afterEach(() => {
  rmSync(state.dir, { recursive: true, force: true })
})

describe('trust store', () => {
  it('has no record for a fresh component', () => {
    expect(trustedTier('demo')).toBeNull()
    expect(isAlreadyTrusted('demo', 'static')).toBe(false)
  })

  it('remembers a confirmed tier and skips prompts for equal or lower tiers', () => {
    rememberTrust('demo', 'script', '1.0.0')
    expect(trustedTier('demo')).toBe('script')
    expect(isAlreadyTrusted('demo', 'script')).toBe(true)
    expect(isAlreadyTrusted('demo', 'isolated')).toBe(true)
    expect(isAlreadyTrusted('demo', 'node')).toBe(false)
  })

  it('does not downgrade a previously higher tier', () => {
    rememberTrust('demo', 'node', '1.0.0')
    rememberTrust('demo', 'script', '1.1.0')
    expect(trustedTier('demo')).toBe('node')
    expect(isAlreadyTrusted('demo', 'script')).toBe(true)
  })

  it('persists to trust.json', () => {
    rememberTrust('demo', 'script', '1.0.0')
    const saved = JSON.parse(readFileSync(join(state.dir, 'trust.json'), 'utf8'))
    expect(saved.demo).toMatchObject({ tier: 'script', version: '1.0.0' })
    resetTrustCache()
    expect(isAlreadyTrusted('demo', 'script')).toBe(true)
  })
})
