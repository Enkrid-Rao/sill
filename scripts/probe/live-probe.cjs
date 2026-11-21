/**
 * Phase 3 探针：能不能一边把面板从采集里排除，一边拿到**实时**桌面。
 *
 *   electron.exe scripts/probe/live-probe.cjs
 *
 * L1  session.setDisplayMediaRequestHandler + getDisplayMedia 能否直接拿到屏幕流
 * L2  <video> 逐帧推进（currentTime 会走）→ 可以用 requestVideoFrameCallback 喂纹理
 * L3  WebGL2 texImage2D(video) 能跑，且耗时多少
 * L4  setContentProtection(true) 的窗口不在流里（用一块品红 + 一块绿做标记）
 */
const { app, BrowserWindow, desktopCapturer, nativeImage, screen, session } = require('electron')
const { mkdirSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

const OUT = join(__dirname, '../../apps/desktop/out/glass-probe')
mkdirSync(OUT, { recursive: true })
const report = { electron: process.versions.electron, chrome: process.versions.chrome }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const PAGE = `<!doctype html><html><body style="margin:0;background:#000">
<div id="m" style="position:fixed;inset:0"></div>
<video id="v" style="width:2px;height:2px;opacity:0" muted playsinline></video>
<script>
window.__state = { stage: 'start' }
window.__run = async () => {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 } })
    const track = stream.getVideoTracks()[0]
    const settings = track.getSettings ? track.getSettings() : {}
    const v = document.getElementById('v')
    v.srcObject = stream
    await v.play()
    await new Promise((r) => setTimeout(r, 800))
    window.__state = {
      stage: 'playing',
      width: v.videoWidth,
      height: v.videoHeight,
      settings,
      currentTime: v.currentTime,
      hasProcessor: typeof MediaStreamTrackProcessor === 'function'
    }
    // 再等一会，看 currentTime 是否推进（= 真的有新帧）
    await new Promise((r) => setTimeout(r, 700))
    window.__state.currentTime2 = v.currentTime
    window.__state.readyState = v.readyState
  } catch (error) {
    window.__state = { stage: 'error', error: String(error && error.message ? error.message : error) }
  }
}
</script></body></html>`

async function run() {
  await app.whenReady()
  const display = screen.getPrimaryDisplay()
  report.display = { size: display.size, scaleFactor: display.scaleFactor }

  // L4 用：一块带品红/绿色标记的窗口，覆盖屏幕右侧
  const marker = new BrowserWindow({
    x: display.bounds.x + Math.round(display.size.width * 0.55),
    y: display.bounds.y + 120,
    width: 420,
    height: 560,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  })
  marker.setAlwaysOnTop(true, 'screen-saver')
  await marker.loadURL(
    'data:text/html,' +
      encodeURIComponent(
        `<body style="margin:0;background:#ff00ff"><div style="height:50%;background:#00ff00"></div></body>`
      )
  )
  marker.showInactive()
  await sleep(700)

  // L1/L2
  session.defaultSession.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 64, height: 64 } })
      const source = sources.find((s) => s.display_id === String(display.id)) ?? sources[0]
      callback({ video: source })
    },
    { useSystemPicker: false }
  )

  const win = new BrowserWindow({
    show: false,
    width: 480,
    height: 320,
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  })
  // data: URL 不是安全上下文（navigator.mediaDevices 直接是 undefined），落到文件里再 loadFile
  const pageFile = join(OUT, 'live-probe-page.html')
  writeFileSync(pageFile, PAGE)
  await win.loadFile(pageFile)
  await win.webContents.executeJavaScript('window.__run()')
  for (let i = 0; i < 30; i++) {
    await sleep(200)
    const state = await win.webContents.executeJavaScript('window.__state')
    if (state.stage !== 'start') {
      report.L1L2 = state
      if (state.stage === 'error') break
      if (state.currentTime2 !== undefined) break
    }
  }

  // L3：把 video 上传成纹理并画一帧
  report.L3 = await win.webContents.executeJavaScript(`(() => {
    const v = document.getElementById('v')
    if (!v || !v.videoWidth) return { ok: false, reason: 'no video' }
    const canvas = document.createElement('canvas')
    canvas.width = v.videoWidth
    canvas.height = v.videoHeight
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: false })
    if (!gl) return { ok: false, reason: 'no webgl2' }
    const tex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    const times = []
    for (let i = 0; i < 10; i++) {
      const t = performance.now()
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v)
      times.push(performance.now() - t)
    }
    times.sort((a, b) => a - b)
    return { ok: true, medianMs: times[5], maxMs: times[9], videoW: v.videoWidth, videoH: v.videoHeight }
  })()`)

  // L4：抓一帧屏幕，看标记窗口是否被排除
  win.destroy()
  marker.setContentProtection(true)
  await sleep(600)
  const shot = await captureClean(display)
  saveCrop(shot, marker.getBounds(), display, 'L4-wda-on')
  marker.setContentProtection(false)
  await sleep(400)
  const shot2 = await captureClean(display)
  saveCrop(shot2, marker.getBounds(), display, 'L4-wda-off')

  report.L4 = {
    wdaOn: magentaRatio(shot),
    wdaOff: magentaRatio(shot2)
  }

  marker.destroy()
  writeFileSync(join(OUT, 'live-report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  app.quit()
}

async function captureClean(display) {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: Math.round(display.size.width / 2),
      height: Math.round(display.size.height / 2)
    }
  })
  const source = sources.find((s) => s.display_id === String(display.id)) ?? sources[0]
  return source.thumbnail
}

function saveCrop(image, bounds, display, name) {
  if (image.isEmpty()) return
  const size = image.getSize()
  const scale = size.width / display.size.width
  const x = Math.round((bounds.x - display.bounds.x) * scale)
  const y = Math.round((bounds.y - display.bounds.y) * scale)
  const w = Math.round(bounds.width * scale)
  const h = Math.round(bounds.height * scale)
  const file = join(OUT, `${name}.png`)
  writeFileSync(file, image.crop({ x, y, width: w, height: h }).toPNG())
}

/** 品红 / 绿 像素占比：WDA 生效时应接近 0 */
function magentaRatio(image) {
  if (image.isEmpty()) return null
  const size = image.getSize()
  const bitmap = image.toBitmap()
  let hit = 0
  let total = 0
  for (let i = 0; i < bitmap.length; i += 4 * 7) {
    const b = bitmap[i]
    const g = bitmap[i + 1]
    const r = bitmap[i + 2]
    total++
    if ((r > 180 && b > 180 && g < 100) || (g > 180 && r < 100 && b < 100)) hit++
  }
  return total ? hit / total : null
}

app.whenReady().then(run).catch((error) => {
  console.error('[live-probe] failed:', error)
  writeFileSync(join(OUT, 'live-report.json'), JSON.stringify({ ...report, fatal: String(error && error.stack) }, null, 2))
  app.quit()
})
