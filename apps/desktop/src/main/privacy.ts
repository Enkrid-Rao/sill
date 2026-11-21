import { session } from 'electron'
import { loadSettings } from './settings'

let installed = false

/**
 * 首启隐私门选择“离线”时，阻断 renderer / web 内容的外部 HTTP(S) 请求。
 * 主进程自己的天气、歌词、更新检查还会在各自入口再判断一次 consent。
 */
export function installNetworkGate(): void {
  if (installed) return
  installed = true
  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://*/*'] },
    (_details, callback) => {
      callback({ cancel: !loadSettings().networkConsent })
    }
  )
}
