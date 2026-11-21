/**
 * Phase 0 探针（GLASS.md §7.1）。一次性脚本，跑完看 out/glass-probe/ 里的图与 report.json。
 *
 *   node_modules/electron/dist/electron.exe scripts/probe/glass-probe.cjs
 *
 * P1  透明窗 + setBackgroundMaterial('acrylic') 是否生效
 * P2  win.hide() 之后 desktopCapturer 抓屏：耗时、是否干净（不含自己）
 * P2b setContentProtection(true) 时抓屏是否排除自己
 * P3  渲染进程 WebGL2 可用性 + 1/3 分辨率纹理上传与绘制耗时
 *
 * 不改主路径：这个脚本是独立 electron 入口，不加载 apps/desktop。
 */
const { app, BrowserWindow, screen, desktopCapturer, nativeImage } = require('electron')
const { mkdirSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

const OUT = join(__dirname, '../../apps/desktop/out/glass-probe')
const MAGENTA = 'rgba(255,0,255,0.55)'

mkdirSync(OUT, { recursive: true })

const report = {
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  platform: process.platform,
  startedAt: new Date().toISOString()
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function saveImage(name, image) {
  if (!image || image.isEmpty()) {
    report[name] = { ok: false, reason: 'empty image' }
    return
  }
  const file = join(OUT, `${name}.png`)
  writeFileSync(file, image.toPNG())
  const size = image.getSize()
  report[name] = { ok: true, file, width: size.width, height: size.height }
}

/** 统计某块区域里「品红像素」的比例，用来判断抓到的图里有没有这个窗口 */
function magentaRatio(bitmap, width, height, rect) {
  let hit = 0
  let total = 0
  for (let y = rect.y; y < rect.y + rect.height; y += 2) {
    if (y < 0 || y >= height) continue
    for (let x = rect.x; x < rect.x + rect.width; x += 2) {
      if (x < 0 || x >= width) continue
      const i = (y * width + x) * 4
      const b = bitmap[i]
      const g = bitmap[i + 1]
      const r = bitmap[i + 2]
      total++
      // BGRA。透明窗口下面板区域被品红覆盖时 r/b 高、g 低
      if (r > 140 && b > 120 && g < 110) hit++
    }
  }
  return total ? hit / total : 0
}

function cropNative(image, rect) {
  const size = image.getSize()
  const x = Math.max(0, Math.min(size.width - 1, rect.x))
  const y = Math.max(0, Math.min(size.height - 1, rect.y))
  const width = Math.max(1, Math.min(size.width - x, rect.width))
  const height = Math.max(1, Math.min(size.height - y, rect.height))
  return image.crop({ x, y, width, height })
}

/** 一次抓屏。thumbnailSize 传屏幕的 1/3，返回图的真实尺寸用来推缩放比。 */
async function captureOnce(thumbnailSize) {
  const started = Date.now()
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize })
  const listMs = Date.now() - started
  const source = sources[0]
  if (!source) return { ok: false, reason: 'no sources', listMs }
  const uploadStarted = Date.now()
  const bitmap = source.thumbnail.toBitmap()
  const bitmapMs = Date.now() - uploadStarted
  const size = source.thumbnail.getSize()
  return {
    ok: true,
    listMs,
    bitmapMs,
    totalMs: listMs + bitmapMs,
    width: size.width,
    height: size.height,
    bytes: bitmap.length,
    bitmap,
    thumbnail: source.thumbnail,
    id: source.id,
    displayId: source.display_id,
    name: source.name
  }
}

async function run() {
  await app.whenReady()

  const display = screen.getPrimaryDisplay()
  const { workArea, scaleFactor, size: displaySize } = display
  report.display = {
    bounds: display.bounds,
    workArea,
    scaleFactor,
    pixelWidth: displaySize.width,
    pixelHeight: displaySize.height
  }

  // 和 panel.ts 一样的位置：右侧停靠、edgeGap 30、384 宽、撑满高度
  const PANEL_W = 384
  const EDGE = 30
  const MARGIN_Y = 16
  const height = workArea.height - MARGIN_Y * 2
  const rect = {
    x: workArea.x + workArea.width - PANEL_W - EDGE,
    y: workArea.y + MARGIN_Y,
    width: PANEL_W,
    height
  }
  report.panelRect = rect

  // ---------- P1 · 系统亚克力 ----------
  const win = new BrowserWindow({
    ...rect,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    useContentSize: true,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    roundedCorners: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  // 半透明品红：桌面细节若透过来就说明窗口是「透」的；糊不糊由截图判断
  await win.loadURL(
    'data:text/html;charset=utf-8,' +
      encodeURIComponent(
        `<html><body style="margin:0;height:100vh;background:${MAGENTA}">
         <div style="padding:24px;font:600 20px/1.4 sans-serif;color:#000">GLASS PROBE<br>acrylic test</div>
         </body></html>`
      )
  )

  report.backgroundMaterialApi = typeof win.setBackgroundMaterial === 'function'
  let acrylicError = null
  if (typeof win.setBackgroundMaterial === 'function') {
    try {
      win.setBackgroundMaterial('acrylic')
    } catch (error) {
      acrylicError = String(error && error.message ? error.message : error)
    }
  }
  report.acrylicError = acrylicError

  win.showInactive()
  await sleep(900)

  const thumbSize = {
    width: Math.round(displaySize.width / 3),
    height: Math.round(displaySize.height / 3)
  }
  const p1 = await captureOnce(thumbSize)
  if (p1.ok) {
    const scale = p1.width / displaySize.width
    const cropRect = {
      x: Math.round(rect.x * scale),
      y: Math.round(rect.y * scale),
      width: Math.round(rect.width * scale),
      height: Math.round(rect.height * scale)
    }
    saveImage('p1-screen-with-panel', p1.thumbnail)
    saveImage('p1-panel-crop', cropNative(p1.thumbnail, cropRect))
    report.p1 = {
      ...pick(p1),
      scale,
      magentaRatioInPanel: magentaRatio(p1.bitmap, p1.width, p1.height, cropRect)
    }
  } else {
    report.p1 = p1
  }

  // ---------- P2 · hide() 之后抓屏 ----------
  // 先确认「窗口可见时抓屏能抓到自己」，再对比 hide() 之后
  const timings = []
  for (let i = 0; i < 4; i++) {
    const shot = await captureOnce(thumbSize)
    timings.push(shot.ok ? shot.totalMs : -1)
    if (i === 3 && shot.ok) {
      const scale = shot.width / displaySize.width
      saveImage(
        'p2a-visible-full',
        shot.thumbnail
      )
      report.p2a = {
        visibleCaptureHasSelf: magentaRatio(shot.bitmap, shot.width, shot.height, {
          x: Math.round(rect.x * scale),
          y: Math.round(rect.y * scale),
          width: Math.round(rect.width * scale),
          height: Math.round(rect.height * scale)
        }),
        timings
      }
    }
  }

  win.hide()
  const hideAt = Date.now()
  const delayMs = [0, 60, 160, 400]
  report.p2 = { delays: [] }
  for (const delay of delayMs) {
    const target = hideAt + delay
    const wait = target - Date.now()
    if (wait > 0) await sleep(wait)
    const shot = await captureOnce(thumbSize)
    if (!shot.ok) {
      report.p2.delays.push({ delay, ok: false, reason: shot.reason })
      continue
    }
    const scale = shot.width / displaySize.width
    const cropRect = {
      x: Math.round(rect.x * scale),
      y: Math.round(rect.y * scale),
      width: Math.round(rect.width * scale),
      height: Math.round(rect.height * scale)
    }
    saveImage(`p2b-hidden-${delay}ms`, cropNative(shot.thumbnail, cropRect))
    report.p2.delays.push({
      delay,
      ok: true,
      ...pick(shot),
      scale,
      magentaRatioInPanel: magentaRatio(shot.bitmap, shot.width, shot.height, cropRect)
    })
  }

  // ---------- P2b · setContentProtection ----------
  try {
    win.setContentProtection(true)
    win.showInactive()
    await sleep(700)
    const shot = await captureOnce(thumbSize)
    if (shot.ok) {
      const scale = shot.width / displaySize.width
      const cropRect = {
        x: Math.round(rect.x * scale),
        y: Math.round(rect.y * scale),
        width: Math.round(rect.width * scale),
        height: Math.round(rect.height * scale)
      }
      saveImage('p2c-wda-crop', cropNative(shot.thumbnail, cropRect))
      report.p2c = {
        ok: true,
        magentaRatioInPanel: magentaRatio(shot.bitmap, shot.width, shot.height, cropRect)
      }
    }
    win.setContentProtection(false)
  } catch (error) {
    report.p2c = { ok: false, error: String(error) }
  }

  win.hide()

  // ---------- P3 · 渲染进程 WebGL2 ----------
  const probeWin = new BrowserWindow({
    show: false,
    width: 400,
    height: 300,
    webPreferences: { contextIsolation: true, nodeIntegration: false, offscreen: false }
  })
  await probeWin.loadURL('data:text/html,<html><body></body></html>')
  try {
    report.p3 = await probeWin.webContents.executeJavaScript(`(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 128
      canvas.height = 267
      const gl = canvas.getContext('webgl2', { premultipliedAlpha: false, alpha: true })
      if (!gl) return { ok: false, reason: 'no webgl2' }
      const dbg = gl.getExtension('WEBGL_debug_renderer_info')
      const pixels = new Uint8Array(128 * 267 * 4)
      for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 37) & 255
      const tex = gl.createTexture()
      gl.bindTexture(gl.TEXTURE_2D, tex)
      const t0 = performance.now()
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 128, 267, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
      gl.generateMipmap(gl.TEXTURE_2D)
      const tUpload = performance.now() - t0
      const vs = gl.createShader(gl.VERTEX_SHADER)
      gl.shaderSource(vs, '#version 300 es\\nin vec2 p; void main(){ gl_Position = vec4(p,0.,1.); }')
      gl.compileShader(vs)
      const fs = gl.createShader(gl.FRAGMENT_SHADER)
      gl.shaderSource(fs, '#version 300 es\\nprecision highp float; uniform sampler2D uTex; out vec4 o; void main(){ o = texture(uTex, gl_FragCoord.xy / vec2(128.,267.)); }')
      gl.compileShader(fs)
      const prog = gl.createProgram()
      gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog)
      const compiled = gl.getProgramParameter(prog, gl.LINK_STATUS)
      gl.useProgram(prog)
      const buf = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, buf)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW)
      gl.enableVertexAttribArray(0)
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
      const t1 = performance.now()
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4))
      const tDraw = performance.now() - t1
      return {
        ok: compiled,
        version: gl.getParameter(gl.VERSION),
        renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
        maxTexture: gl.getParameter(gl.MAX_TEXTURE_SIZE),
        extColorBufferFloat: Boolean(gl.getExtension('EXT_color_buffer_float')),
        uploadMs: tUpload,
        drawMs: tDraw,
        dpr: window.devicePixelRatio
      }
    })()`)
  } catch (error) {
    report.p3 = { ok: false, error: String(error) }
  }
  probeWin.destroy()

  // ---------- 收尾 ----------
  report.finishedAt = new Date().toISOString()
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  app.quit()
}

function pick(shot) {
  return {
    width: shot.width,
    height: shot.height,
    bytes: shot.bytes,
    listMs: shot.listMs,
    bitmapMs: shot.bitmapMs,
    totalMs: shot.totalMs,
    name: shot.name,
    displayId: shot.displayId
  }
}

app.whenReady().then(run).catch((error) => {
  console.error('[probe] failed:', error)
  writeFileSync(join(OUT, 'report.json'), JSON.stringify({ ...report, fatal: String(error && error.stack) }, null, 2))
  app.quit()
})
