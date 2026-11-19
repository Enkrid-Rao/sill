import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import { protocol } from 'electron'

/**
 * 组件资源协议：sill-asset://<component-id>/<包内路径>
 *
 * 模板和 web 组件都可以直接写 <img src="assets/bg.png"> 或 url(bg.png)，
 * 宿主把它解析到组件目录，不用把图片转成 data URI，也不用起本地服务器。
 */
export const ASSET_SCHEME = 'sill-asset'

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.json': 'application/json',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm'
}

function within(root: string, target: string): boolean {
  const base = resolve(root)
  const full = resolve(target)
  return full === base || full.startsWith(`${base}\\`) || full.startsWith(`${base}/`)
}

/** 必须在 app ready 之前调用。 */
export function registerAssetScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: ASSET_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true
      }
    }
  ])
}

/** app ready 之后调用；resolveDir 负责把组件 id 映射到磁盘目录。 */
export function handleAssetProtocol(resolveDir: (id: string) => string | null): void {
  protocol.handle(ASSET_SCHEME, (request) => {
    try {
      const url = new URL(request.url)
      const id = decodeURIComponent(url.hostname)
      const dir = resolveDir(id)
      if (!dir) return new Response('component not found', { status: 404 })

      const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '')
      const target = resolve(dir, rel)
      if (!within(dir, target) || !existsSync(target) || !statSync(target).isFile()) {
        return new Response('not found', { status: 404 })
      }

      return new Response(readFileSync(target), {
        headers: {
          'content-type': MIME[extname(target).toLowerCase()] ?? 'application/octet-stream',
          'cache-control': 'no-cache',
          'access-control-allow-origin': '*'
        }
      })
    } catch {
      return new Response('bad request', { status: 400 })
    }
  })
}
