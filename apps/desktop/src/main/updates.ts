import { app, net } from 'electron'
import type { UpdateState } from '../shared/update'

export type { UpdateState, UpdateStatus } from '../shared/update'

const RELEASES_API = 'https://api.github.com/repos/Enkrid-Rao/sill/releases/latest'

let state: UpdateState = { status: 'idle' }
let inflight: Promise<UpdateState> | null = null

export function getUpdateState(): UpdateState {
  return state
}

/** 简单的数字段比较：1.2.10 > 1.2.9 */
function isNewer(remote: string, local: string): boolean {
  const a = remote.split('.').map((part) => Number.parseInt(part, 10) || 0)
  const b = local.split('.').map((part) => Number.parseInt(part, 10) || 0)
  const length = Math.max(a.length, b.length)
  for (let index = 0; index < length; index += 1) {
    const left = a[index] ?? 0
    const right = b[index] ?? 0
    if (left !== right) return left > right
  }
  return false
}

export function checkForUpdates(): Promise<UpdateState> {
  if (inflight) return inflight
  state = { status: 'checking' }
  inflight = (async (): Promise<UpdateState> => {
    try {
      const response = await net.fetch(RELEASES_API, {
        headers: { Accept: 'application/vnd.github+json' }
      })
      if (response.status === 404) {
        // 私有仓库未带 token 时 GitHub 返回 404
        state = { status: 'error', reason: 'private', checkedAt: Date.now() }
        return state
      }
      if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`)
      const data = (await response.json()) as { tag_name?: string; html_url?: string }
      const latest = String(data.tag_name ?? '').replace(/^v/i, '')
      const current = app.getVersion()
      state = latest && isNewer(latest, current)
        ? { status: 'available', version: latest, url: data.html_url, checkedAt: Date.now() }
        : { status: 'latest', version: current, checkedAt: Date.now() }
    } catch (error) {
      console.error('[sill] 检查更新失败：', error)
      state = { status: 'error', reason: 'network', checkedAt: Date.now() }
    } finally {
      inflight = null
    }
    return state
  })()
  return inflight
}
