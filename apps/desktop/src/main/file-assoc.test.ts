import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sillFileArgs } from './file-assoc'

describe('sillFileArgs', () => {
  it('only keeps existing .sill arguments', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sill-file-args-'))
    const file = join(dir, 'widget.sill')
    writeFileSync(file, 'not a real package')

    try {
      expect(
        sillFileArgs(['Sill.exe', 'C:\\work', file, '--smoke', join(dir, 'missing.sill')])
      ).toEqual([file])
      expect(sillFileArgs(['Sill.exe', '--smoke'])).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
