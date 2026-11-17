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
  reason?: 'private' | 'network' | 'signature' | 'portable' | 'dev'
}
