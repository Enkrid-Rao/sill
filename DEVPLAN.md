# Sill 开发文档

v0.4.7 · 2026-11-13
Electron + TypeScript 的 Windows 桌面组件层：热键唤出的玻璃侧边廊，组件可安装、可写、可导入 rmskin。
前身是 Tide（同名原型 LiquidGlassTodo 仍在运行，互不干扰）。

---

## 0. 变更记录（v0.3 → v0.4.7）

| 变更 | 原因 |
|---|---|
| 项目名 Tide → **Sill** | 通过四项硬约束（当动词 / 当后缀 / 当命名空间 / 非材质词），并且不再和原型抢 `%APPDATA%\Tide` |
| 面板形态定为 **右侧竖向廊** | 四种形态的实尺对比见 `docs/mockups/panel-forms.html`（1/2/3/4 切换） |
| 取消「顶部下滑」手势 | 原描述只是类比 iOS 从边缘拉下来的浮层，不是真要做边缘拖拽；热键唤出即可 |
| IR v1 砍掉 `grid` | 面板是单列流，`hstack` 嵌套足够；`grid` 推迟到真要做「高密度磁贴模式」时再评估 |
| rmskin 改为 **T3 桥接先于 T1 转换** | 桥接一天能做完，用最低成本先把「到底要不要这个」回答掉 |
| 新增 M0 / M1 验收标准 | 原来的里程碑只有交付物，没有「什么时候算做完」 |
| 失焦不再自动收起 | 侧边廊常驻、不抢焦点；你在别处工作时它不该消失 |
| 默认热键定为 `Alt+Q` | `Alt+W` 在 VS Code / Chrome 里是关闭标签，每天会误触 |
| **v0.4.1** 面板动效改为**移动窗口本身** | 窗口边界就是玻璃边界，内容做位移会被裁掉；只有动窗口才做得成「从屏幕外滑进来」 |
| **v0.4.1** 自启注册表键名订正为 `Sill` | `app.setLoginItemSettings()` 写的是 `<app name>`；`com.sill.app` 是 AppUserModelId，两者不是一回事 |
| **v0.4.1** M0 验收第 4 条的托盘项改为「打开设置文件」 | M0 没有设置界面，写「设置」会与实现不符 |
| 玻璃写进硬约束 | token 不提供 `backdrop-filter`，见 §5.4 |
| **v0.4.2** 面板内落主题系统（Customize） | 用户反馈：背景色、左上光晕、氛围多样性要能自己调；原型 Tide 里验证过的方案收编进 Sill |
| **v0.4.2** 玻璃仍是「一种材质」 | 可变的是 token（色相/上色强度/强调色/透明度）与 8 套氛围配方，不是多种玻璃；§5.4 的 `backdrop-filter` 禁令不变 |
| **v0.4.2** 主题存进 `settings.theme` | §4.5 早就写了「主题」在 settings.json，这次把它实现，并共用 `src/shared/theme.ts` 收敛 |
| **v0.4.2** Esc 分层 | 面板里盖着 Customize 时，Esc 先关覆盖层，再按一次才收面板 |
| **v0.4.3** 自动更新升级为硬需求，新增 **M0.5 发布通道** | 更新器决定安装器形态、安装目录、`app.isPackaged` 分支与回滚路径；拖到 M6 会逼着 M1–M5 返工，趁应用还小先打通 |
| **v0.4.3** 更新源用 generic provider，不锁 GitHub | `publish.url` 构建期注入；公开 GitHub Releases、私有 OSS、自建静态站共用一套代码，不被「是否开源」卡住 |
| **v0.4.3** 更新不自动重启 | 面板常驻、唤出不抢焦点，重启可能打断正在输入的内容；只能由用户点（与 §5.3 同一原则） |
| **v0.4.4** 默认玻璃改「无色相」 | 用户反馈：不要底色。Clear 预设取代 Ink，默认 tint 0、氛围关、暗度 52%；颜色全部退到可选预设 |
| **v0.4.4** Settings 分类 | 外观 / 行为 / 通用 三页，页内再分组；默认只露预设与强调色，其余收进 Details（默认视野从 30+ 控件降到 8 个） |
| **v0.4.4** 新增语言与边缘距离 | 中英即时切换（面板 / 设置 / 托盘 / 日期）；面板离屏幕左右边缘 0–80px 可调 |
| **v0.4.4** 每个分区一张玻璃卡片 | 1px 内侧高光 + 极淡填充，不做第二层模糊；卡片就是将来每个 widget 的容器 |
| **v0.4.4** 位置定为「锚定侧边」 | 删掉只写不读的 `settings.panel{x,y}`；左侧停靠仍从左侧滑入；自由位置留给 M5 |
| **v0.4.5** 置顶不可关 | 不置顶时热键唤出也会被其他窗口压住，开关没有意义；面板恒为 `screen-saver` 层 |
| **v0.4.5** 面板接真实数据 | system（CPU / 内存 / GPU / 网络 / 进程）、media（Windows SMTC）、todo（可增删改、落 `todo.json`）走主进程采集 + IPC；天气仍是占位 |
| **v0.4.5** 更新开关只做「检查」 | Settings 里可以开关自动检查、手动检查 GitHub Release；不自动安装，安装仍走 M0.5 的 electron-updater |
| **v0.4.5** Details 卡片化 | 折叠区从一条淡分割线改成带边框的整行，解决「看不出来能点」 |
| **v0.4.6** 面板宽度改成**形状预设** | 连续宽度滑块换成 Rail / Compact / Board / Wide 四种形状，宽高与列数一起定；`settings.panelShape` 取代 `panelWidth` |
| **v0.4.6** 响应式 1 / 2 / 3 列 | CSS grid 落格：头图横跨整行，Board 两列、Wide 三列且待办横跨；这是将来 widget 自己声明跨列的基础 |
| **v0.4.7** 布局可编辑 | 编辑态下卡片可拖动 / 上下移动、可按当前列数设跨列；顺序与跨列存 `layout.json`，Esc 先退出编辑 |
| **v0.4.7** 布局模型先于引擎 | 卡片 id 与 `order + spans` 的结构就是将来 widget 的落位模型；引擎落地时把写死的卡片换成 `WidgetShell` 即可复用 |

---

## 1. 范围

**做**

- 侧边廊面板：全局热键、托盘、玻璃、滚动、Esc
- 框架：声明式 IR + 沙箱脚本组件 + 组件包安装
- 内置组件：clock / system / weather / todo
- 安装包与自动更新：M0.5 打通「装旧版 → 发新版 → 自己更新上来」，M6 再补签名与灰度
- rmskin 导入（M4）
- 桌面常驻卡片（M5）

**不做**

- 100% Rainmeter 兼容（Lua、自定义 DLL）
- 在线市场、移动端、macOS
- 原生 DLL 插件
- 边缘拖拽手势、全屏点击捕获窗（见 §12）

---

## 2. 命名与标识

| 项 | 取值 | 说明 |
|---|---|---|
| 品牌 | Sill（窗台） | 界面文案一律小写 `sill` 作字标 |
| 命令行 | `sill new` / `sill dev` / `sill validate` / `sill pack` | 动词手势成立 |
| 包格式 | `.sill`（zip） | 开发时直接用文件夹 |
| 包 id | `sill.clock`（内置）、第三方反向域名 | 生态骨架 |
| 用户数据 | `%APPDATA%\Sill\` | 与原型 `%APPDATA%\Tide\` 完全隔离 |
| 自启项 | `HKCU\...\Run\Sill`（Electron 以 app name 写入） | AppUserModelId 是 `com.sill.app`，别混淆 |
| npm | `sill` 已被占用 | CLI 发 `@sill/cli`；开发期 `pnpm link` 即可 |

> 改名窗口就是现在：M0 一动，目录、后缀、包 id、注册表键都会把它变成单向决策。

---

## 3. 里程碑

| 里程碑 | 交付 | 工期 |
|---|---|---|
| M0 工程骨架 | pnpm monorepo、TS、Vite、Electron 壳、侧边廊窗口、热键、托盘、自启、单实例、热重载 | 2–3 天 |
| M0.5 发布通道 | electron-builder NSIS 安装包、electron-updater、更新状态与页脚提示、v0.1.0→v0.1.1 干跑（§11） | 2–3 天 |
| M1 引擎 | IR、Loader/Validator/Compiler/Binder/Patcher、DataHub（time/system）、Provider 接口、调试面板 | 1 周 |
| M2 组件系统 | manifest、安装/卸载、沙箱脚本、设置、生命周期、CLI | 1 周 |
| M3 内置组件 | clock / system / weather / todo，全部走引擎 | 1 周 |
| M4 rmskin | 桥接（T3）→ 解包解析转换（T1）→ 兼容报告 | 2 周 |
| M5 桌面形态 | 常驻卡片窗口、自由位置、位置记忆、多屏 | 3–5 天 |
| M6 打磨 | 动效、性能基线、签名与灰度发布、安装器细节 | 1 周 |

M0.5 紧跟 M0、不插进框架期：更新器要在应用还小的时候验证，拖到 M6 就是一次性压上安装器、
安装目录、`app.isPackaged` 分支和回滚路径。M1–M3 仍是框架验证期；M3 结束再做 rmskin。

### 3.1 M0 验收标准

M0 不算完成，直到下面每一条都成立：

1. `pnpm dev` 一条命令起主进程 + 面板，改 host 代码热更新
2. `Alt+Q` 唤出 / 再按收起，动效 220ms 不卡帧
3. 面板按 §5.1 的几何出现在**鼠标所在屏**；换屏、改分辨率、任务栏变化后自动重算
4. 托盘菜单：显示 / 隐藏 / 从左侧滑出 / 开机自启 / 打开设置文件 / 退出，图标随面板显隐切换
5. 单实例：第二次启动唤出已运行的实例，不新开进程
6. 开机自启可开关，注册表键为 `HKCU\...\Run\Sill`，路径变化后能自愈
7. 设置写入 `%APPDATA%\Sill\settings.json`，原子写（临时文件 + rename），损坏时回落默认值
8. 渲染进程崩溃自动重载一次，连续两次崩溃则降级为纯色面板并提示
9. 空面板能显示一块玻璃（不含组件引擎），即 M0 结束时肉眼可见「这就是 Sill」
10. 面板内 Settings 能改预设、强调色与细节（色相 / 上色强度 / 透明度 / 氛围 / 顶光 / 颗粒），改动实时生效并写入
    `settings.json` 的 `theme`；有覆盖层时 Esc 先关它，不误收面板

### 3.2 M1 验收标准

1. 用一个**没有为它写过任何特例**的组件跑通：只写 `widget.json` + `layout.json`，就能在面板里显示，例如「B 站粉丝数」（走 `ctx.fetch`）
2. 绑定表达式支持：字段访问、`format`、`round`、`if`、比较、四则运算；报错定位到字段路径
3. Provider 注册即用：`visibleOnly` 的 provider 在面板隐藏后 1s 内停止轮询
4. 调试面板能看到：provider 当前值、最近一次错误、组件重载按钮
5. 引擎代码里搜不到任何内置组件的名字

---

## 4. 架构

### 4.1 进程

```
Electron 主进程
  WindowManager · Hotkey · Tray · Scheduler · SettingsStore
  DataHub: time / system / weather / todo / media / files
  PackageManager · RainmeterBridge
       │ IPC（结构化、节流）
       ├── host renderer：侧边廊布局、主题、动画、声明式组件
       └── widget sandbox：iframe，每脚本组件一个
```

### 4.2 窗口

| 窗口 | 配置 |
|---|---|
| 侧边廊 | `frame:false, transparent:true, skipTaskbar:true, alwaysOnTop('screen-saver')`，创建一次、显示/隐藏复用，不抢焦点 |
| 桌面卡片 | 每组件一个窗口，非置顶，位置写入设置（M5） |

- 打开：`globalShortcut`（默认 `Alt+Q`，可在设置里改）+ 托盘
- 关闭：`Esc`、再按热键、托盘菜单。**失焦不关**。
- 动画：**移动窗口本身**（主进程逐帧 `setBounds`，easeOutCubic）。停靠位在屏幕外，滑到目标位置：进入 240ms，退出 160ms。内容不做位移，否则玻璃会被窗口边界裁切。方向由 `side` 决定：`right` 从右侧滑入，`left` 对称。

### 4.3 引擎管线

```
widget.json + layout.json
  → Loader     读包、校验 manifest、解析 @include/变量
  → Validator  schema 校验，错误定位到字段
  → Compiler   layout → 渲染 IR（节点、样式引用、绑定表达式）
  → Binder     绑定表达式 → Provider 数据，订阅
  → Patcher    差量更新 DOM / 样式
```

每个组件实例是一个 `WidgetInstance`，持有状态、订阅、定时器；注销时统一释放。

### 4.4 DataHub

```ts
interface Provider<T> {
  id: string;                 // 'system.cpu'
  interval: number;           // ms
  visibleOnly?: boolean;
  start(): void;
  stop(): void;
  subscribe(fn: (v: T) => void): () => void;
}
```

| Provider | 间隔 | 实现 |
|---|---|---|
| `time.now` | 1000 | Node 定时器 |
| `system.cpu` `system.mem` `system.disk` `system.net` `system.battery` | 1500 | `systeminformation` |
| `system.processes` | 2500 | `systeminformation.processes()` |
| `system.gpu` | 2500 | `nvidia-smi --query-gpu=... --format=csv,noheader,nounits` |
| `weather.current` | 20min | Open-Meteo + Nominatim |
| `todo.items` | 事件 | `fs.watch` `todo.json` |
| `media.nowPlaying` | 1000 | Windows SMTC |

面板隐藏时 `Scheduler` 停止所有 `visibleOnly` provider。

> **v0.4.5 已落地最小实现**：`time`（渲染进程时钟）、`system.cpu` / `system.mem`（主进程 `os`）、
> `system.gpu`（`nvidia-smi`）、`system.net` / `system.processes` / `media.nowPlaying`
> （常驻 `resources/collector.ps1`，2s 一行 JSON）、`todo.items`（`todo.json` + IPC）。
> 天气仍是占位常量，等 M1 的 Provider 接口统一收纳。

### 4.5 存储

| 路径 | 内容 |
|---|---|
| `%APPDATA%/Sill/settings.json` | 主题、热键、面板形状、语言、停靠边与边缘距离、开机自启、自动检查更新 |
| `%APPDATA%/Sill/todo.json` | 待办（`{id,text,done}`，原子写） |
| `%APPDATA%/Sill/layout.json` | 卡片顺序与跨列（`{version,order,spans}`，原子写） |
| `%APPDATA%/Sill/widgets/<id>/` | 组件私有数据（配额 5MB） |
| `%APPDATA%/Sill/packages/<id>@<ver>/` | 已安装组件 |

原子写：临时文件 + rename。

---

## 5. 面板规格

### 5.1 几何

| 项 | 值 |
|---|---|
| 形状 | Rail（默认，384 宽）/ Compact（340×620）/ Board（560×720，2 列）/ Wide（720×780，3 列） |
| 上 / 下边距 | 100（锚定工作区） |
| 右边距 | 30（设置 0–80 可调） |
| 高度 | Rail = 工作区高 − 200，上限 900；其余形状用固定高度，超出工作区时夹住 |
| 圆角 | 34 |
| 边框 | 1px `rgba(255,255,255,.135)` |
| 阴影 | `0 26px 64px -26px rgba(0,0,0,.9)`、`0 8px 24px -12px rgba(0,0,0,.55)` |

出现屏：鼠标所在屏。监听 `display-metrics-changed`、`display-added/removed`。

### 5.2 结构：一条竖向流

```
[品牌行]   mark + sill 字标 ··········· 热键 chip · 主题按钮
[时钟区]   Thursday 12 November
           22:03                       （Instrument Serif Italic 56px）
[天气区]   14°  月亮云  ··············  Shanghai / H 17° L 9°
──────────────────────────────────────────
[系统区]   SYSTEM ······················ 8 cores
           ◯ 42% CPU load
           Memory  61% · 19.5 GB   ▓▓▓▓▓▓▓░░░
           GPU     8%              ▓░░░░░░░░░
           Network ↓1.2 MB/s       ▓▓░░░░░░░░
[进程区]   TOP RAM ····················· Memory
           chrome.exe                 2.4 GB
           Code.exe                   1.1 GB
           TOP GPU            chrome.exe · 26%
──────────────────────────────────────────
[媒体区]   NOW PLAYING
           [封面] Nightcall / Kavinsky · OutRun ··· 2:48
           ▓▓▓▓▓░░░░░░░░░░░░░░░░
──────────────────────────────────────────
[待办区]   TODAY ························ 3 open
           ○ Reply to Mira about the studio keys
           ○ Book the Friday train north
           ○ Send the field notes to Noor
           ⊕ add a task
[页脚]     Esc to dismiss ··············· sill · v0.4
```

- 分区之间 1px hairline，左右渐隐（`linear-gradient(90deg, transparent, rgba(255,255,255,.17), transparent)`）
- 分区内上下 padding 11–13，组内行距 4–9
- 内容超出时面板内滚动（`overflow-y:auto`，滚动条只在 hover 时出现），不裁切、不撑高窗口

### 5.3 唤出与收起

| 动作 | 触发 |
|---|---|
| 唤出 | 全局热键（默认 `Alt+Q`）、托盘菜单 |
| 收起 | 再按热键、`Esc`、托盘菜单 |
| **不**收起 | 失焦、点桌面、切换应用 |

窗口不进任务栏、不在 Alt+Tab 里出现。唤出时**不抢焦点**（否则会打断正在输入的地方）；需要输入的组件（`input`）自己 `focus()`。

### 5.4 玻璃

玻璃 = 四层，全部静态，材质只有一种：

1. **颜色网格**：`--atmo-layer` + `--atmo-base`，8 套氛围配方（见下），色相全部由 `--hue` 偏移得到
2. **去色纹理**：`assets/atmosphere-grain.jpg`，`overlay` 混合、低透明度；给任何色相都提供同一层有机细节
3. **顶光**：左上乳白径向（`screen` 混合），强度由 `--halo-k` 控制
4. **描边**：1px 渐变 rim（`mask-composite: exclude`）

**颜色是可主题化的，材质不是。** 7 个 token 决定整块玻璃：

| token | 含义 | 默认 |
|---|---|---|
| `--hue` | 玻璃主色相 | 210 |
| `--tint-s` | 上色强度，0 = 中性深色玻璃 | 0% |
| `--accent-h` | 强调色相（进度、勾选、按钮、焦点环） | 158 |
| `--glass-alpha` | 玻璃底透明度 | 0.566 |
| `--atmo-k` | 氛围可见度 | 0（默认关） |
| `--halo-k` | 顶光强度 | 0.55 |
| `--grain-k` | 纹理开关 | 1 |

氛围配方 8 种：`lagoon` `aurora` `dusk` `ember` `frost` `noir` `veil` `mist`
（同名 CSS 块 `[data-atmo='…']`，只换 blob 几何、不换色板结构）。

**硬约束**：token 里不提供 `backdrop-filter`。框架只给「预烘焙玻璃」这一种玻璃——让唯一可用的玻璃同时是最便宜的玻璃。想要更强折射感的组件作者，应该去做更好的贴图，而不是每帧采样桌面。

主题由面板内的 **Settings** 表面编辑（预设 / 强调色 / 细节 / 行为 / 语言），
写入 `settings.theme`；预设 8 套：Clear、Lagoon、Aurora、Dusk、Ember、Frost、Iris、Moss。

**动效**：玻璃只有低频的合成层动画——氛围 52s 漂移、顶光 19s 起伏、颗粒 27s、慢速高光 38s。
不碰 blur、不碰背景采样；`prefers-reduced-motion` 下全部关闭。

参考实现：`docs/mockups/panel-forms.html`（C 场景即面板本体；那份仍是旧的四层照片玻璃）。

### 5.5 布局编辑

每个分区是一张卡片，卡片有稳定 id：`hero` / `system` / `processes` / `media` / `todo`。
`layout.json` 保存两样东西：

- **顺序**：全局共享；单列靠 flex `order`，多列靠 grid `order`
- **跨列**：`spans[id]`，渲染时按当前形状的列数夹住（Rail / Compact 永远只有 1 列）

入口是 Settings → 行为 →「编辑布局」。编辑态下：

- 每张卡右上角有拖动把手、↑ ↓、跨列按钮；整张卡也可以直接拖到另一张卡上交换位置
- 顶部条有 Reset / Done；Esc 先退出编辑，不直接收面板
- 改动即时写入 `layout.json`

> 这份模型先于组件引擎存在：M1 落地时把写死的 `<section class="card">` 换成 `WidgetShell`，
> 顺序与跨列直接复用，不需要再设计一套。

### 5.6 设置界面

同一种设置，两套排布，**永远铺满面板**：

| 形状 | 排布 |
|---|---|
| Rail / Compact（1 列） | 顶部三段 tab + 单列内容 |
| Board / Wide（≥2 列） | 左侧 152px 竖向导航 + 右侧内容区 |

不做固定宽度浮层：面板形状只有四种，直接按形状切换 grid areas，比「居中的小卡片」更贴合空间。

---

## 6. 组件规范

### 6.1 包结构

```
my-widget/
├─ widget.json
├─ ui/layout.json        # type=declarative
├─ ui/main.js            # type=script
├─ assets/
├─ locales/
└─ README.md
```

打包为 `.sill`（zip）；开发时直接用文件夹。

### 6.2 manifest

```json
{
  "schema": 1,
  "id": "sill.clock",
  "name": "Clock",
  "version": "1.0.0",
  "author": "raoxi",
  "license": "MIT",
  "runtime": ">=0.1.0",
  "type": "declarative",
  "size": { "w": 384, "h": 180, "minW": 300, "minH": 96 },
  "permissions": ["data.time", "storage"],
  "data": [{ "id": "now", "source": "time.now" }],
  "ui": "ui/layout.json",
  "settings": [{ "key": "hour12", "type": "boolean", "default": false }]
}
```

| 字段 | 说明 |
|---|---|
| `schema` | 固定 1 |
| `id` | 反向域名，唯一 |
| `runtime` | 宿主版本范围（semver） |
| `type` | `declarative` / `script` |
| `permissions` | 能力白名单，安装时展示 |
| `data` | 绑定名 → provider |
| `size.w/h` | 在侧边廊里的**占高建议**，不是绝对尺寸；实际高度由内容与流决定 |

### 6.3 IR 节点

```json
{ "type": "vstack", "gap": 6, "children": [
  { "type": "text", "bind": "now.time", "style": "display" },
  { "type": "text", "bind": "now.date", "style": "caption" }
]}
```

| 节点 | 主要属性 | v1 |
|---|---|---|
| `vstack` `hstack` | `gap`, `align`, `children` | ✓ |
| `overlay` | `children` | ✓ |
| `text` | `bind`, `style`, `format`, `maxLines` | ✓ |
| `image` | `src`, `fit`, `radius` | ✓ |
| `bar` | `bind`, `min`, `max`, `height`, `color` | ✓ |
| `ring` | `bind`, `size`, `thickness` | ✓ |
| `divider` `spacer` | — | ✓ |
| `list` | `items`, `itemTemplate` | ✓ |
| `button` | `label`, `action` | ✓ |
| `input` | `bind`, `placeholder`, `onSubmit` | ✓ |
| `grid` | `cols`, `rows`, `gap` | ✗ 推迟 |
| `line` `histogram` | — | ✗ 随 rmskin 再评估 |
| 绝对定位 / canvas | — | ✗ 留给 M5 桌面卡片 |

样式来自 token：`display` `title` `caption` `mono` `bar` `glass`，可局部覆盖。

### 6.4 绑定表达式

```
now.time                  provider 字段
format(now.time, "HH:mm") 函数
cpu.usage > 80           比较，返回 boolean
```

支持：字段访问、`format`、`round`、`if`、比较、算术。不支持任意 JS。

### 6.5 脚本组件

```js
export default {
  mount(ctx) {
    const el = ctx.root.querySelector('.v');
    ctx.onUpdate(async () => {
      const cpu = await ctx.data.system.cpu();
      el.textContent = `${cpu.usage.toFixed(0)}%`;
    });
  }
};
```

- iframe `sandbox="allow-scripts"`，无 `allow-same-origin`；CSP 禁外链脚本
- 无 Node、无 `require`、无直接网络；网络走 `ctx.fetch`（域白名单 + 限速）
- 崩溃只影响当前 iframe，可重载

### 6.6 API

| 分类 | 方法 |
|---|---|
| 数据 | `data.time` `data.system.*` `data.weather` `data.todo` `data.media` `data.files` |
| 事件 | `onUpdate` `onClick` `onHover` `onShow` `onHide` |
| 存储 | `storage.get/set` |
| 设置 | `settings.get/set` |
| 命令 | `openUrl` `launchApp` `notify` `togglePanel` `refreshData` |
| 主题 | `theme.tokens` |

### 6.7 CLI / 开发工具

| 命令 | 作用 |
|---|---|
| `sill dev` | 启动 + 组件热重载 |
| `sill new <id>` | 组件模板 |
| `sill validate` | 校验 manifest / IR |
| `sill pack` | 打包 `.sill` |
| 开发者面板 | 组件列表、provider 实时值、重载、日志 |

---

## 7. rmskin 导入（M4）

### 7.1 结构（已实测 6 个包）

```
x.rmskin (zip)
├─ RMSKIN.ini      [rmskin] Name/Author/Version/LoadType/Load/MinimumRainmeter/MinimumWindows/VariableFiles
├─ RMSKIN.bmp      可选
├─ Skins/<根配置>/  皮肤、@Resources、字体、Lua
├─ Layouts/
└─ Plugins/32bit|64bit/*.dll
```

编码需探测：ANSI/GBK、UTF-8 BOM、UTF-16。

### 7.2 三级策略

| 级别 | 做法 | 覆盖 | 顺序 |
|---|---|---|---|
| T3 桥接 | 交给本机 Rainmeter，Sill 只管显隐 / 定位 / 召唤 | 全部（需装 Rainmeter） | **先做**，约 1 天 |
| T1 转换 | ini → IR → 组件包 + 报告 | 常见信息类皮肤 | 有人真的拿旧皮肤来问再做 |
| T2 运行时 | JS 实现 Rainmeter 子集 | +10–20% | M6 之后 |

先桥接的理由：一天就能回答「用户到底要不要这个」，而 T1 要两周，且需要拿十几个真实皮肤当测试集。**每转换一个皮肤，就是拿一份别人写的配置去压你的 IR 表达力**——这比自造测试用例有效得多。

### 7.3 映射

| Rainmeter | Sill |
|---|---|
| Time / Uptime / CPU / Memory / Net / FreeDiskSpace | `time` / `system.*` |
| String / Calc | 绑定表达式 |
| SysInfo / Registry | provider（按项映射） |
| WebParser | `ctx.fetch` + 正则 |
| Lua / 自定义 DLL | 不支持 → 报告 → 桥接 |
| String / Bar / Line / Image / Shape / Roundline / Histogram | `text` / `bar` / `line` / `image` / `ring` |

### 7.4 转换器

```
zip → 解包 → RMSKIN.ini → IniParser → IR → Mapper → Emitter → 兼容报告(A–D)
```

报告列出不支持项与行号；输出到 `%APPDATA%/Sill/imported/`。

### 7.5 限制

- Lua（如 ToDo Pro 的 31KB 脚本）、自定义 DLL 无法转换
- Shape 语法与 SVG 不完全等价
- 转换产物保留原 Author/License；对外分发需逐皮肤核对许可证；不使用 Rainmeter 品牌

---

## 8. 数据源细节

### 系统信息

指标：CPU 总占用、核心/线程、内存/交换、GPU 占用/显存/温度、网络、磁盘 I/O、进程数、TOP 3 进程（CPU/RAM/GPU）。

| 项 | 来源 |
|---|---|
| CPU/内存/磁盘/网络/电量 | `systeminformation` |
| 进程排行 | `systeminformation.processes()` |
| GPU | `nvidia-smi`；无 N 卡回退 PDH `GPU Engine` |
| GPU 进程显存 | PDH `GPU Process Memory(*)\Dedicated Usage` |
| PID → 进程名 | `process.name` |

规范：全英文、**无 uptime**、不显示每核、**必须有 TOP RAM / TOP GPU**。

### 其他

| 源 | 实现 |
|---|---|
| 天气 | Open-Meteo + Nominatim，缓存 20min |
| TODO | `todo.json`，`#tag`、完成时间、撤销 |
| 日历 | `.ics`（M5 后） |
| 媒体 | SMTC |
| 日记 | 只读 `D:\Projects\diary\diaries\` |

---

## 9. 仓库与技术栈

```
sill/
├─ apps/desktop/src/{main,preload,host}
├─ packages/{engine,data,rainmeter,package-manager,ui}
├─ widgets/{clock,system,weather,todo}
├─ docs/mockups/          # 面板形态对比（C 即本体）
└─ package.json           # pnpm workspace
```

Electron + TypeScript + Vite + React + Zustand；测试 Vitest + Playwright；打包 electron-builder（NSIS per-user），更新 electron-updater。

---

## 10. 约定

1. 组件只描述 IR / 调用 API，不直接读系统、不直接定时。
2. 引擎不认识具体组件，禁止为内置组件写特例。
3. 隐藏面板时停掉 `visibleOnly` provider。
4. 不做常驻满帧动画、不做每帧实时模糊。
5. 性能与动效在 M6 统一处理，前期只看功能跑通。
6. 组件包一律走 manifest 校验，本地开发也用同一套。
7. 组件不得使用 `backdrop-filter`——token 里就没有这个能力。
8. 面板唤出不抢焦点；需要输入的组件自己要焦点。
9. 任何内置组件都必须能以第三方组件的方式存在（安装、卸载、禁用），做不到就是引擎漏了能力。
10. 组件不自定玻璃底色：面板背景与 `theme.tokens` 是同一份主题，组件只消费 token，不改 token。

---

## 11. 自动更新与发布通道（M0.5）

### 11.1 为什么不等 M6

更新器不是一个依赖：它决定安装器形态（NSIS per-user / per-machine）、安装目录、`app.isPackaged`
分支、托盘与页脚的提示位、失败回滚路径。这些一旦被 M1–M5 的代码假定，改起来就是全线返工。
趁现在只有一个窗口、两千多行代码，把「装 v0.1.0 → 发 v0.1.1 → 自己更新上来」跑通，成本最低。

> **现状（v0.4.5）**：Settings 里的「自动检查更新」只是查 GitHub Release
> （`api.github.com/repos/Enkrid-Rao/sill/releases/latest`），发现新版本只显示版本号，不下载、不安装。
> 仓库目前是**私有**的，未带 token 的请求会拿到 404 —— 要么把仓库改为公开，要么在 M0.5 换成 generic feed。
> 真正的下载安装仍由 electron-updater 在 M0.5 负责。

### 11.2 选型

| 项 | 取值 | 理由 |
|---|---|---|
| 打包 | electron-builder + NSIS | 生态最稳；NSIS 支持 per-user 安装，不需要 UAC；自带 blockmap 差异更新 |
| 更新库 | electron-updater | 直接读 electron-builder 产出的 `latest.yml` |
| 更新源 | generic provider，URL 构建期注入 | 公开 GitHub Releases、私有 OSS、自建静态站共用一套代码 |
| 安装位置 | `%LOCALAPPDATA%\Programs\Sill`（per-user） | 不弹 UAC；与数据目录 `%APPDATA%\Sill` 分开，卸载不丢主题 |
| 版本 | `package.json` 单一来源 | 构建时注入；页脚与托盘显示 `app.getVersion()` |
| 签名 | M0.5 先不签，M6 前定 | 未签名只会被 SmartScreen 拦一次；证书要买，不该拖住通道验证 |

### 11.3 状态机与时机

```
idle → checking → up-to-date
                → available → downloading(%) → downloaded → quitAndInstall
                → error（只记日志，不弹窗）
```

- 只在 `app.isPackaged === true` 且非 `--smoke` 时启动；dev 态整个模块睡眠，状态恒为 `idle`
- 启动后 30s 首次检查，之后每 6 小时；托盘「检查更新」可手动触发
- 静默后台下载，不阻塞面板、不抢焦点；**下载完成后才提示**
- 提示位：面板页脚右侧 `v0.1.0 · 更新已就绪`（点击重启安装）+ 托盘同名菜单项
- **不自动重启**：用户可能正在打字，重启只能由用户发起（与 §5.3「唤出不抢焦点」同一原则）
- 退出路径复用现有 `before-quit`（`rememberPosition()` 已在里面），安装器不需要另存位置

### 11.4 失败与回滚

- feed 404 / 断网 / sha512 不符：状态回 `error`，不弹窗，下次定时重试；面板照常可用
- 安装失败：NSIS 保留旧版本目录，下次启动仍是旧版，不出现「装完打不开」
- `allowDowngrade: false`：不把用户推回旧版
- 更新不触碰 `%APPDATA%\Sill`；`settings.json` 的 `coerce()` 已保证旧文件补默认、新字段回落（§4.5），
  更新后主题不会丢

### 11.5 安全底线

- 只走 HTTPS；`latest.yml` 自带 sha512，electron-updater 校验通过才安装
- 更新源只来自构建期常量或 `SILL_UPDATE_FEED` 环境变量（仅开发/测试）
- **不接受运行时用户输入的更新源**——那等于把远程代码执行交给一个输入框
- 未来：代码签名 + `verifyUpdateCodeSignature`

### 11.6 验收标准（M0.5 不算完成，直到）

1. `pnpm dist` 产出 `Sill-Setup-0.1.0.exe`；双击装到 `%LOCALAPPDATA%\Programs\Sill`，
   开始菜单有快捷方式，托盘 / 面板 / 热键全部正常
2. 版本改 0.1.1 再 `pnpm dist`，产物放进本地 feed → 启动 0.1.0 → 自动下载 → 页脚提示 →
   点击重启 → 版本变 0.1.1，且 `settings.json` 的 theme 原样保留
3. 断网启动：不崩、不弹窗，日志里有一条 error
4. feed 里放 sha512 错误的包：拒绝安装，旧版仍可启动
5. `pnpm dev` 与 `pnpm smoke` 不发任何更新请求（日志断言）

### 11.7 实现落点

```
apps/desktop/electron-builder.yml      appId com.sill.app、NSIS per-user、publish: generic
apps/desktop/src/main/updater.ts       状态机 + electron-updater 封装（唯一碰网络的模块）
apps/desktop/src/main/ipc.ts           update:get / update:check / update:install
apps/desktop/src/preload/index.ts      window.sill.update.*
apps/desktop/src/renderer/…            页脚版本号与更新入口
package.json                           dist / dist:dir 脚本
```

---

## 12. 待定

1. 侧边廊固定在右侧，还是允许用户切到左侧。
2. LiquidGlassTodo 合并（降级成内置 `sill.todo`，数据迁移）还是保持独立。
3. 是否开源（影响包格式、许可证策略、是否要做签名）。
4. 「点空白收起」值不值得一个全屏透明捕获窗（要多一个窗口，且会挡桌面点击）。
5. 面板是否需要「钉住」模式（不自动隐藏，当常驻侧栏用）。
6. 更新源放哪：公开 GitHub Releases，还是自建/OSS（与第 3 条是同一个决定，决定 §11 的 `publish.url`）。

