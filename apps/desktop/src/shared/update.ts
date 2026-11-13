export type UpdateStatus = 'idle' | 'checking' | 'latest' | 'available' | 'error'

export interface UpdateState {
  status: UpdateStatus
  /** 远端最新版本（去掉 v 前缀） */
  version?: string
  url?: string
  checkedAt?: number
  /** 失败原因：仓库未公开 / 网络 */
  reason?: 'private' | 'network'
}
