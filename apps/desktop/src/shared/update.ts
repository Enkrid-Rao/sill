export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'latest'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'error'
  | 'unsupported'

export interface UpdateState {
  status: UpdateStatus
  /** 远端最新版本（去掉 v 前缀） */
  version?: string
  url?: string
  /** 下载进度 0–100 */
  progress?: number
  checkedAt?: number
  /** 失败/不可用原因 */
  reason?: 'private' | 'network' | 'signature' | 'portable' | 'dev' | 'offline'
}

/** Beta / RC / dev 构建允许检查 Pre-release；稳定版永远只走 Latest。 */
export function isPrereleaseVersion(version: string): boolean {
  return /-(?:alpha|beta|rc|dev)(?:[.-]|$)/i.test(version)
}
