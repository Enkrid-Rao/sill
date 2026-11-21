import { session } from 'electron'
import { loadSettings } from './settings'

let installed = false

/**
 * 本机回环不算「联网」。
 * 开发时 renderer 是从 http://localhost:5173 载入的，组件目录 / 本地安装源也可以
 * 走 127.0.0.1（见 settings.ts 对 catalogSources 的校验）。闸门把这些一起 cancel，
 * 表现就是 `pnpm dev` 启动后 ERR_BLOCKED_BY_CLIENT 白屏 —— 不是隐私策略的本意。
 */
const LOOPBACK = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i

/**
 * 首启隐私门选择“离线”时，阻断 renderer / web 内容的外部 HTTP(S) 请求。
 * 主进程自己的天气、歌词、更新检查还会在各自入口再判断一次 consent。
 */
export function installNetworkGate(): void {
  if (installed) return
  installed = true
  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://*/*'] },
    (details, callback) => {
      if (LOOPBACK.test(details.url)) {
        callback({})
        return
      }
      callback({ cancel: !loadSettings().networkConsent })
    }
  )
}
