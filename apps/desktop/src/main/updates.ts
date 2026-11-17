import { app } from 'electron'
import { autoUpdater, type ProgressInfo, type UpdateInfo } from 'electron-updater'
import type { UpdateState } from '../shared/update'
import { broadcast } from './broadcast'
import { IS_PORTABLE } from './paths'
import { loadSettings } from './settings'

export type { UpdateState, UpdateStatus } from '../shared/update'

const RELEASE_URL = 'https://github.com/Enkrid-Rao/sill/releases/latest'

let state: UpdateState = { status: 'idle' }
let initialized = false
let checking: Promise<UpdateState> | null = null
let downloading: Promise<UpdateState> | null = null

function publish(next: UpdateState): UpdateState {
  state = next
  broadcast('update:state', next)
  return next
}

function errorReason(error: unknown): UpdateState['reason'] {
  const text = String(error)
  return /signature|code signing|publisher/i.test(text) ? 'signature' : 'network'
}

function init(): void {
  if (initialized) return
  initialized = true
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowDowngrade = false
  autoUpdater.allowPrerelease = false

  autoUpdater.on('checking-for-update', () => {
    publish({ status: 'checking' })
  })

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    publish({
      status: 'available',
      version: info.version,
      url: RELEASE_URL,
      checkedAt: Date.now()
    })
    // autoUpdate 的真义是“自动下载并安装”，不是只弹一个可用提示。
    if (loadSettings().autoUpdate) void downloadUpdate()
  })

  autoUpdater.on('update-not-available', () => {
    publish({ status: 'latest', version: app.getVersion(), checkedAt: Date.now() })
  })

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    publish({
      status: 'downloading',
      version: state.version,
      progress: Math.max(0, Math.min(100, Math.round(progress.percent))),
      url: state.url,
      checkedAt: state.checkedAt
    })
  })

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    publish({
      status: 'downloaded',
      version: info.version,
      progress: 100,
      url: RELEASE_URL,
      checkedAt: Date.now()
    })
  })

  autoUpdater.on('error', (error: Error) => {
    console.error('[sill] 自动更新失败：', error)
    publish({ status: 'error', reason: errorReason(error), checkedAt: Date.now() })
  })
}

export function getUpdateState(): UpdateState {
  return state
}

export function checkForUpdates(): Promise<UpdateState> {
  if (IS_PORTABLE) {
    return Promise.resolve(publish({ status: 'unsupported', reason: 'portable' }))
  }
  if (!app.isPackaged) {
    return Promise.resolve(publish({ status: 'unsupported', reason: 'dev' }))
  }

  init()
  if (checking) return checking

  publish({ status: 'checking' })
  checking = (async (): Promise<UpdateState> => {
    try {
      const result = await autoUpdater.checkForUpdates()
      if (result && !result.isUpdateAvailable && state.status === 'checking') {
        publish({ status: 'latest', version: app.getVersion(), checkedAt: Date.now() })
      }
    } catch (error) {
      console.error('[sill] 检查更新失败：', error)
      publish({ status: 'error', reason: errorReason(error), checkedAt: Date.now() })
    } finally {
      checking = null
    }
    return state
  })()
  return checking
}

export function downloadUpdate(): Promise<UpdateState> {
  if (IS_PORTABLE) {
    return Promise.resolve(publish({ status: 'unsupported', reason: 'portable' }))
  }
  if (!app.isPackaged) {
    return Promise.resolve(publish({ status: 'unsupported', reason: 'dev' }))
  }
  if (downloading) return downloading
  if (state.status === 'downloaded') return Promise.resolve(state)
  if (state.status !== 'available' && state.status !== 'downloading') {
    return Promise.resolve(state)
  }

  init()
  publish({ ...state, status: 'downloading', progress: 0 })
  downloading = (async (): Promise<UpdateState> => {
    try {
      await autoUpdater.downloadUpdate()
    } catch (error) {
      console.error('[sill] 下载更新失败：', error)
      publish({ status: 'error', reason: errorReason(error), checkedAt: Date.now() })
    } finally {
      downloading = null
    }
    return state
  })()
  return downloading
}

export function installUpdate(): boolean {
  if (state.status !== 'downloaded') return false
  // 让 IPC 先返回，再走 electron-updater 的“退出并安装”流程
  setTimeout(() => {
    try {
      autoUpdater.quitAndInstall(false, true)
    } catch (error) {
      console.error('[sill] 安装更新失败：', error)
      publish({ status: 'error', reason: errorReason(error), checkedAt: Date.now() })
    }
  }, 120)
  return true
}
