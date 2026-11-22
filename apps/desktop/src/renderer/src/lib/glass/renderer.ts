import vertSource from './glass.vert.glsl?raw'
import glassSource from './glass.frag.glsl?raw'
import blurSource from './blur.frag.glsl?raw'
import type { PanelOrigin } from '../../../../shared/glass'
import type { MotionState } from './motion'

/**
 * 液态玻璃的 WebGL2 渲染器。
 *
 * 两个 pass：
 *  1. 抓帧进来时做一次可分离高斯（横 + 竖），结果留在 blurTex。
 *     只在换帧时跑，跟每帧开销无关。
 *  2. 每帧一次合成：squircle SDF → 折射 → 色散 → 高光。
 *     这是唯一每帧的成本，385×1009 CSS 的面板在笔记本独显上 < 1ms。
 *
 * 背景冻结的代价被「采样的是模糊图」抵消（docs/GLASS.md §6.1），
 * 而呼吸 / 震荡 / 滚动流向全部是 uniform 动画，不需要新帧。
 */

export interface BackdropFrame {
  /** RGBA8，按纹理像素排列（主进程负责把 BGRA 掰正）。live 档为空 */
  data: Uint8Array
  width: number
  height: number
  /** 抓的这块屏的 DIP 尺寸 */
  displayWidth: number
  displayHeight: number
  /** 抓帧那一刻，面板在这个屏幕坐标系里的 DIP 矩形（排查用） */
  panelX: number
  panelY: number
  /** 位图是 BGRA（Windows）还是 RGBA */
  bgra: boolean
  /** 帧来源，排查用 */
  source?: 'desktop' | 'mock'
}

export interface GlassLook {
  /** 高斯 σ（CSS px） */
  blur: number
  /** 折射斜面宽度（CSS px） */
  bezel: number
  /** 玻璃板厚（CSS px） */
  thickness: number
  ior: number
  displace: number
  dispersion: number
  saturation: number
  tint: [number, number, number]
  tintAlpha: number
  legibility: number
  specular: [number, number, number, number]
  specularShape: [number, number]
  /** 内侧投影强度 0..1 */
  rimShade: number
  /** 圆角超椭圆指数（2 = 正圆弧，2.5 = squircle） */
  cornerExp: number
}

export const DEFAULT_LOOK: GlassLook = {
  blur: 8,
  bezel: 18,
  thickness: 14,
  ior: 1.45,
  displace: 2.2,
  dispersion: 0.3,
  saturation: 1.18,
  tint: [0.07, 0.07, 0.07],
  tintAlpha: 0.55,
  legibility: 0.45,
  specular: [0.75, 0.38, 1.15, 0.9],
  specularShape: [2.2, 3.0],
  rimShade: 0.5,
  cornerExp: 2.5
}

/**
 * squircle 的圆角外延量：让 45° 顶点落在正圆弧该在的位置，
 * 但侧面是 n=2.5 的超椭圆。n=2 时正好等于半径（见 liquid_glass.rs:383-395）。
 */
export function cornerExtent(radius: number, expo: number): number {
  const denominator = 1 - Math.pow(2, -1 / expo)
  if (!(denominator > 0.0001)) return radius
  return (radius * (1 - Math.SQRT1_2)) / denominator
}

/** 实时档的模糊输出降采样倍数：每帧都要跑，除以 4 = 代价 ÷16，糊完看不出来 */
const LIVE_BLUR_DIVISOR = 4

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('createShader failed')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? 'unknown'
    gl.deleteShader(shader)
    throw new Error(`shader compile: ${log}`)
  }
  return shader
}

interface Pass {
  program: WebGLProgram
  uniforms: Map<string, WebGLUniformLocation | null>
}

function buildPass(gl: WebGL2RenderingContext, vert: string, frag: string): Pass {
  const program = gl.createProgram()
  if (!program) throw new Error('createProgram failed')
  const vs = compile(gl, gl.VERTEX_SHADER, vert)
  const fs = compile(gl, gl.FRAGMENT_SHADER, frag)
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? 'unknown'
    gl.deleteProgram(program)
    throw new Error(`program link: ${log}`)
  }
  return { program, uniforms: new Map() }
}

function uniform(pass: Pass, gl: WebGL2RenderingContext, name: string): WebGLUniformLocation | null {
  const cached = pass.uniforms.get(name)
  if (cached !== undefined) return cached
  const location = gl.getUniformLocation(pass.program, name)
  pass.uniforms.set(name, location)
  return location
}

interface Target {
  texture: WebGLTexture
  framebuffer: WebGLFramebuffer
  width: number
  height: number
}

export class GlassRenderer {
  readonly gl: WebGL2RenderingContext
  private readonly composite: Pass
  private readonly blur: Pass
  private readonly backdrop: WebGLTexture
  private readonly emptyArray: WebGLVertexArrayObject

  private blurA: Target | null = null
  private blurB: Target | null = null
  /** blurB 里是不是真的有一份模糊结果；σ≈0 时直接采样原图 */
  private blurReady = false

  private backdropWidth = 0
  private backdropHeight = 0
  private displayWidth = 1
  private displayHeight = 1
  private panelX = 0
  private panelY = 0
  private bgra = 1
  private hasBackdrop = false
  /** 实时档：持续出帧的 <video>，以及「有新帧待上传」的脏标记 */
  private liveAttached = false
  private liveVideo: HTMLVideoElement | null = null
  private liveDirty = false
  private liveHasFrame = false
  private liveFrameCount = 0
  /** 成功上传的次数（对比 liveFrameCount 就知道上传有没有失败） */
  private liveUploadCount = 0
  /** 实时档期间收到的静态帧：留在手上，等流断了再顶上 */
  private pendingStatic: BackdropFrame | null = null
  /** 最新一帧还没上传的 VideoFrame */
  private pendingFrame: VideoFrame | null = null
  /** 采集到上传的年龄（ms），-1 = 时钟对不上 */
  private lastAgeMs = -1
  /** 延迟诊断：最近一帧的到达时刻 / 落画时刻 / 合成提交耗时 */
  private lastArrivalAt = 0
  private lastLiveDrawAt = 0
  private drawCostMs = 0
  private frameArrivals = 0
  private lastSigma = 8

  private cssWidth = 1
  private cssHeight = 1
  private dpr = 1
  private disposed = false
  private lost = false

  constructor(private readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance'
    })
    if (!gl) throw new Error('webgl2 unavailable')
    this.gl = gl

    this.composite = buildPass(gl, vertSource, glassSource)
    this.blur = buildPass(gl, vertSource, blurSource)

    // 全屏三角形：顶点属性全部由 gl_VertexID 生成，VAO 只是占位
    this.emptyArray = gl.createVertexArray() as WebGLVertexArrayObject

    const texture = gl.createTexture()
    if (!texture) throw new Error('createTexture failed')
    this.backdrop = texture
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

    canvas.addEventListener('webglcontextlost', this.onContextLost)
  }

  private onContextLost = (event: Event): void => {
    // 别让浏览器尝试恢复：重建成败由上层决定（连续失败就回退到贴膜）
    event.preventDefault()
    this.lost = true
  }

  get available(): boolean {
    return !this.disposed && !this.lost
  }

  /** 有可用帧时才算「真玻璃」，否则上层用旧的贴膜样式兜底 */
  get ready(): boolean {
    return this.available && this.hasBackdrop
  }

  /** 实时档是否已经接上了流（VideoFrame 或 <video> 任一） */
  setLiveAttached(attached: boolean): void {
    if (attached) {
      this.attachLive(this.liveVideo)
      return
    }
    this.detachLive()
  }
  resize(cssWidth: number, cssHeight: number, dpr: number): void {
    const width = Math.max(1, Math.round(cssWidth * dpr))
    const height = Math.max(1, Math.round(cssHeight * dpr))
    this.cssWidth = Math.max(1, cssWidth)
    this.cssHeight = Math.max(1, cssHeight)
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width
      this.canvas.height = height
    }
    this.dpr = Math.max(0.5, dpr)
  }

  /** 实时帧：优先上传 VideoFrame，没有就退回 <video>（GPU 内部拷贝，不过 CPU） */
  private uploadLive(sigmaCss: number): boolean {
    const gl = this.gl
    const frame = this.pendingFrame
    const video = this.liveVideo
    const source: TexImageSource | null = frame ?? (video && video.readyState >= 2 ? video : null)
    if (!source) return false

    const width = frame ? frame.displayWidth : video ? video.videoWidth : 0
    const height = frame ? frame.displayHeight : video ? video.videoHeight : 0
    if (!width || !height) {
      if (frame) this.releaseFrame()
      return false
    }

    gl.bindTexture(gl.TEXTURE_2D, this.backdrop)
    try {
      if (this.backdropWidth !== width || this.backdropHeight !== height) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
        this.backdropWidth = width
        this.backdropHeight = height
      } else {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source)
      }
    } catch (error) {
      console.warn('[sill] 实时帧上传失败：', error)
      this.releaseFrame()
      return false
    }

    if (frame) {
      // VideoFrame 的时间戳和 performance.now() 是同一套单调时钟（微秒）
      const age = performance.now() - frame.timestamp / 1000
      this.lastAgeMs = age > 0 && age < 1000 ? age : -1
      this.releaseFrame()
    }

    const dpr = this.dpr || 1
    this.displayWidth = Math.max(1, width / dpr)
    this.displayHeight = Math.max(1, height / dpr)
    this.bgra = 0
    this.hasBackdrop = true
    this.liveHasFrame = true
    this.liveFrameCount++
    this.liveUploadCount++
    this.lastSigma = sigmaCss
    this.runBlur(sigmaCss, LIVE_BLUR_DIVISOR)
    return true
  }

  private releaseFrame(): void {
    if (!this.pendingFrame) return
    this.pendingFrame.close()
    this.pendingFrame = null
  }

  /**
   * 换一帧静态桌面快照。会同步跑两遍高斯（几百微秒到几毫秒），
   * 调用点在面板刚收起之后，用户看不见这几十毫秒。
   */
  setBackdrop(frame: BackdropFrame, sigmaCss: number): void {
    if (!this.available) return
    // 实时档在跑就别让静态帧插进来：它会换掉纹理、还顺手把模糊重跑成静态那张，
    // 表现出来就是「突然闪一下旧桌面」。等流真断了再回退才用静态帧。
    if (this.liveAttached) {
      this.pendingStatic = frame
      return
    }
    this.applyStatic(frame, sigmaCss)
  }

  private applyStatic(frame: BackdropFrame, sigmaCss: number): void {
    const gl = this.gl
    const { width, height, data } = frame
    if (!width || !height || data.length < width * height * 4) return

    if (this.backdropWidth !== width || this.backdropHeight !== height) {
      gl.bindTexture(gl.TEXTURE_2D, this.backdrop)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, data)
      this.backdropWidth = width
      this.backdropHeight = height
    } else {
      gl.bindTexture(gl.TEXTURE_2D, this.backdrop)
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data)
    }

    this.displayWidth = Math.max(1, frame.displayWidth)
    this.displayHeight = Math.max(1, frame.displayHeight)
    this.panelX = frame.panelX
    this.panelY = frame.panelY
    this.bgra = frame.bgra ? 1 : 0
    this.hasBackdrop = true

    this.runBlur(sigmaCss)
  }

  /**
   * 实时档接上了（两种来源之一），之后每帧由 draw() 自己上传 + 模糊。
   * `video` 只有回退路径才会给；普通路径是 MediaStreamTrackProcessor 推 VideoFrame。
   */
  attachLive(video: HTMLVideoElement | null): void {
    this.liveAttached = true
    this.liveVideo = video
    this.liveDirty = true
  }

  /** 实时档断了：回到静态帧（如果手上有） */
  detachLive(): void {
    this.liveAttached = false
    this.liveVideo = null
    this.releaseFrame()
    const pending = this.pendingStatic
    this.pendingStatic = null
    if (pending) this.applyStatic(pending, this.lastSigma)
  }

  /**
   * 实时帧入口。优先走 `MediaStreamTrackProcessor` 拿到的 VideoFrame：
   * 它是**采集出来的原始帧**，不经过 <video> 的呈现队列，少 1–2 帧的抖动缓冲。
   * 只留最新一帧，旧的立刻 close()，否则会攒出一堆内存。
   */
  pushVideoFrame(frame: VideoFrame): void {
    if (this.pendingFrame) this.pendingFrame.close()
    this.pendingFrame = frame
    this.liveDirty = true
    // 延迟诊断：这一帧什么时候到的（跨进程用 Date.now，同一个系统时钟）
    this.lastArrivalAt = Date.now()
    this.frameArrivals++
  }

  /**
   * 延迟诊断快照（毫秒级时间戳，跨进程可比）：
   *  - arriveAt：最近一帧 VideoFrame 到达渲染进程的时刻 → 起点是采集
   *  - liveDrawAt：这一帧被画进玻璃的时刻 → 中间是上传 + 模糊 + 合成
   *  - captureLagMs：arriveAt - 采集时刻（VideoFrame.timestamp，只有同一时钟才有效，否则 -1）
   */
  get latency(): { arriveAt: number; drawAt: number; submitMs: number; captureLagMs: number } {
    return {
      arriveAt: this.lastArrivalAt,
      drawAt: this.lastLiveDrawAt,
      submitMs: Math.round(this.drawCostMs * 100) / 100,
      captureLagMs: this.lastAgeMs
    }
  }

  /** VideoFrame 的采集时刻到现在的年龄（毫秒）；时钟不通时返回 -1 */
  get lastFrameAgeMs(): number {
    return this.lastAgeMs
  }

  /** 有新的视频帧可用（<video> 回退路径用） */
  markLiveFrame(): void {
    this.liveDirty = true
  }

  /**
   * 预滚帧：面板**隐藏时**持续把最新的桌面帧塞进纹理并重跑模糊，但不做合成
   * （窗口不可见，画了也没人看）。
   *
   * 这样「静态帧」档在唤出时手上已经是最新的桌面，而不是上一次收起时的旧画面；
   * 唤出后不再喂帧，材质语义仍然是「冻结的一帧」。
   */
  ingestFrame(frame: VideoFrame, sigmaCss: number): void {
    if (!this.available) {
      frame.close()
      return
    }
    this.pushVideoFrame(frame)
    this.uploadLive(sigmaCss)
  }

  get liveReady(): boolean {
    return this.liveAttached && this.liveHasFrame
  }

  /** 已经上传过多少帧实时画面（0 = 还在用静态帧） */
  get liveFrames(): number {
    return this.liveFrameCount
  }

  get liveUploads(): number {
    return this.liveUploadCount
  }

  /** σ 换算成纹理像素；抓帧分辨率比 CSS 低，σ 得按比例缩 */
  private sigmaToTexels(sigmaCss: number): number {
    if (this.displayWidth <= 0) return 0
    const texelsPerCss = this.backdropWidth / this.displayWidth
    return Math.max(0, sigmaCss * texelsPerCss)
  }

  /**
   * 两遍可分离高斯。
   * divisor 决定**输出**分辨率：静态帧一次，用 1；实时流每帧都要跑，用 4
   * 把代价压到 1/16——反正结果还要糊，只有 σ 和采样点位置对得上就行。
   */
  private runBlur(sigmaCss: number, divisor = 1): void {
    const gl = this.gl
    const sigma = this.sigmaToTexels(sigmaCss)
    if (sigma < 0.3) {
      // 不需要模糊：让合成 pass 直接采样原图，别去读一张没写过的 FBO
      this.blurReady = false
      return
    }

    const width = Math.max(1, Math.ceil(this.backdropWidth / divisor))
    const height = Math.max(1, Math.ceil(this.backdropHeight / divisor))
    this.ensureTargets(width, height)
    const a = this.blurA
    const b = this.blurB
    if (!a || !b) {
      this.blurReady = false
      return
    }

    gl.disable(gl.BLEND)
    gl.useProgram(this.blur.program)
    gl.bindVertexArray(this.emptyArray)

    // 步长按 σ 摊开：12 对采样也要覆盖 ±3σ，否则大 σ 会被截断成方块
    const stride = Math.max(1, Math.round(sigma / 3))
    // 横：原图 → A（偏移量按原图 texel 算）
    this.blurAxis(a, this.backdrop, this.backdropWidth, this.backdropHeight, 1, 0, sigma, stride)
    // 竖：A → B（这时源已经是降过采样的，σ 与步长同步缩）
    const sigmaInTarget = Math.max(sigma / divisor, 0.5)
    const strideInTarget = Math.max(1, Math.round(sigmaInTarget / 3))
    this.blurAxis(b, a.texture, a.width, a.height, 0, 1, sigmaInTarget, strideInTarget)
    this.blurReady = true

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  private blurAxis(
    target: Target,
    source: WebGLTexture,
    sourceWidth: number,
    sourceHeight: number,
    dx: number,
    dy: number,
    sigma: number,
    stride: number
  ): void {
    const gl = this.gl
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer)
    gl.viewport(0, 0, target.width, target.height)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, source)
    gl.uniform1i(uniform(this.blur, gl, 'uSource'), 0)
    gl.uniform2f(uniform(this.blur, gl, 'uAxis'), dx / sourceWidth, dy / sourceHeight)
    gl.uniform1f(uniform(this.blur, gl, 'uStride'), stride)
    gl.uniform1f(uniform(this.blur, gl, 'uSigma'), sigma)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  private ensureTargets(width: number, height: number): void {
    if (this.blurA && this.blurA.width === width && this.blurA.height === height) return
    this.disposeTarget(this.blurA)
    this.disposeTarget(this.blurB)
    this.blurA = this.createTarget(width, height)
    this.blurB = this.createTarget(width, height)
  }

  private createTarget(width: number, height: number): Target | null {
    const gl = this.gl
    const texture = gl.createTexture()
    if (!texture) return null
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    const framebuffer = gl.createFramebuffer()
    if (!framebuffer) return null
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    return { texture, framebuffer, width, height }
  }

  private disposeTarget(target: Target | null): void {
    if (!target) return
    this.gl.deleteFramebuffer(target.framebuffer)
    this.gl.deleteTexture(target.texture)
  }

  /**
   * 一帧合成。
   * origin 是窗口此刻的位置 + 它所在那块屏的 DIP 矩形：滑入滑出时窗口在动，
   * 但玻璃里的桌面必须「钉」在屏幕上，所以采样原点要用窗口的屏幕坐标现算。
   */
  draw(options: {
    look: GlassLook
    motion: MotionState
    radius: number
    origin: PanelOrigin | null
    opacity?: number
  }): void {
    if (!this.available) return
    const gl = this.gl
    const { look, motion } = options
    const startedDraw = performance.now()
    const live = this.liveAttached

    // 实时档：这一帧有新画面就先上传 + 重跑模糊
    if (this.liveAttached && this.liveDirty) {
      this.liveDirty = false
      this.uploadLive(look.blur)
    }
    if (!this.hasBackdrop) return

    const blurred = this.blurReady ? this.blurB : null
    const texture = blurred ? blurred.texture : this.backdrop

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.useProgram(this.composite.program)
    gl.bindVertexArray(this.emptyArray)

    const u = (name: string): WebGLUniformLocation | null => uniform(this.composite, gl, name)
    // 窗口左上角在这块屏里的 DIP 偏移；没有 origin 就退回抓帧那一刻的位置
    const offsetX = options.origin ? options.origin.x - options.origin.displayX : this.panelX
    const offsetY = options.origin ? options.origin.y - options.origin.displayY : this.panelY

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.uniform1i(u('uBackdrop'), 0)

    gl.uniform2f(u('uSize'), this.cssWidth, this.cssHeight)
    gl.uniform2f(u('uOrigin'), offsetX / this.displayWidth, offsetY / this.displayHeight)
    gl.uniform2f(u('uStep'), 1 / this.displayWidth, 1 / this.displayHeight)
    gl.uniform1f(u('uCorner'), cornerExtent(options.radius, look.cornerExp))
    gl.uniform1f(u('uCornerExp'), look.cornerExp)

    gl.uniform1f(u('uBezel'), look.bezel)
    gl.uniform1f(u('uThickness'), look.thickness)
    gl.uniform1f(u('uIor'), look.ior)
    gl.uniform1f(u('uDisplace'), look.displace)
    gl.uniform1f(u('uDispersion'), look.dispersion * (1 + 0.9 * motion.pulse + 0.3 * motion.breath))
    gl.uniform1f(u('uSaturation'), look.saturation)

    gl.uniform3f(u('uTint'), look.tint[0], look.tint[1], look.tint[2])
    gl.uniform1f(u('uTintAlpha'), look.tintAlpha)
    gl.uniform1f(u('uLegibility'), look.legibility)

    gl.uniform2f(u('uLight'), motion.lightX, motion.lightY)
    gl.uniform4f(u('uSpecular'), look.specular[0], look.specular[1], look.specular[2], look.specular[3])
    gl.uniform2f(u('uSpecularShape'), look.specularShape[0], look.specularShape[1])

    gl.uniform1f(u('uSwell'), motion.swell)
    gl.uniform1f(u('uPulse'), motion.pulse)
    gl.uniform1f(u('uBreath'), motion.breath)
    gl.uniform2f(u('uFlow'), motion.flowX, motion.flowY)
    gl.uniform1f(u('uSpark'), motion.spark)
    gl.uniform1f(u('uSparkY'), motion.sparkPos)
    gl.uniform1f(u('uStretch'), motion.stretch)
    gl.uniform1f(u('uSquash'), motion.squash)
    gl.uniform1f(u('uRimShade'), look.rimShade)
    gl.uniform1f(u('uBgra'), this.bgra)
    gl.uniform1f(u('uOpacity'), options.opacity ?? 1)

    gl.drawArrays(gl.TRIANGLES, 0, 3)
    this.drawCostMs = performance.now() - startedDraw
    if (live) this.lastLiveDrawAt = Date.now()
  }

  /** 清成透明（面板隐藏时用） */
  clear(): void {
    if (!this.available) return
    const gl = this.gl
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
  }

  dispose(): void {
    if (this.disposed) return
    this.releaseFrame()
    this.disposed = true
    const gl = this.gl
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost)
    this.disposeTarget(this.blurA)
    this.disposeTarget(this.blurB)
    this.blurA = null
    this.blurB = null
    gl.deleteTexture(this.backdrop)
    gl.deleteProgram(this.composite.program)
    gl.deleteProgram(this.blur.program)
  }
}
