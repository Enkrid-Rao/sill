/**
 * 液态玻璃的「动」从哪来。
 *
 * 面板本身是死的（窗口滑入滑出、内容滚动），玻璃要活起来只能靠算子里的几个
 * 标量。这里把「什么时候该动、动多大、多久衰减」集中成一个纯函数模块，
 * 渲染器只负责把 MotionState 塞进 uniform。
 *
 * 三条运动线，灵感分别来自两处参考实现：
 *  - 滑入震荡：Spring 积分器，ω_n ≈ 15.8 rad/s、ζ ≈ 0.55（欠阻尼），
 *    参考 AndroidLiquidGlass 的 scaleX/scaleY 用了两个*不同*阻尼比，
 *    两个轴过冲不同步 → 形状会短暂「错切」，读起来是果冻而不是弹簧。
 *  - 滚动视差（`theme.glassScrollFlow`，默认关）：滚动速度灌进一阶衰减的 flow 向量，
 *    背景被内容「拖着」平移一下。**这是刻意的额外效果，不是背景本该有的行为** ——
 *    默认关，只有显式打开才会让背景跟随面板内部滚动。
 *  - 呼吸：极慢正弦（0.11–0.19 Hz），幅度必须小，否则像 bug。
 *
 * 所有状态都是「当前值 + 速度」，update(dt) 只做积分，没有 setTimeout、
 * 没有 requestAnimationFrame —— 帧的节奏由调用方决定。
 */

export interface MotionState {
  /** 滑入进度 0..1，可略过冲；驱动原版 `shift *= t + 7t(1-t)` 的鼓包 */
  swell: number
  /** 冲击量 -1..1.6，滑入 / 点击时被踢一下，欠阻尼回摆 */
  pulse: number
  /** 呼吸 -1..1 */
  breath: number
  /** 液态流向（CSS px）：只在 glassScrollFlow 打开时非零 */
  flowX: number
  flowY: number
  /** 光源方向（单位向量，面板空间 y 朝下） */
  lightX: number
  lightY: number
  /** 滑入时沿边缘掠过的光带强度 0..1 与位置 0..1 */
  spark: number
  sparkPos: number
  /** 采样空间的各向异性拉伸：x 拉、y 压（AndroidLiquidGlass 的 ±20% 手法） */
  stretch: number
  squash: number
}

const TAU = Math.PI * 2

/** 半隐式欧拉弹簧。k 是 ω_n²，zeta 是阻尼比。 */
class Spring {
  value: number
  velocity = 0
  target: number

  constructor(
    value: number,
    private readonly k: number,
    private readonly zeta: number
  ) {
    this.value = value
    this.target = value
  }

  /** dt 必须已经夹过：弹簧对大 dt 很敏感 */
  step(dt: number): void {
    const c = 2 * this.zeta * Math.sqrt(this.k)
    const accel = -this.k * (this.value - this.target) - c * this.velocity
    this.velocity += accel * dt
    this.value += this.velocity * dt
  }

  kick(velocity: number): void {
    this.velocity += velocity
  }
}

/** 一阶低通（光源跟手用，越慢越像湿的） */
class Lag {
  value: number
  target: number
  constructor(value: number) {
    this.value = value
    this.target = value
  }
  step(dt: number, tau: number): void {
    this.value += (this.target - this.value) * (1 - Math.exp(-dt / tau))
  }
}

export interface MotionOptions {
  /** 呼吸周期（秒） */
  breathPeriod?: number
  /** 是否让指针位置驱动光源 */
  pointerLight?: boolean
}

const SHOW_STIFFNESS = 250      // ω_n ≈ 15.8 rad/s
const SHOW_ZETA = 0.6           // 9.5% 过冲
const PULSE_STIFFNESS = 320     // ω_n ≈ 17.9
const PULSE_ZETA = 0.42         // 更弹，回摆两下
const FLOW_DECAY = 9            // flow 每秒衰减到 1/e 的时间倒数

export class GlassMotion {
  private readonly swell = new Spring(0, SHOW_STIFFNESS, SHOW_ZETA)
  private readonly pulse = new Spring(0, PULSE_STIFFNESS, PULSE_ZETA)
  private readonly lightX = new Lag(-0.45)
  private readonly lightY = new Lag(-0.89)
  private flowX = 0
  private flowY = 0
  private spark = 0
  private sparkPos = 0
  private time = 0
  private readonly breathPeriod: number
  private readonly pointerLight: boolean
  /** 采样拉伸：从 pulse 的速度推出来，单独再低通一次免得抖 */
  private stretch = 0
  private squash = 0

  constructor(options: MotionOptions = {}) {
    this.breathPeriod = options.breathPeriod ?? 7.4
    this.pointerLight = options.pointerLight ?? true
  }

  /** 面板开始滑入：鼓包 + 一道掠光。冲击本身留给 onSlide 用真实位移驱动。 */
  onShow(): void {
    this.swell.target = 1
    this.swell.kick(1.6)
    this.pulse.kick(0.8)
    this.spark = 1
    this.sparkPos = 0
  }

  /** 面板收起：只把鼓包收回，不重置冲击（收起的残影留在下一帧之外） */
  onHide(): void {
    this.swell.target = 0
    this.swell.velocity = 0
    this.pulse.target = 0
    this.spark = 0
  }

  /**
   * 窗口被主进程挪了一格（滑入 / 拖宽 / 换停靠边）。
   * delta 是这一格的 CSS px 位移。位移速度作为弹簧的*目标值*，
   * 而不是每格踢一脚 —— 窗口减速时目标自然回落，欠阻尼弹簧就会自己回摆，
   * 这才是「震荡一下并且越摆越小」而不是「被连续推着抖」。
   */
  onSlide(delta: number): void {
    const velocity = Math.abs(delta) * 100
    this.pulse.target = clamp(velocity / 4000, 0, 1.2)
  }

  /**
   * 内容滚动 → 背景视差（**只有 theme.glassScrollFlow 打开时才会被调用**）。
   * dy 是这一次滚动造成的 scrollTop 变化。玻璃被「拽」一下，方向与滚动一致；
   * 夹住量级，否则快速滚动会糊成一片。
   */
  onScroll(dy: number, dx = 0): void {
    const capped = clamp(dy, -160, 160)
    this.flowY = clamp(this.flowY + capped * 0.34, -26, 26)
    this.flowX = clamp(this.flowX + dx * 0.34, -18, 18)
    if (Math.abs(capped) > 2) this.pulse.kick(capped * 0.035)
  }

  /** 指针在面板内的位置（0..1），光源朝它偏 */
  onPointerMove(u: number, v: number): void {
    if (!this.pointerLight) return
    // 光源放在「指针对面」：高光出现在边缘朝向指针的一侧
    this.lightX.target = clamp((0.5 - u) * 1.6, -1, 1)
    this.lightY.target = clamp((0.5 - v) * 1.6, -1, 1)
  }

  /** 指针离开：缓缓回到左上默认光 */
  onPointerLeave(): void {
    this.lightX.target = -0.45
    this.lightY.target = -0.89
  }

  /** 点击 / 键盘触发的轻脉冲（例如换主题、开关组件） */
  tap(strength = 1): void {
    this.pulse.kick(3.2 * strength)
  }

  /** dt 单位秒；内部按 1/240s 子步进，保证低帧率下弹簧不发散 */
  update(dt: number): MotionState {
    const clamped = clamp(dt, 0, 0.1)
    const steps = Math.max(1, Math.ceil(clamped / (1 / 240)))
    const sub = clamped / steps

    for (let i = 0; i < steps; i++) {
      this.swell.step(sub)
      this.pulse.step(sub)
      this.lightX.step(sub, 0.16)
      this.lightY.step(sub, 0.16)
    }

    this.time += clamped

    // 视差 flow 一阶衰减（关掉开关时它本来就是 0）
    const decay = Math.exp(-FLOW_DECAY * clamped)
    this.flowX *= decay
    this.flowY *= decay
    if (Math.abs(this.flowX) < 0.01) this.flowX = 0
    if (Math.abs(this.flowY) < 0.01) this.flowY = 0

    // 掠光沿面板长边往下走，0.42s 走完
    if (this.spark > 0) {
      this.sparkPos = Math.min(1.25, this.sparkPos + clamped / 0.42)
      this.spark = Math.max(0, this.spark - clamped / 0.52)
    }

    // 速度 → 各向异性拉伸（AndroidLiquidGlass 的 0.75 / 0.25 不对称）
    const v = clamp(this.pulse.velocity / 10, -0.42, 0.42)
    const targetStretch = clamp(v * 0.75, -0.16, 0.16)
    const targetSquash = clamp(v * 0.25, -0.06, 0.06)
    this.stretch += (targetStretch - this.stretch) * (1 - Math.exp(-18 * clamped))
    this.squash += (targetSquash - this.squash) * (1 - Math.exp(-18 * clamped))

    const lightLength = Math.hypot(this.lightX.value, this.lightY.value) || 1
    const nx = this.lightX.value / lightLength
    const ny = this.lightY.value / lightLength

    // 呼吸时让光源极慢地绕一圈（±0.13 rad，周期 ~8.7s）：
    // 轮廓上的高光会沿着边缘「走」，这是最便宜也最有效的「活着」信号。
    // 几何上的呼吸幅度必须很小，光可以稍微大一点。
    const drift = 0.13 * Math.sin(this.time * 0.72)
    const cos = Math.cos(drift)
    const sin = Math.sin(drift)

    return {
      swell: clamp(this.swell.value, 0, 1.35),
      pulse: clamp(this.pulse.value, -0.6, 1.6),
      breath: Math.sin((this.time / this.breathPeriod) * TAU),
      flowX: this.flowX,
      flowY: this.flowY,
      lightX: nx * cos - ny * sin,
      lightY: nx * sin + ny * cos,
      spark: this.spark,
      sparkPos: this.sparkPos,
      stretch: this.stretch,
      squash: this.squash
    }
  }

  /** 是否还需要继续画帧（静止后可以降频） */
  get active(): boolean {
    return (
      Math.abs(this.swell.velocity) > 0.02 ||
      Math.abs(this.pulse.value) > 0.004 ||
      Math.abs(this.pulse.velocity) > 0.02 ||
      Math.abs(this.flowX) > 0.05 ||
      Math.abs(this.flowY) > 0.05 ||
      this.spark > 0.001
    )
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
