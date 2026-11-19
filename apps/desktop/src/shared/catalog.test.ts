import { describe, expect, it } from 'vitest'
import { isAllowedDownloadUrl, normalizeCatalog, pickLocalized } from './catalog'

describe('isAllowedDownloadUrl', () => {
  it('accepts https and loopback http', () => {
    expect(isAllowedDownloadUrl('https://example.com/clock.sill')).toBe(true)
    expect(isAllowedDownloadUrl('http://127.0.0.1:8080/clock.sill')).toBe(true)
    expect(isAllowedDownloadUrl('http://localhost:8080/clock.sill')).toBe(true)
  })

  it('rejects remote http and other protocols', () => {
    expect(isAllowedDownloadUrl('http://example.com/clock.sill')).toBe(false)
    expect(isAllowedDownloadUrl('file:///D:/clock.sill')).toBe(false)
    expect(isAllowedDownloadUrl('ftp://example.com/clock.sill')).toBe(false)
    expect(isAllowedDownloadUrl('not a url')).toBe(false)
  })
})

describe('normalizeCatalog', () => {
  const base = {
    id: 'com.example.clock',
    name: { en: 'Clock', zh: '时钟' },
    summary: { en: 'A clock' },
    version: '1.0.0',
    author: 'you',
    type: 'template',
    status: 'verified',
    installable: true,
    download: 'https://example.com/clock.sill'
  }

  it('keeps a well-formed entry', () => {
    const entries = normalizeCatalog({ schema: 1, widgets: [base] })
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      id: 'com.example.clock',
      version: '1.0.0',
      type: 'template',
      status: 'verified',
      installable: true
    })
  })

  it('drops entries with bad ids or versions', () => {
    const entries = normalizeCatalog({
      widgets: [
        { ...base, id: 'Bad Id' },
        { ...base, id: 'ok.id', version: '1.0' },
        base
      ]
    })
    expect(entries.map((entry) => entry.id)).toEqual(['com.example.clock'])
  })

  it('drops insecure download urls and clears installable', () => {
    const entries = normalizeCatalog({
      widgets: [{ ...base, download: 'http://example.com/clock.sill' }]
    })
    expect(entries[0].download).toBeUndefined()
    expect(entries[0].installable).toBe(false)
  })

  it('requires both installable and a download url', () => {
    const entries = normalizeCatalog({ widgets: [{ ...base, download: undefined }] })
    expect(entries[0].installable).toBe(false)
    expect(
      normalizeCatalog({ widgets: [{ ...base, installable: false }] })[0].installable
    ).toBe(false)
  })

  it('survives non-object input', () => {
    expect(normalizeCatalog(null)).toEqual([])
    expect(normalizeCatalog({ widgets: 'nope' })).toEqual([])
  })
})

describe('pickLocalized', () => {
  it('falls back across languages', () => {
    expect(pickLocalized({ en: 'Clock', zh: '时钟' }, 'zh')).toBe('时钟')
    expect(pickLocalized({ en: 'Clock' }, 'zh')).toBe('Clock')
    expect(pickLocalized(undefined, 'en')).toBe('')
  })
})
