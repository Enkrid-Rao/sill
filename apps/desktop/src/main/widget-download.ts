import { net } from 'electron'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isAllowedDownloadUrl } from '../shared/catalog'

/** 从 URL 安装：只收 https（本机 http 留给开发/自建源），大小与 .sill 安装器一致。 */
const MAX_BYTES = 50 * 1024 * 1024
const TIMEOUT_MS = 30_000

export interface DownloadOutcome {
  ok: boolean
  file?: string
  error?: string
}

export async function downloadPackage(
  raw: string,
  expectedSha256?: string
): Promise<DownloadOutcome> {
  const url = raw.trim()
  if (!url) return { ok: false, error: '链接为空' }
  if (!isAllowedDownloadUrl(url)) {
    return { ok: false, error: '只支持 https 链接（本机 http 仅用于开发）' }
  }
  const rawExpected = typeof expectedSha256 === 'string' ? expectedSha256.trim() : ''
  if (rawExpected && !/^[a-f0-9]{64}$/i.test(rawExpected)) {
    return { ok: false, error: '组件包校验值无效' }
  }
  const expected = rawExpected ? rawExpected.toLowerCase() : null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await net.fetch(url, { signal: controller.signal, redirect: 'follow' })
    if (!response.ok) return { ok: false, error: `下载失败：HTTP ${response.status}` }

    const declared = Number(response.headers.get('content-length') ?? '0')
    if (Number.isFinite(declared) && declared > MAX_BYTES) {
      return { ok: false, error: '组件包超过 50 MB' }
    }

    const data = Buffer.from(await response.arrayBuffer())
    if (data.length > MAX_BYTES) return { ok: false, error: '组件包超过 50 MB' }
    // zip 的本地文件头：PK\x03\x04
    if (data.length < 4 || data[0] !== 0x50 || data[1] !== 0x4b) {
      return { ok: false, error: '下载到的不是 .sill（zip）文件' }
    }

    if (expected) {
      const actual = createHash('sha256').update(data).digest('hex')
      if (actual !== expected) {
        return {
          ok: false,
          error: '组件包校验失败：SHA-256 与目录不一致，已拒绝安装'
        }
      }
    }

    const dir = join(tmpdir(), 'sill-downloads')
    mkdirSync(dir, { recursive: true })
    const file = join(dir, `widget-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.sill`)
    writeFileSync(file, data)
    return { ok: true, file }
  } catch (error) {
    const message =
      error instanceof Error && error.name === 'AbortError' ? '下载超时' : String(error)
    return { ok: false, error: `下载失败：${message}` }
  } finally {
    clearTimeout(timer)
  }
}
