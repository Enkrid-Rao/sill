# Glass — 液态玻璃升级方案

> 写于 v0.7.0-beta.3。**本文是设计方案，不是进度记录。**
> 进度与「已验证 / 未验证」的真相只在 [`HANDOFF.md`](HANDOFF.md)，不要在本文件里跟踪状态。
> 文中的行号以 v0.7.0-beta.3 为准，改动后请同步核对。
>
> **v0.8 实验版已按本方案落地（方案 B，含 Phase 1 + 2 + 新增的动效层）。**
> 与本文的差异、实测数据、代码位置见 §11；Phase 0 的探针结论在 HANDOFF 的「已实际验证」。
> **v0.8.1 起默认走 §12 的实时档（方案 C）** —— raoxi 的判断是「背景得动，不能冻结」，
> 于是把 Phase 3 提前做了；代价是面板在截图 / 录屏里会消失，`glassMode` 可切回 `frame`。

---

## 0. 摘要

现在的「液态玻璃」准确说是**四层静态打光 + 半透明底**：桌面以全清晰度透进来，只是被压了一层色膜。它读起来像贴膜而不是玻璃，根因不是配色或细节不够，而是 `C1` 这条物理事实——透明 Electron 窗口里的 `backdrop-filter` 拿不到桌面像素。

要达到 EchoMusic-Lyrics-WinIsland 那种效果，唯一的路是**自己拿到桌面像素**，然后在片元着色器里做模糊与折射。

**推荐方案**：`方案 B — 静态帧 + WebGL 折射`。在窗口 `hide()` 之后抓一帧桌面（此时窗口不在 DWM 合成里，抓到的必然不含自己），用 WebGL2 复刻 EchoMusic 的 `liquid.sksl`。零每帧成本、不需要 WDA、面板照常能被截图和远控捕获。代价是背景冻结——而这一点被「折射采样的是模糊图」这个事实大幅稀释。

分四期落地，合计 **5.5 个工作日**（单人、熟悉代码库的估算）。Phase 0 的三个探针是前置条件，不先做会返工。

---

## 1. 问题定义

### 1.1 用户感知

当前面板满足「半透明」，但不满足「玻璃」：

- 背景是清晰的，不是糊的；
- 边缘没有厚度，只有明暗；
- 高光是贴上去的，不随形状或光源变化；
- 与 EchoMusic-Lyrics-WinIsland 并排看，材质差一个层级。

### 1.2 现状解剖

`.rail` 由一层底色 + 五个覆盖层组成（`apps/desktop/src/renderer/src/styles/panel.css:104-220`）：

| 层 | 位置 | 作用 | 评价 |
|---|---|---|---|
| 底色 | `:118-121` | `hsl(--hue var(--tint-s) 7% / var(--glass-alpha))` + 两段渐变 | 唯一的「透明」来源，纯 alpha |
| `.rail__atmo` | `:132-152` | 8 套 blob 几何的颜色网格 | 自己画的假背景 |
| `.rail__grain` | `:155-165` | 640×854 JPEG + `overlay` .24 | 深色底上会提亮暗部成灰雾 |
| `.rail__halo` | `:168-181` | 左上乳白径向 + `screen` | 位置写死 `-4% -8%` |
| `.rail__sheen` | `:206-220` | 斜向白条 + `screen`，38s 漂移 | 贴纸在动，不是光在玻璃里走 |
| `.rail__rim` | `:184-203` | 1px 渐变描边 + `mask-composite` | `linear-gradient(132deg)`，宽面板高光跑偏 |

透明度来源：`applyTheme()` 把 `glassOpacity` 30–100 映射到 `0.28–0.83`（`renderer/src/lib/theme.ts:14`），默认 52 → **0.566**。即桌面上 43% 的像素原样、清晰透入。

`.card`（`panel.css:491-502`）只有 4.5% 白渐变 + 1px 内高光 + 1px 边，和 `.rail` 之间没有构成材质层级。

### 1.3 为什么现有方案只能是「贴膜」

**C1：透明 Electron 窗口里 `backdrop-filter` 拿不到桌面像素。**

Chromium 的 backdrop 只包含自身文档的合成层；DWM 在它外面合成。所以 `backdrop-filter` 在 `.rail` 上只会糊页面内部，既验证不出效果，还白付一层合成开销。

`.privacy` 用 `backdrop-filter: blur(18px)`（`panel.css:808`）是**正确**的，因为它的目的就是糊页面里的 rail。

这条事实决定了：想做出真玻璃，只能自己截桌面。

---

## 2. 参考实现拆解

EchoMusic-Lyrics-WinIsland（Rust + Skia，WinIsland 硬 fork）的玻璃管线是四段：

1. **采集**——WGC / DXGI Desktop Duplication / 放大镜，抓窗口下方的桌面；
2. **排除自己**——`SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)`，让窗口从采集里消失，否则会拍到自己的上一帧；
3. **模糊**——降采样（`ceil(σ/4)`，clamp 2–24）+ 12 tap 可分离高斯（`frost.sksl`）；
4. **折射**——SDF 推法线 → Snell 折射 → 屏幕空间偏移采样 → 三通道色散 → 双侧高光（`liquid.sksl`，176 行）。

它的核心技巧（`src/utils/liquid.sksl`）：

```glsl
float band  = clamp(inward / bezelWidth, 0.0, 1.0);
float u     = 1.0 - band;
float slope = 2.0*u2*u / sqrt(max(1.0 - u2*u2, kEpsilon));  // 高度剖面 z=√(1−u⁴) 的导数
float3 normal = normalize(float3(g * slope, 1.0));           // g 是 SDF 的 2D 梯度
float3 ray = refract(float3(0.0, 0.0, -1.0), normal, 1.0 / 1.45);
float2 shift = ray.xy / -ray.z * (thickness + inward * 0.5) * displacementFactor;
```

**不建模任何 3D**，全部从 2D 距离场推出来。这是它可以被移植到任何片元着色器语言的原因。

关键：第 4 步采样的是**第 3 步模糊之后的图**，不是原始桌面。这一点直接决定了本方案的取舍（见 §6.1）。

---

## 3. 目标与验收

| 编号 | 目标 | 验收方式 |
|---|---|---|
| G1 | `.rail` 从「贴膜」变成「玻璃片」：背景真模糊 + 边缘厚度与弯折 + 方向性高光 | 与 EchoMusic 截图并排，非专业用户分不出材质差异 |
| G2 | 内部组件零改动 | `widgets/` 与 `sill-components` 各包一行不改；`.card` 选择器不变 |
| G3 | 不破坏现有交互 | 滑入 240ms 不掉帧；空闲 CPU 增量 < 2%；不新增常驻进程 |
| G4 | 主题系统继续成立 | `--hue / --tint-s / --accent-h / --glass-alpha` 仍然驱动玻璃 |

---

## 4. 约束

### 4.1 硬约束

| 编号 | 约束 | 出处 | 影响 |
|---|---|---|---|
| C1 | 透明窗口里 `backdrop-filter` 拿不到桌面像素 | 平台事实 | 排除所有纯 CSS 方案 |
| C2 | 窗口用 `setContentBounds` 每帧移动 | `main/panel.ts:19`（`TICK_MS = 10`）、`:107-124` | 滑入的 240ms 内不能做重活 |
| C3 | `transparent / alwaysOnTop / frame:false / roundedCorners:false` 不可改 | `main/panel.ts:130-152` | 不能靠改窗口类型换材料 |
| C4 | 要让玻璃透视，就得让窗口对采集不可见 | 平台事实 | 实时方案必然牺牲截图可见性 |
| C5 | DEVPLAN §5.4：「不提供 `backdrop-filter`」 | `DEVPLAN.md:336` | 需显式修订，不能绕过 |
| C6 | `setBackgroundMaterial` 仅 Windows 11 22H2+ | `electron.d.ts:3691` | 方案 A 的适用范围受限 |
| C7 | 不引入原生编译链 | 项目定位 | 排除方案 D |

### 4.2 与 DEVPLAN §5.4 的关系

§5.4 的原话是：

> **硬约束**：token 里不提供 `backdrop-filter`。框架只给「预烘焙玻璃」这一种玻璃——让唯一可用的玻璃同时是最便宜的玻璃。

这条约束的**真实理由**是「不想每帧采样桌面」。它写于 v0.5.4，当时面板还不是 alwaysOnTop + 100fps 滑入。

本方案**不违反字面约束**（不用 `backdrop-filter`），但确实扩展了实现手段，因此需要显式修订而不是默认通过：

- 在 §5.4 追加一段 `v0.8 修订`，说明改为「静态帧采样 + WebGL 折射」，并写清成本模型（零每帧采样）；
- 修订前，本文件视为提案，不视为已生效的规范。

---

## 5. 可选方案

### 5.1 对比

| | A. `setBackgroundMaterial('acrylic')` | **B. 静态帧 + WebGL 折射** | C. 实时流 + WebGL 折射 | D. 原生 addon |
|---|---|---|---|---|
| 真桌面模糊 | ✅ | ✅ | ✅ | ✅ |
| 边缘折射 / 色散 | ❌ 完全没有 | ✅ 完整 | ✅ 完整 | ✅ |
| 每帧成本 | 0 | **0** | 30fps 采集 + 3 pass | 同 C，略低 |
| 截图 / 远控可见 | ✅ | ✅ | ❌ 必须 WDA | ❌ |
| 与 `transparent:true` | ⚠️ 可能互斥 | ✅ | ✅ | ✅ |
| 主题可控性 | 低 | 全 | 全 | 全 |
| 工程量 | 5 行 | ~1 周 | ~1.5 周 | 3 周+ |
| 主要风险 | 深色玻璃美学被系统 tint 冲掉 | 背景冻结 | 隐身 + 持续开销 | 打包 / 签名 / 双窗口同步 |

### 5.2 逐条评估

**A · 系统亚克力**

`win.setBackgroundMaterial('acrylic')`（`electron.d.ts:3695`）在 Windows 11 22H2+ 可用，零成本拿到真桌面模糊。

但它给的是系统默认的浅色亚克力，而 Sill 是 `hsl(h 34% 7% / .566)` 的深色玻璃。两者叠加会变成灰白脏片，`--hue` 直接失效。另外 `transparent: true` 的窗口在 Windows 上是分层窗口（layered），DWM 材质很可能根本不生效——这一点必须先探针验证。

**结论：只当 Phase 0 的探针，不作为终态。**

**B · 静态帧 + WebGL 折射 —— 推荐**

见 §6。

**C · 实时流**

`setDisplayMediaRequestHandler` + `getDisplayMedia`（`electron.d.ts:14313`）能拿到实时桌面流，Windows 上 Chromium 内部走 WGC，和 EchoMusic 的 `liquid_glass_wgc` 是同一后端。

它最真，但必须 `setContentProtection(true)`，面板从此从截图和远控里消失（正是用户上一轮在 EchoMusic 上观察到的现象）；且持续 30fps 采集，与 C2 的 100fps 滑窗动画叠加。

**结论：降级为 Phase 3 的可选开关。**

**D · 原生 addon**

像素级一致的唯一路，但要引入 C++/Rust 构建链、双窗口 z-order 同步、DPI 对齐、签名流程，收益只是最后 10% 的观感。

**结论：排除。**

---

## 6. 推荐方案：B

### 6.1 为什么静态帧够用

这是整个方案成立的关键论证，值得单独说清。

EchoMusic 的折射采样的是 **frost 模糊之后**的背板（`liquid.sksl:72-74`，`background()` 取的就是模糊图），不是原始桌面。默认 σ=6，`blur_scale` 在 2–24 之间。

**对一片 σ 达到两位数的色雾来说，「三秒前的」和「现在的」在绝大多数场景下无法区分。**

会露馅的只有一种情况：背景存在高对比运动（播视频、滚动网页），**并且**用户盯着玻璃边缘看。而侧边廊的主流程是「热键唤出 → 看一眼 → Esc 收起」，这个窗口期里没人会去看背景。

换句话说：模糊本身掩盖了静态性。B 拿到 C 的约 90% 观感，省掉 C 的全部代价。

### 6.2 抓帧时机：为什么不需要 WDA

`hidePanel()` 的收尾是 `win.hide()`（`main/panel.ts:319-321`）。窗口隐藏后不参与 DWM 合成，`desktopCapturer` 抓到的画面必然不含自己。

因此：

- **不需要 `setContentProtection`**，面板照常能被截图、录屏、远控捕获；
- 不产生「自捕获反馈」，不需要任何排除标志；
- 抓到的图就是「上一次收起时的桌面」，下次唤出直接用。

相比 EchoMusic 牺牲截图可见性的做法，这是本方案的一个**实质优势**，不是妥协。

### 6.3 分层结构

```text
Electron 窗口（transparent, 384×800）
├─ <canvas class="rail__glass">   新增，z-index 0
│    ├─ 纹理：hide() 后抓的桌面快照（1/3 分辨率）
│    ├─ pass 1/2：降采样 + 可分离高斯
│    └─ pass 3：SDF 折射 + 色散 + 双侧高光
├─ .rail__halo  保留（z-index 1）
├─ .rail__sheen 保留（z-index 1）
├─ .rail__rim   保留（z-index 20）
└─ .rail__scroll 现有内容，不动
```

退役两层：

- `.rail__atmo` —— 职责被真背景取代；
- `.rail__grain` —— 同上。矢量噪声如需保留，改用 `sill-components` 里已有的 `grain.svg` 平铺，不再用 JPEG 拉伸。

`.rail` 的 `background` 改为 `transparent`，外阴影（`box-shadow` 前两条）保留，内高光交给 shader 的 specular。

### 6.4 主进程 → 渲染进程

```text
hidePanel() ──slide out 160ms──▶ win.hide()
                                    │
                                    ▼
                          desktopCapturer.getSources
                          （thumbnailSize = dock 区域 × 1/3）
                                    │
                                    ▼
                          crop → scaleFactor 换算 → raw BGRA
                                    │
                                    ▼
              IPC 'panel:backdrop' { pixels, width, height, origin, scale, at }
                                    │
                                    ▼
                      renderer 缓存（LRU，保留上一次成功帧）
                                    │
                                    ▼
                    showPanel() 时 texImage2D 上传 → 三 pass 渲染
```

要点：

- 传 **raw BGRA** 而不是 PNG，省一次解码；`texImage2D` 直接吃 `Uint8Array`；
- 抓图分辨率 **1/3** 足够（128×267 量级），因为最终要模糊；
- 抓帧失败**不阻塞滑入**，用 LRU 里的旧帧；
- 从没有过成功帧时退回现有贴膜（`glassMode = 'film'`）。

---

## 7. 实施

### 7.0 总览

| 阶段 | 内容 | 估时 | 出口条件 |
|---|---|---|---|
| Phase 0 | 三个探针 | 0.5 天 | 决定 A/B 是否可行 |
| Phase 1 | 玻璃片（模糊 + tint） | 2 天 | 背景真的糊了，主题变量仍有效 |
| Phase 1.5 | 顺手修的四个小病灶 | 0.5 天 | 与 Phase 1 一起过评审 |
| Phase 2 | 液态（折射 + 色散 + 高光） | 3 天 | 与 EchoMusic 并排可分不出材质 |
| Phase 3 | 实时流（可选） | 2 天 | 开关可开可关，关掉行为不变 |

引入一个设置项贯穿全程：

```ts
glassMode: 'film' | 'frame' | 'liquid'   // 默认 'film'
```

**默认值不改，直到 Phase 2 验收通过。** 每个阶段都能一键回退。

---

### 7.1 Phase 0 · 探针（0.5 天）

三个独立脚本，都在临时分支或 `scripts/probe/`，不碰主路径。

**P1 · 系统亚克力是否与透明窗口互斥**

```ts
const w = new BrowserWindow({ transparent: true, frame: false, backgroundColor: '#00000000' })
w.setBackgroundMaterial('acrylic')
```

判据：窗口区域是否出现桌面模糊。

- 生效 → 记录，方案 A 仍不作为终态（美学冲突），但可作为 `glassMode` 的第四个降级档；
- 不生效 → 直接砍掉 A，不再讨论。

**P2 · 隐藏后抓屏是否干净、耗时多少**

`win.hide()` → `desktopCapturer.getSources({ types: ['screen'], thumbnailSize })` → 检查图里有没有面板残影，记录 `performance.now()` 差值。

判据：

- 耗时 < 300ms 且图干净 → B 可行，按 §6.4 实现；
- 300–600ms → 加「启动时预抓 + 每次收起后刷新」两段式；
- \> 600ms 或图不干净 → B 降级，转 C 或停在 A。

**P3 · WebGL2 可用性与上传耗时**

渲染进程建 canvas → `getContext('webgl2')` → 上传一张 128×267 的 `Uint8Array` → 记录 `texImage2D` + `drawArrays` 耗时。

判据：上下文可用且单帧 < 5ms → Phase 1 可行。

**Phase 0 的输出**：一份结论写进 `HANDOFF.md` 的「已实际验证」，不要写在本文里。

---

### 7.2 Phase 1 · 玻璃片（2 天）

目标：背景真的被模糊，但**先不做折射**。这一步就能消掉「贴膜感」的大部分。

**改动清单**

| 文件 | 改动 |
|---|---|
| `renderer/src/App.tsx:530` 前 | 插入 `<canvas className="rail__glass" aria-hidden="true" />` |
| `styles/panel.css:118-121` | `.rail` 的 `background` 改 `transparent`，删掉三层渐变 |
| `styles/panel.css:132-165` | `.rail__atmo` / `.rail__grain` 规则保留但默认不渲染（DOM 里移除） |
| 新增 `renderer/src/lib/glass.ts` | WebGL2 初始化、纹理上传、三 pass 调度、`webglcontextlost` 重建 |
| 新增 `renderer/src/lib/glass.frag` | 见附录 A |
| `main/panel.ts` | 新增 `captureBackdrop()`，在 `win.hide()` 之后调用 |
| `preload` | 暴露 `onBackdrop(cb)` |
| `shared/theme.ts` | 新增 `glassMode`，`normalizeTheme` 兜底 `'film'` |
| `renderer/src/lib/theme.ts` | 把 7 个 token 转成 shader uniforms |

**uniform 约定**

| uniform | 来源 | 说明 |
|---|---|---|
| `uBackdrop` | 抓帧纹理 | `sampler2D` |
| `uOrigin` | 抓帧裁剪偏移 | 窗口相对截图的像素偏移 |
| `uScale` | 抓帧缩放比 | 1/3 → 3.0 |
| `uSize` | 面板像素尺寸 | × `devicePixelRatio` |
| `uRadius` | `--radius` × dpr | 34px |
| `uCornerExp` | 2.5 | squircle |
| `uTint` | `hsl(--hue, --tint-s, 7%)` + `--glass-alpha` | 保持主题语义 |
| `uBlur` | `--glass-alpha` 之外单独一个设置项 | σ |
| `uLight` | `pointermove` 推导 | 归一化方向 |
| `uSpecular` | `(0.75, 0.38, 0.8, 0.9)` | EchoMusic 默认值 |

**验收**

- 花壁纸下背景明显糊了，文字不再靠 `text-shadow` 硬扛；
- 换 Ember / Dusk 主题，玻璃底色跟着变；
- 滑入 240ms 内无白闪、无掉帧（DevTools Performance 面板确认）；
- 面板隐藏时 GPU 占用归零（任务管理器）。

**回滚**：`glassMode = 'film'`。

---

### 7.3 Phase 1.5 · 顺手修的四个小病灶（0.5 天）

不依赖 WebGL，纯 CSS，可以和 Phase 1 并行或单独上。

1. **`.rail__rim` 换 `conic-gradient`**（`panel.css:190-197`）
   `linear-gradient(132deg)` 的亮带横穿整个盒子，面板越宽高光越飘。换成按角度分布的 `conic-gradient(from 132deg at 50% 50%, …)`，宽窄都成立。`padding:1px` + `mask-composite` 结构不用动。

2. **`corner-shape: squircle`**
   `--radius: 34px` 这么大的圆角用正圆弧显廉价。与 EchoMusic 的 SDF 指数 2.5 同源。用 `@supports (corner-shape: squircle)` 包一层；着色器的 `uCornerExp` 与之对齐。

3. **修掉 `:root` 兜底值与 `DEFAULT_THEME` 的偏差**
   `panel.css:44-50` 写的是 `--glass-alpha: 0.731 / --atmo-k: 0.92 / --halo-k: 0.7`，而 `DEFAULT_THEME` 对应 0.566 / 0 / 0.55。`applyTheme` 在 React 挂载后的 hook 里才跑（`lib/useSillSettings.ts:182`），所以**冷启动首帧会闪一下更亮、还带彩雾的玻璃**。对齐即可。

4. **收窄 `text-shadow`**
   `.rail` 上的全局 `text-shadow: 0 1px 2px rgba(0,0,0,.32)`（`:128`）是在还「玻璃不够暗」的债。Phase 1 之后可以移进 `.rail__scroll`，甚至只在浅色主题下保留。

---

### 7.4 Phase 2 · 液态（3 天）

移植 `liquid.sksl` 的完整形变链。附录 A 是逐段对照。

**顺序建议**（每步单独可见，便于中途叫停）

1. `roundRect` SDF + fill 掩码 → 形状对了；
2. `bezelWidth / slope / normal` → 边缘有厚度了；
3. `refract` + 偏移采样 → 弯折出来了；
4. 三通道 `spread` → 彩边；
5. specular 双侧 + `band²` 衰减 → 玻璃感成立；
6. 4×RGSS 只在边缘 → 曲率处锯齿消失。

**设置页新增三个滑杆**：折射强度、色散强度、模糊强度。写入 `theme`，与现有预设共存。

**验收**：与 EchoMusic 并排截图，边缘位移方向和彩边位置一致；`--hue` 改到任意值，玻璃底色与高光都不跑偏。

**回滚**：`glassMode = 'frame'`（保留模糊，关掉折射）。

---

### 7.5 Phase 3 · 实时流（2 天，可无限延后）

只有在 Phase 2 验收后仍觉得「背景冻结」不可接受时才做。

- `session.setDisplayMediaRequestHandler` 选当前显示器，不要系统 picker；
- `getDisplayMedia({ video: { width: 960, height: 540, frameRate: 30 } })`；
- `MediaStreamTrackProcessor` 取 `VideoFrame` 直接 `texImage2D`，避免每帧 RGB 回读；
- 采样 UV 减去窗口位移：`uv -= (uWin - uCap) / uCapSize`；
- `panel:state === false` 时 `track.stop()`；
- **必须** `win.setContentProtection(true)`，并在设置里明说「面板将从截图与录屏中消失」。

这一档与方案 B 互斥，用 `glassMode = 'live'` 区分，默认关。

---

## 8. 时间与优先级

| 优先级 | 阶段 | 估时 | 依赖 | 决策价值 |
|---|---|---|---|---|
| P0 | Phase 0 探针 | 0.5 天 | 无 | 决定架构，不先做会返工 |
| P1 | Phase 1 玻璃片 | 2 天 | P0 的 P2/P3 通过 | 从「贴膜」到「玻璃」，用户可感知 |
| P1 | Phase 1.5 小病灶 | 0.5 天 | 无 | 极低成本，可与 P1 并行 |
| P2 | Phase 2 液态 | 3 天 | Phase 1 验收 | 「液态」的部分，最抓眼 |
| P3 | Phase 3 实时 | 2 天 | Phase 2 验收 | 锦上添花 |

合计 **5.5 个工作日**（不含 Phase 3）。

**这是估算，不是承诺。** 以下情况需要加时：

- P2 探针发现抓屏耗时 > 300ms → Phase 1 加 0.5 天做两段式缓存；
- P1 探针发现亚克力在透明窗口里可用但需调参 → 不追加，直接按 B 走。

---

## 9. 风险与应对

| 风险 | 概率 | 影响 | 应对 |
|---|---|---|---|
| 抓屏返回黑图（HDR / 独显 / 远控环境） | 中 | Phase 1 不可用 | 三态降级：静态帧 → 现有贴膜 → 纯色底，永不白屏 |
| DPI / 多屏裁剪错位 | 高 | 背景错位，一眼假 | 用 `screen.getDisplayNearestPoint` 的 `scaleFactor` 换算；补 vitest 单测 |
| WebGL 上下文丢失 | 中 | 玻璃变黑 | 监听 `webglcontextlost` 重建；连续失败 2 次挂回贴膜 |
| 滑入首帧未就绪闪烁 | 高 | 观感倒退 | 预渲染到 FBO；`data-ready` 前保留旧层；`panel:state=true` 先播旧层 |
| 抓帧异步，唤出时还没有图 | 中 | 首次唤出空白 | LRU 保留上一次成功帧；失败不阻塞滑入 |
| 与系统亚克力的美学冲突（方案 A） | 高 | 深色玻璃失效 | 不采用 A 作为终态 |
| `corner-shape` 不被支持 | 低 | 圆角退回正圆弧 | `@supports` 包一层， shader 的 `uCornerExp` 同步降为 2.0 |
| 文档债：§5.4 与新实现矛盾 | 确定 | 后来的人以为违反约束 | 与代码同 PR 修订 DEVPLAN §5.4 |
| 设置项膨胀 | 中 | 设置页难维护 | 三个滑杆合并成一组「玻璃」，默认值即当前观感 |

---

## 10. 不做什么

- **不改** `transparent / alwaysOnTop / frame:false / roundedCorners:false`——动了会破现有无边框与自绘圆角；
- **不用** `backdrop-filter`——C1 决定它在这里无效；
- **不写**原生 addon——方案 D 的成本与收益不匹配；
- **不改** `.card` 与 widget API——G2 是硬要求；
- **不在** 滑入动画期间做任何每帧采样——C2。

---

## 附录 A · 着色器移植对照（SkSL → GLSL ES 3.0）

| `liquid.sksl` | GLSL ES 3.0 | 备注 |
|---|---|---|
| `uniform shader backdrop;` | `uniform sampler2D uBackdrop;` | |
| `backdrop.eval(p).rgb` | `texture(uBackdrop, p).rgb` | |
| `float2 / float3 / float4` | `vec2 / vec3 / vec4` | 机械替换 |
| `half4` | `vec4` | SkSL 的 half 精度提示在 GLSL 里无对应 |
| `half4 main(float2 p)` | `out vec4 fragColor; void main()` | |
| `out float2 g`（函数出参） | `out vec2 g` | GLSL ES 3.0 支持 |
| `pow(m, float2(c.y - 1.0))` | `pow(m, vec2(uCornerExp - 1.0))` | |
| `refract(I, N, eta)` | 同名同义 | |
| `RuntimeEffect::make_shader` | 普通 program + uniform | 不需要运行时编译 |
| `float3(…), half3(…)` | `vec3(…)` | |

**不需要移植的部分**：`shape1 / corner1 / smoothing / morphDispersion / progress`。那些是「迷你态与展开态之间形状融合」用的，Sill 的面板不做形状融合，传 `shape1.z = 0` 让 `scene()` 走单形状分支即可。

**需要新增的部分**：`uSize`、`uRadius`、`uCornerExp`（CSS 形状）、`uOrigin`、`uScale`（抓帧对齐）。EchoMusic 用画布坐标直接当窗口坐标，我们的 canvas 要自己换算。

---

## 附录 B · 代码位置索引

| 用途 | 位置 |
|---|---|
| `.rail` 五层覆盖 | `renderer/src/App.tsx:525-534` |
| 玻璃 CSS | `renderer/src/styles/panel.css:104-220` |
| 8 套氛围配方 | `renderer/src/styles/panel.css:288-355` |
| 卡片样式 | `renderer/src/styles/panel.css:491-502` |
| 主题 → CSS 变量 | `renderer/src/lib/theme.ts:7-19` |
| 主题默认值与预设 | `shared/theme.ts:48-98` |
| 面板窗口参数 | `main/panel.ts:126-175` |
| 滑入 / 滑出动画 | `main/panel.ts:107-124` |
| 收起与 `win.hide()` | `main/panel.ts:305-325` |
| CSP | `renderer/index.html:11-12` |

参考实现（EchoMusic-Lyrics-WinIsland）：

| 用途 | 位置 |
|---|---|
| 折射着色器 | `src/utils/liquid.sksl` |
| 模糊着色器 | `src/utils/frost.sksl` |
| 材质参数 | `src/utils/liquid_glass.rs:216-271` |
| WDA 排除 | `src/utils/liquid_glass.rs:67-80` |
| 合成交换链 | `src/gpu/target.rs` |

---

## 附录 C · 待决问题

以下是本文没有拍板、需要在 Phase 0 之后决定的事项：

1. **`glassMode` 的默认值**——Phase 2 验收通过后是否直接改默认，还是先灰度？
2. **抓帧的刷新策略**——只在收起后刷，还是加一个「每隔 N 分钟、面板不可见时刷」的低频任务？
3. **设置的暴露粒度**——三个滑杆直接给用户，还是先只给「玻璃强度」一个，其余固定？
4. **`sill-components` 的文档**——组件规范 `docs/design.md` 里要不要加一句「宿主玻璃可能是不透明的，不要假设透出壁纸」？现阶段组件都是自带深色卡片，应该不受影响，但要确认。

---

## 11. v0.8 实验版：实际落地的样子

这一节记录**代码里现在是什么**，以及和上面方案不一致的地方。行号以 v0.8 为准。

### 11.1 和方案的差异

| 项 | 方案 | 实际 | 为什么 |
|---|---|---|---|
| 抓帧范围 | dock 区域 × 1/3 | **整块屏**（含全部窗口） × 1/2 DIP | 整屏不必算裁剪偏移，滑入时玻璃里的桌面靠 `uOrigin` 补偿位移就自动对；1/2 而不是 1/3 是为了让折射位移（最大 ~27 CSS px）还有细节可推 |
| 模糊 | 独立三 pass，每次唤出重跑 | 换帧时跑一次横 + 竖两 pass，结果留到下一次唤出 | 每帧只剩一次合成 pass；面板高度 1009px 时一次模糊约 2–4ms，落在「面板还在屏幕外」的那 240ms 里 |
| 采样分辨率 | 抓帧 1/3 → 纹理 | 抓帧 1/2 DIP（1707×1067 屏 → 854×534），模糊在同一分辨率上做 | 与上一条一致；IPC 单帧 ~1.8 MB，只在收起后发生 |
| 背景 | 冻结一帧 | 同方案（Phase 3 未做） | 保持「面板能被截图 / 远控捕获」 |
| 动效 | 方案里没有 | **新增一整层**（见 11.3） | 本轮需求：呼吸感 + 滑入震荡 + 强动感 |

### 11.2 Phase 0 实测（详见 HANDOFF）

- `desktopCapturer.getSources` 在 `win.hide()` **之后**抓到的图干净（品红窗口区域占比 0.03%），
  耗时 **~1.16s**（窗口可见时 0.30–0.38s）。超标 4 倍，但因为抓帧只喂「下一次唤出」，不阻塞任何东西。
- `setContentProtection(true)`（WDA_EXCLUDEFROMCAPTURE）确实能把窗口从采集里排除（占比 0.04%），
  所以 Phase 3 的实时档在技术上可行——但它会让面板从截图/录屏里消失，本轮不用。
- WebGL2 可用（ANGLE D3D11 / RTX 4060），`MAX_TEXTURE_SIZE` 16384，`EXT_color_buffer_float` 有；
  854×534 BGRA 上传 + 首帧 draw ≈ 2ms。

### 11.3 动效层（方案外的新增）

原方案只有 `progress` 一个时间量，而 EchoMusic 把它**硬编码成 1.0**（它没有融合动画）。
本轮把「活起来」单独抽成一层，全部是 uniform 动画，不增加任何采样成本：

| 量 | 驱动 | 观感 |
|---|---|---|
| `uSwell` | 弹簧 0→1，ω_n≈15.8、ζ=0.6 | 滑入时折射位移按原版 `t + 7t(1−t)` 鼓到 2.29×，再落回 1× |
| `uPulse` | 由**窗口真实位移速度**当目标值的欠阻尼弹簧（ζ=0.42） | 滑入那一下边缘厚度 / 色散 / 高光一起涨，然后回摆两三下 —— 「震荡」 |
| `uBreath` | 0.135 Hz 正弦 | 斜面宽度 ±5%、色散 ±30%、高光 ±10% |
| 光源漂移 | ±0.13 rad / ~8.7s 绕圈 | 轮廓上的高光沿边缘慢慢走，静止时最有效的「活着」信号 |
| `uFlow` | 内容滚动速度 → 一阶衰减 | **默认关**（`theme.glassScrollFlow`）。打开后背景被内容「拖着流」一下，越靠边越明显；关掉时背景只钉在桌面像素上，跟滚动位置无关 |
| `uSpark` | 滑入时沿长边掠过 | 一道白光从上到下扫过边缘 |
| `uStretch/uSquash` | 从 `uPulse` 的速度推出来（±16% / ±6%，两轴不对称） | 采样空间被挤一下，读起来像果冻（手法取自 AndroidLiquidGlass 的 0.75/0.25 不对称系数） |

幅度与开关的对应关系见 11.3.1（v0.8.3 起三项各自独立）。

### 11.3.1 三个开关各管一件事（v0.8.3 修）

原来是「`glassMotion` 一个倍率乘在所有动效上」，于是：

- 把「呼吸感」拉到 0 会连滚动视差、滑入抖动一起掐掉；
- **滚动视差默认是开的**，还叠在这个倍率里 —— 表现就是「面板一滚，背景跟着平移」，
  而背景本该钉在桌面像素上（raoxi 反馈的就是这个）。

现在拆成三条独立通路，互不牵连，且**都默认关**（除呼吸）：

| 设置项 | 管什么 | 默认 |
|---|---|---|
| `glassMotion`（呼吸感 0–200%） | 只缩放 `uBreath` | 100%（开） |
| `glassWobble`（滑入震荡） | `uPulse` 一族：斜面鼓起 / 色散尖峰 / 高光爆 / 采样挤压 | 关 |
| `glassScrollFlow`（滚动视差） | `uFlow`：背景随滚动平移 | **关** |

`prefers-reduced-motion` 仍然一键全灭。渲染循环的唤醒也因此分开：呼吸常驻，
滑动冲击 / 滚动视差 / 新视频帧各自 `startLoop()` 把自己叫醒，静止后一样停画。

### 11.4 代码位置

| 用途 | 位置 |
|---|---|
| 抓帧 → IPC | `apps/desktop/src/main/glass.ts` |
| 抓帧时机（`hide()` 之后 / 启动时） | `apps/desktop/src/main/panel.ts`（`refreshBackdrop`） |
| 窗口位置流（让玻璃里的桌面留在原地） | `apps/desktop/src/main/panel.ts`（`notifyOrigin`，随滑入 ticker 推） |
| 折射 / 模糊着色器 | `apps/desktop/src/renderer/src/lib/glass/glass.frag.glsl`、`blur.frag.glsl`、`glass.vert.glsl` |
| WebGL2 渲染器 | `apps/desktop/src/renderer/src/lib/glass/renderer.ts` |
| 弹簧 / 呼吸 / 流向 | `apps/desktop/src/renderer/src/lib/glass/motion.ts` |
| React 挂载与降级 | `apps/desktop/src/renderer/src/lib/glass/useLiquidGlass.ts` |
| 主题字段 | `apps/desktop/src/shared/theme.ts`（`glassMode` / `glassBlur` / `glassRefraction` / `glassDispersion` / `glassMotion`） |
| CSS 接管 | `apps/desktop/src/renderer/src/styles/panel.css`（`.rail[data-glass='liquid']`） |
| Phase 0 探针脚本 | `scripts/probe/glass-probe.cjs` |
| 可复现截图用假桌面 | `scripts/probe/desktop-mock.html` + `make-desktop-mock.mjs` |

### 11.5 已知的不足

1. **背景冻结**（方案已接受）：快速收起-唤出时用的是上一帧；桌面在面板打开期间变化不会被反映。
2. **折射的可见度取决于背景**：平滑壁纸上几乎看不出弯折，只有高对比内容（文字、窗口边框）在边缘时才明显。
   这是材料本身的性质，不是 bug；想更「液态」只能加 displacement，代价是边缘开始失真。
3. **抓帧延迟 1.16s**：首次启动后立刻按热键可能还没有帧，此时退回贴膜（不会白屏）。
4. **每帧一次全屏 pass**：静止时 30fps。`glassMotion = 0` 可让它彻底停画。
5. **软件渲染 / 无独显的虚拟机**（含部分远控会话）可能拿不到 WebGL2 → 自动退回贴膜。

---

## 12. v0.8.1：实时档（原 Phase 3，提前做了）

raoxi 的判据很直接：**背景必须动**。静态帧再怎么糊，桌面在动（播放器、滚动网页、
动态壁纸）的时候一眼就穿帮。所以 `glassMode` 变成三档，默认 `live`：

| 档位 | 像素来源 | 背景 | 面板会被截图拍到 | 每帧采样 |
|---|---|---|---|---|
| `live` | `getDisplayMedia` 持续屏幕流 | **会动** | ❌ 不会（WDA） | 有 |
| `frame` | `hide()` 后抓一帧 | 冻结在打开前 | ✅ 会 | 无 |
| `film` | 没有像素，四层静态贴膜 | 清晰透桌面 | ✅ 会 | 无 |

### 12.1 链路

```text
main: session.setDisplayMediaRequestHandler
        └─ 校验 request.frame 属于面板的 webContents（组件是同一 session 的 webview，必须挡）
        └─ 选面板所在那块屏的 DesktopCapturerSource
renderer: navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 } })
        └─ <video muted playsinline> 挂到 DOM（1px + opacity 0，不能用 display:none）
        └─ requestVideoFrameCallback → renderer.markLiveFrame() → 下一帧 draw() 里：
             texImage2D(video) → 两遍高斯 → 合成
```

### 12.2 必须的代价：WDA

`win.setContentProtection(true)`（= `WDA_EXCLUDEFROMCAPTURE`）把自己从采集里摘掉，
否则屏幕流里会看到面板的上一帧，形成反馈。**副作用是面板从此不出现在截图 / 录屏 / 远控里。**

- 只在 `live` 档开着；切回 `frame` / `film` 立刻关掉；
- 面板隐藏时 WDA 仍在，但窗口本来就不在画面里，**没有实际影响**；
- `webContents.capturePage()` 不受影响 —— 所以自检、Playwright 截图仍然可用（本仓库的验证链路全靠它）。

### 12.3 实测（`scripts/probe/live-probe.cjs`，RTX 4060 / 2560×1600 / dpr 1.5）

| 项 | 结果 |
|---|---|
| 流规格 | 2560×1600 @ ≤30fps，`displaySurface: monitor` |
| `texImage2D(video)` | 中位 **0.1 ms**，最差 1.2 ms（GPU 内部拷贝，不过 CPU） |
| `MediaStreamTrackProcessor` | 可用（没用上，`<video>` + rVFC 更省事） |
| WDA 排除 | 标记窗口在采集里的占比：开 **0**，关 12.9% |
| 逐帧合成成本 | `draw()` 的 CPU 提交 **0.35 ms**（含上传 + 两遍模糊 + 合成） |
| 模糊降采样 | 实时档输出到 1/4（2560×1600 → 640×400），代价 ÷16，糊完看不出差别 |

背景真的在动的证据：在面板底下放一块 60fps 变色的窗口，隔 700ms 截两张，
面板内部 **80% 像素变化、最大差值 144**；两张并排见
[live-motion.png](media/glass/live-motion.png)。

### 12.4 已知的坑

1. **`data:` URL 不是安全上下文** —— `navigator.mediaDevices` 直接是 `undefined`，
   所以探针页面必须落盘再用 `loadFile` 打开。dev 的 `http://localhost` 与打包的 `file://` 都没问题。
2. **取源必须在 handler 里做**：`callback({ video: source })` 只接受 `DesktopCapturerSource`；
   传错对象会得到 `NotSupportedError`，表现出来的样子和「没装 handler」一样。
3. **组件不能拿屏幕**：`request.frame` 若不是面板自己的 webContents 就 `callback({})` 拒绝，
   否则任意组件一句 `getDisplayMedia()` 就能把整块屏录走。
4. 用户从系统那边点「停止共享」→ track `ended` → 自动退回静态帧，不黑屏。
5. 换到另一块屏（多显示器）需要重开面板才会重新取源。

### 12.4.1 静态帧档的「预滚」（v0.8.2 修）

原本静态帧是**收起之后**抓一张，于是它永远是「上一次收起那一刻的桌面」：
收起期间换了窗口、翻了页，再唤出还是旧画面（用户报的「永远是上一个画面」）。

现在 frame 档在**隐藏期间**挂一路 6fps 的屏幕流（`getDisplayMedia` → MSTP），
每帧只做 `texImage2D` + 模糊、**不合成**（窗口不可见，画了也没人看）；唤出时手上
已经是最新桌面，唤出后立刻停流，材质语义仍然是「冻结的一帧」。

- 不需要 WDA：隐藏期间窗口不在任何画面里，流里不会拍到自己。WDA 只在 live 档打开。
- 代价可以忽略：WGC 是**变化驱动**的，桌面静止时根本不出帧；动的时候才 6fps。
- 主进程那边 `refreshBackdrop` 见到 `liveActive`（预滚也会上报）就跳过 1.2s 的静态抓帧，
  否则那张更旧的帧会把新纹理盖回去。
- 调试：`window.__sillGlass.debug().preRoll` → `{ phase: 'idle'|'wait'|'starting'|'running'|'failed', frames, error }`。

实测（`apps/desktop/out/frame-fresh-check.mjs`，本地脚本）：显示中涂红 → 隐藏 → 涂绿 →
唤出，玻璃带 RGB = (16,106,16) 绿；再隐藏涂蓝 → 唤出 = (24,48,144) 蓝。

### 12.5 延迟：拆开量，看还剩多少空间

#### 量法

面板底下压一块纯色窗口，在它的 `requestAnimationFrame` 里改色并记 `t0`（`Date.now`，
跨进程同一个系统时钟）。渲染器在收到 VideoFrame 时记 `arriveAt`、在把这一帧画进玻璃时记
`drawAt`。于是：

```text
capture = arriveAt - t0           采集 + 传输 + 解码队列（Electron 管不到）
ours    = drawAt  - arriveAt      上传 + 模糊 + 合成（我们能改）
```

脚本：`apps/desktop/out/glass-breakdown.mjs`（本机工具，不入库）。显示器 2560×1600 @ 1.5 → 1707×1067 DIP，**60Hz**。

#### 实测（各 6 次采样，取中位）

| 变体 | capture | ours | draw 前合计 | 单帧合成 CPU |
|---|---|---|---|---|
| 基线（WGC 默认） | **18 ms** | **3–4 ms** | 17–24 ms | 1.4 ms |
| `AllowWgcZeroHz,AllowWgcScreenZeroHz` | 18 ms | 3–4 ms | 20 ms | 1.6 ms |
| `disable-features=AllowWgcScreenCapturer`（退回 DXGI/GDI） | 24 ms | 3 ms | 24 ms | 1.3 ms |

三点结论：

1. **60Hz 屏上一帧 = 16.7ms，`capture` 实测 18ms ≈ 1 帧** —— 这一段已经在平台地板附近；
2. **我们自己的那一段只有 3–4ms**（占全程 10–20%），再怎么优化收益也就 1–2ms；
3. **WGC 是这台上最好的后端**：关掉它换 DXGI/GDI 反而涨到 24ms；ZeroHz 没有差别
   （这个 Chromium 版本已经是默认行为）。

再加上透明窗口的 DWM 混合与下一帧提交（约 1 帧，**未实测**，无相机量不到），
从「桌面变了」到「玻璃显示」大约是 **35–45ms**，即 2–2.5 帧。

#### 已经做掉的（v0.8.2）

| # | 原来 | 现在 | 省掉 |
|---|---|---|---|
| 1 | 采集 `frameRate: 30` | `60` | 平均 16ms（最多 33ms） |
| 2 | `<video>` + `requestVideoFrameCallback` | `MediaStreamTrackProcessor` + `texImage2D(VideoFrame)` | 1–2 帧呈现队列（16–33ms） |
| 3 | 合成循环空闲时 30fps | 实时档就绪时永远 60fps | 最多 33ms |

最坏路径从 ~100ms 压到 ~50ms；剩下的大头已经不是我们的代码了。

#### 还能做什么（按性价比排）

| 方案 | 预期收益 | 成本 | 判断 |
|---|---|---|---|
| A. 收到帧就立即 `draw()`，不等下一个 rAF | 提交时间 2–4ms（**不一定**反映到屏幕） | 低 | 可以做，但要按「屏幕变了」量，不能只看 `drawAt` |
| B. 模糊目标从 /4 降到 /6、少绑几次 uniform | 1–2ms | 低 | 收益小于噪声，不做 |
| C. WebGPU external texture 零拷贝上传 | ~0.5ms | 高（换渲染栈） | 不做 |
| D. 原生 DXGI Desktop Duplication + D3D11 + DirectComposition | **~10ms**（[RapidShot 基准](https://github.com/zaatra/rapidshot)：像素年龄 DXGI 27.6ms vs WGC 37.7ms） | 很高：需要自己的 D3D 交换链、绕过 Electron 渲染，还得维护原生依赖 | 与 DEVPLAN 的「不引入原生编译链」冲突，需单独决策 |
| E. 现成的 npm 原生包（[electron-liquid-glass](https://www.npmjs.com/package/@calvinwycheng/electron-liquid-glass)，DXGI + DComp 预编译） | 同 D | 中（原生依赖 + 信任/ABI/签名） | 想走 D 的路线时值得先评估它，省掉编译 |
| F. 降低采集分辨率 / 提高请求帧率 | 0 | 低 | 实测无差别（刷新率是硬上限） |

**建议**：停在这里。剩下的 18ms 采集 + 1 帧 DWM 都在 Electron 之外的层，
再往下压只有 D/E 两条路，而它们换来的 ~10ms 在一层厚模糊后面根本看不出来
（见 12.6 的观感讨论）。

> 顺带一条约束：窗口是 `transparent: true`，DWM 每个合成帧都要多画一次
> （[electron#39895](https://github.com/electron/electron/pull/39895)），这是透明窗固有成本，
> 也是「不可改窗口类型」这条约束（C3）的一部分。


### 12.6 滑入震荡：单独开关，默认关

`theme.glassWobble`（设置 → 外观 → 液态玻璃 → 「滑入震荡」）。

默认**关**。理由：真玻璃上那一下鼓胀读起来更像「UI 在抖」而不是「材质在动」，
raoxi 看完也要求关掉。开关只影响 `uPulse` 那一族（边缘鼓起 / 色散尖峰 / 高光爆一下 /
采样空间挤压），**不动**呼吸、滑入的折射鼓包和掠光 —— 那三样是材质本身的动静。

并排对比见 [wobble-on-vs-off.png](media/glass/wobble-on-vs-off.png)。
