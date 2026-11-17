# Sill 开发文档

面向**动手改代码**的人。产品目标与架构规划在 [../DEVPLAN.md](../DEVPLAN.md)，进度与交接在 [HANDOFF.md](HANDOFF.md)。

最后更新：2026-11-17（v0.5.3：五段式设置、electron-updater 自动更新）

---

## 1. 环境

实测环境（2026-11-13，raoxi 的 Windows 主机）：

| 项 | 版本 | 备注 |
|---|---|---|
| Node.js | v24 | nvm 管理 |
| pnpm | 12.14.0 | 已全局安装，`packageManager` 已锁版本 |
| Electron | 45.3.1 | 运行时 158 MB，见 §3.3 |
| Vite | 7.3.8 | 由 electron-vite 6 驱动 |
| 代理 | `http://127.0.0.1:7898` | Clash Verge mixed-port，境外依赖必走 |

---

## 2. 常用命令

```powershell
pnpm typecheck   # tsc 跑两套 tsconfig：main+preload / renderer
pnpm build       # electron-vite build → apps/desktop/out/{main,preload,renderer}
pnpm smoke       # electron . --smoke：起面板 → capturePage → 写 out/smoke.png → 退出
pnpm dist        # NSIS 安装包（约 2 分钟）
pnpm dist:portable # 解包 + 生成绿色 ZIP
pnpm dist:dir    # 只解包到 dist/win-unpacked，不压安装器（查打包问题用这个，快）
```

`pnpm dev` 会同时起 Vite dev server 与 Electron，renderer 有 HMR，主进程改动会自动重启。
**`pnpm dev` / `pnpm smoke` 都要求先清掉 `ELECTRON_RUN_AS_NODE`**，原因见 §8 排错表第一条。
`pnpm dist` 要下 Electron 与 NSIS 工具链，镜像与代理见 §3.5。

---

## 3. 首次安装：四个坑

按顺序踩，每一步都可能挡住下一步。

### 3.1 依赖安装

```powershell
$env:HTTPS_PROXY='http://127.0.0.1:7898'; $env:HTTP_PROXY=$env:HTTPS_PROXY
$env:NO_PROXY='localhost,127.0.0.1,::1'
pnpm install
```

### 3.2 pnpm 10+ 会拦下依赖的安装脚本

`pnpm install` 直接报 `ERR_PNPM_IGNORED_BUILDS`，说的是 `esbuild@x` 的 postinstall 被跳过。
**只在 `pnpm-workspace.yaml` 里声明 `onlyBuiltDependencies` 不够**（本项目已声明 `esbuild`、`electron`，
实测装完仍然报错），必须再跑一次：

```powershell
pnpm approve-builds --all
pnpm install          # 这一步才会真的执行 esbuild 的 postinstall
```

### 3.3 Electron 二进制没下下来

`pnpm approve-builds` 只补跑了 esbuild，electron 的 `install.js` 仍可能没执行，表现为
`apps/desktop/node_modules/electron/` 下**没有 `dist/`**。`pnpm rebuild electron` 是空操作，别浪费时间。

直接跑它的安装脚本，并走国内镜像（官方 GitHub Release 经常 reset）：

```powershell
$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'
$env:HTTPS_PROXY='http://127.0.0.1:7898'
cd apps/desktop/node_modules/electron
node install.js
```

约 158 MB，走镜像一般 1–2 分钟。装完检查 `dist/electron.exe` 是否存在。

### 3.4 版本配对：`@vitejs/plugin-react` 不能上 6.x

plugin-react 6.x 内部 `import 'vite/internal'`，而 Vite 7 没有导出这个子路径，构建时直接炸：

```
Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: Package subpath './internal' is not defined by "exports"
```

本项目锁的是 `@vitejs/plugin-react@^5.2.0`（peer 支持 Vite 4–8）。
**不要顺手把它升到 6.x**，除非同时把 Vite 升到 8。

### 3.5 打包（`pnpm dist`）的镜像与代理

electron-builder 会从 GitHub 拉 Electron 和 NSIS / 7zip 工具链，直连必被 reset。这台机器上按这个跑：

```powershell
$env:HTTPS_PROXY='http://127.0.0.1:7898'
$env:HTTP_PROXY=$env:HTTPS_PROXY
$env:NO_PROXY='localhost,127.0.0.1,::1,npmmirror.com'
$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_BUILDER_BINARIES_MIRROR='https://npmmirror.com/mirrors/electron-builder-binaries/'
$env:CSC_IDENTITY_AUTO_DISCOVERY='false'   # 没有证书，别让 builder 去找
pnpm dist
```

下载缓存在 `%LOCALAPPDATA%\electron-builder\Cache` 与 `%LOCALAPPDATA%\electron\Cache`，
第二次起基本不用再下。偶发 `The server aborted pending request` 或
`EPERM ... win-unpacked.tmp`：删掉 `apps/desktop/dist/win-unpacked.tmp` 再跑一次。

---

## 4. 目录与文件职责

```
Sill/
├─ DEVPLAN.md                 产品与架构规划（v0.5.3）
├─ docs/
│  ├─ DEVELOPMENT.md          本文
│  ├─ HANDOFF.md              交接
│  ├─ media/panel-preview.webp    当前面板截图（README 用）
│  ├─ media/settings-preview.webp 当前设置截图（README 用）
│  ├─ media/m0-panel.png          M0 时期的实机截图（历史证据）
│  └─ mockups/                四种面板形态对比页 + 素材
└─ apps/desktop/
  ├─ electron.vite.config.ts  三段构建配置（main / preload / renderer）
   ├─ electron-builder.yml     安装包配置（NSIS per-user、无签名、图标走 extraResources）
   ├─ resources/               collector.ps1 / media-control.ps1 / mouse-watch.ps1 + 托盘图标
   ├─ scripts/make-tray-icon.py 托盘图标生成器（Pillow，可重跑）
   └─ src/
      ├─ shared/
      │  ├─ theme.ts            主题类型、默认值、8 套预设、色珠表、normalizeTheme
      │  ├─ i18n.ts             中英文案、日期格式；主进程与渲染进程共用
      │  ├─ data.ts             面板快照、待办、媒体控制状态的类型
      │  ├─ weather.ts          天气城市表、WMO 条件映射、WeatherSnapshot
      │  ├─ layout.ts           面板尺寸（连续宽高 / 预设 / 列数函数）与卡片布局
      │  └─ update.ts           更新检查的状态类型
      ├─ main/                  主进程
      │  ├─ paths.ts            app 名称、userData 路径、便携模式检测（必须最先导入）
      │  ├─ settings.ts         设置类型、默认值、收敛、原子写（含主题、面板尺寸、设置窗口模式）
      │  ├─ data/               真实数据：collector（PS 常驻）、system（os）、todo（todo.json）、
      │  │                      media-control（SMTC + WASAPI 控制进程）
      │  ├─ weather.ts          天气 provider：ipwho.is 自动定位 + Open-Meteo + weather.json 缓存
      │  ├─ mouse-watch.ts      面板可见时的外部左键监视器（PowerShell 子进程）
      │  ├─ updates.ts          electron-updater 检查 / 下载 / 安装状态机
      │  ├─ panel.ts            面板窗口：几何、缩放、滑入动画、显隐、Esc 分层、崩溃重载
      │  ├─ settings-window.ts  独立设置窗口的创建 / 定位 / 关闭，以及面板置顶临时让位
      │  ├─ broadcast.ts        settings/layout/update 变更广播给所有渲染窗口
      │  ├─ hotkey.ts           全局热键 + Esc 临时接管
      │  ├─ tray.ts             托盘图标与菜单
      │  ├─ autostart.ts        开机自启
      │  ├─ ipc.ts              IPC 通道
      │  └─ index.ts            启动编排、单实例、退出清理、--smoke
      ├─ preload/
      │  ├─ index.ts            contextBridge → window.sill
      │  └─ index.d.ts          渲染进程可见的类型
      └─ renderer/
         ├─ index.html          CSP、挂载点
         └─ src/
            ├─ main.tsx         createRoot + 两份样式
            ├─ App.tsx          面板骨架、主题 / 尺寸 / 数据状态、widgetContext
            ├─ lib/theme.ts     Theme → CSS 变量
            ├─ lib/useSillSettings.ts 面板与设置窗口共享的设置状态 + 广播订阅
            ├─ lib/hotkey.ts    accelerator → 显示用文案（Alt + Q）
            ├─ components/
            │  ├─ CustomizeSheet.tsx  Settings 表面（外观 / 面板 / 数据 / 系统 / 通用五段）
            │  ├─ SettingsWindow.tsx  独立设置窗口根
            │  ├─ ResizeHandles.tsx   内侧边 / 底边 / 内下角缩放把手 + HUD
            │  └─ widgets/
            │     ├─ MediaWidget.tsx  媒体信息、进度、传输键、音量
            │     └─ TodoWidget.tsx   待办列表、Open/Closed/All、编辑、撤销、原位收合
            ├─ widgets/
            │  ├─ types.ts            WidgetContext / WidgetDefinition
            │  ├─ registry.tsx        WIDGETS + WIDGET_BY_ID
            │  ├─ WidgetShell.tsx     网格落位、拖拽、跨列工具
            │  ├─ HeroWidget.tsx      日期 / 时钟 / 真实天气 + WMO 图标
            │  ├─ SystemWidget.tsx    CPU / 内存 / GPU / 网络
            │  └─ ProcessesWidget.tsx TOP RAM / TOP GPU
            ├─ styles/
            │  ├─ panel.css     玻璃 token、8 套氛围配方、排版原子、卡片 / 缩放 / 动效
            │  └─ customize.css 主题表面的控件样式
            └─ assets/          Instrument Sans/Serif + atmosphere-grain.jpg
```

---

## 5. 运行时结构

```
Electron 主进程
├─ paths.ts        先跑：app.setName('Sill')、userData → %APPDATA%\Sill
├─ settings.ts     loadSettings() / updateSettings(patch)  ← 原子写
├─ panel.ts        createPanel()：panelWidth × panelHeight（0 = 撑满工作区 − 80）
│                  停靠：右侧留 30、上下各留 40、默认垂直居中；拖边缘走 setContentBounds
├─ hotkey.ts       Alt+Q → togglePanel()；面板可见时临时接管 Esc
├─ tray.ts         菜单：显示/隐藏 · 从左侧滑出 · 开机自启 · 打开设置文件 · 退出
└─ ipc.ts          settings:* / panel:hide|toggle|overlay|resize|resize-commit|limits /
                   data:snapshot / media:command / todo:* / layout:* / update:*
        │ 结构化 IPC
        └─ renderer：React，只读 window.sill，无 Node、无 fs
           主题流程：settings.theme → lib/theme.ts → CSS 变量 → panel.css
           组件流程：layout.order → WIDGETS/WIDGET_BY_ID → WidgetShell → render(widgetContext)
           设置窗口：?settings=1 → SettingsWindow → useSillSettings（同一份广播状态）
```

窗口参数：`frame:false, transparent:true, hasShadow:false, skipTaskbar:true,
resizable:false, useContentSize:true, alwaysOnTop('screen-saver')`，创建一次、隐藏复用，
**唤出用 `showInactive()` 不抢焦点**。尺寸不用原生 resizable：拖拽由渲染进程的把手发起，
主进程用 `setContentBounds()` 落位。

---

## 6. 关键实现决策

每一条都踩过或将要踩，改之前先读原因。

### 6.1 userData 路径必须显式设置

包名是 `@sill/desktop`，不设置的话 `app.getPath('userData')` 会落到 `%APPDATA%\@sill\desktop`。
所以 `paths.ts` 第一句就是 `app.setName('Sill')` + `app.setPath('userData', ...\Sill)`，
并且 `index.ts` 的**第一行必须是 `import './paths'`** —— 早于任何用到路径的模块。

### 6.2 动的是窗口，不是内容

面板窗口边界就是玻璃边界。如果只移动内部 DOM，玻璃会被窗口裁掉一块；所以滑入/滑出是在主进程里
逐帧改窗口 x（`setContentBounds`，`TICK_MS = 10`，easeOutCubic，进入 240ms / 退出 160ms）。
方向由 `settings.side` 决定：`right` 从屏幕右侧外滑入，`left` 对称。

改动画时注意：
- 目标位置每次唤出都重算（按鼠标所在屏），不要缓存上一次的 bounds；
- 换屏/改分辨率走 `snapIfVisible()`，不播动画，直接落位；
- 任何动画中间态都要能被下一次 `showPanel`/`hidePanel` 打断（`stopTicker()`）。

### 6.3 不抢焦点，所以 Esc 只能全局临时接管

面板唤出用 `showInactive()`，你正在别处打字不会被打断。代价是：
**窗口收不到键盘事件，`Esc` 也就收不到**。解法是面板可见期间 `globalShortcut.register('Escape')`，
一收起立刻 `unregister('Escape')`。

已知取舍：面板开着的那几秒，Esc 对其他程序也是失效的。可以接受，因为面板是瞬态浮层。
如果注册失败（被别的程序占了），只记日志，不重试，用户仍可用热键或托盘收起。

面板里还有一层自绘表面（Customize）。渲染进程打开它时调 `setOverlayOpen(true)`
（`panel:overlay`），主进程的 Esc 处理器据此改成「先发 `panel:escape` 让渲染进程关覆盖层」，
再按一次才真的收面板。覆盖层打开期间不能按 ESC 直接收面板，否则用户会以为设置丢了。

### 6.4 设置：默认值 + 收敛 + 原子写

`updateSettings(patch)` 先 `coerce()`：类型不对回落默认、宽度夹在 320–1180、高度 0 或 420–2200、
side 只认 right/left、`panelOffsetY` 夹在 ±2200、`settingsInWindow` 只认 true/false、
`weatherLocation` 只认 auto 或合法城市 id。
旧文件里的 `panelShape` 会被读一次并迁移成宽高；旧文件没有 `settingsInWindow` 时按 false，
没有 `weatherLocation` 时按 auto。
写盘是「临时文件 + `renameSync`」，避免崩溃留下半个 json。读取失败（不存在/损坏）直接回落默认值，
**绝不因为设置坏了起不来**。

### 6.5 玻璃是四层静态图层，颜色可主题化

固定四层，材质只有这一种：

1. **颜色网格**：`--atmo-layer` + `--atmo-base`，8 套氛围配方
   （lagoon/aurora/dusk/ember/frost/noir/veil/mist），每套只是不同的 blob 位置，
   色相全部来自 `--hue` 的偏移
2. **去色纹理**：`assets/atmosphere-grain.jpg`（`overlay`，低透明度），给任何色相都提供同一层有机细节
3. **顶光**：左上乳白径向（`screen` 混合），强度 = `--halo-k`
4. **1px 渐变 rim**

**不要加 `backdrop-filter`**。面板一旦开始采样桌面，十个组件就是十次实时模糊，GPU 必炸
（液体玻璃原型就吃过这个亏）。要更强折射感，去做更好的贴图，而不是实时采样。

主题只改颜色与可见度（`--hue` / `--tint-s` / `--accent-h` / `--glass-alpha` / `--atmo-k` /
`--halo-k` / `--grain-k`），不改图层数量，也不新增材质。**组件也不得自定玻璃底色**——
它们拿到的 `theme.tokens` 与本面板是同一套（M1 落地时接入）。

### 6.6 单实例与"关不掉的窗口"

`requestSingleInstanceLock()`，第二次启动只唤出已有实例。
面板**只隐藏不关闭**，所以 `window-all-closed` 故意留空实现 —— 否则托盘还活着、应用先退了。

### 6.7 渲染进程崩溃只影响面板

`render-process-gone` → `webContents.reload()`（M0 只重载一次，没做降级 UI）。
DEVPLAN §3.1 第 8 条要求的"连续两次崩溃降级为纯色面板"**尚未实现**。

### 6.8 `--smoke` 是自检入口，不是测试

`electron . --smoke` 会跳过热键与托盘，直接创建面板 → `showPanel()` → 等 1 秒 →
`capturePage()` → 写 `out/smoke.png` → 退出。打包态写到 `%APPDATA%\Sill\smoke.png`（asar 里写不进去）。用途：
在没有 Playwright 的情况下验证「窗口建得起来 + 页面渲染正常 + 玻璃没坏」。

局限：`capturePage` 只截页面，**不含桌面背景**，所以截图会比真实观感偏暗、偏绿。

### 6.9 主题：一个入口，七个数字

- **类型与预设**：`apps/desktop/src/shared/theme.ts`，主进程与渲染进程共用同一份
  `normalizeTheme`（改一遍两边都生效，不要复制第二份）
- **应用**：`renderer/src/lib/theme.ts` 的 `applyTheme()` 把 `Theme` 写成 7 个 CSS 变量 +
  `documentElement.dataset.atmo`。这是主题进入渲染层的**唯一入口**
- **控件**：`components/CustomizeSheet.tsx` 只调 `onChange(patch)`，不直接碰 DOM 或 CSS
- **落盘**：`App.tsx` 改完主题后 220ms 防抖才 `updateSettings({ theme })`；拖滑杆时只改内存，
  停手才写 `settings.json`（否则一次拖动会写几十遍盘）
- **迁移**：旧 `settings.json` 没有 `theme` 字段时 `normalizeTheme(undefined)` 直接给默认
  Lagoon，不需要迁移脚本，也不会因为多出来的字段把设置读坏

新增一套氛围配方：

1. `ATMO_STYLES` 里加 id（`AtmoStyle` 类型自动跟上）
2. `panel.css` 加 `[data-atmo='新id'] { --atmo-base: …; --atmo-layer: …; }`
3. 想让它出现在预设里，再往 `PRESETS` 加一行

`CustomizeSheet` 的 `.cz-sheet` 与 `.rail` 用同一组变量，并且刻意做成半透明：
它既是设置面板，也是玻璃的实时预览。别把它改成不透明的纯色面板，否则改氛围时看不到反馈。

---

### 6.10 真实数据：Node + 一个常驻 PowerShell

- **CPU / 内存**：主进程 `os.cpus()` 差分、`os.totalmem/freemem`，不依赖外部进程
- **网络 / GPU / 进程 / 媒体**：`resources/collector.ps1` 常驻，按 `monitorIntervalMs`（默认 2s）输出一行 JSON
  - 媒体走 Windows SMTC（WinRT），必须用 **Windows PowerShell 5.1**（`powershell.exe`）跑，
    pwsh 7 的 WinRT 投影不可靠
  - 脚本开头设 `[Console]::OutputEncoding = UTF8`，否则中文歌名到 Node 会变乱码
  - GPU 读 `nvidia-smi`；没有 N 卡时字段为 null，UI 显示「—」
- **只在面板显示时组装/推送快照**：`showPanel()` → `startData()`，`hidePanel()` 动画结束 → `stopData()`；
  collector 本身常驻预热，隐藏时继续更新最新样本
- 采集结果缓存；再次唤出先用最新一帧，避免先闪一段「—」
- **待办**：`%APPDATA%\Sill\todo.json`，原子写；第一次运行用当前语言的示例任务初始化

### 6.11 自动更新（electron-updater）

`updates.ts` 用 `electron-updater` + GitHub provider 读取 `latest.yml`，完成检查、后台下载和安装：

- `autoUpdate` 开启：启动 15 秒后检查，之后每 6 小时一次；发现新版本自动下载。
- 下载完成：`update-downloaded` → 设置页显示「重启更新」；`autoInstallOnAppQuit = true`，
  正常退出时也会安装。
- `autoUpdate` 关闭：只手动检查；发现版本后用户点「下载」，下载完成再点「重启更新」。
- 安装版才启用；绿色版（`paths.ts` 的 `IS_PORTABLE`）和 dev 构建显示不支持，不调用 updater。
- 发布物必须同时上传 setup、`latest.yml`、`.blockmap`；setup 缺一不可。
- NSIS 保持 per-user，安装目录 `%LOCALAPPDATA%\Programs\Sill`；更新不碰 `%APPDATA%\Sill`。

### 6.12 自由尺寸与响应式列

- 尺寸模型在 `src/shared/layout.ts`：`PANEL_PRESETS`（四个起点）、`PANEL_MIN/MAX_*`、
  `columnsForWidth()`、`matchPreset()`。**没有 `panelShape` 了**，别把离散形状加回来。
- 设置字段：`panelWidth`（320–1180）、`panelHeight`（0 = 撑满工作区）、`panelOffsetY`（拖底边后的落点）、
  `weatherLocation`（auto 或城市 id）。
- 主进程 `targetBounds()`：`resolveSize()` 按当前显示器的 workArea 夹住宽高，再按
  `centeredY + panelOffsetY` 落 y；宽 1180 上限 / 高 = workArea − 80（上下各 40）。
- **几何一律用 content bounds**：Windows 会把 1px 边框算进 `getBounds()`，用外框尺寸会导致每次
  拖拽/重开 +1px。`createPanel` 带 `useContentSize: true`，其余全部 `getContentBounds()` /
  `setContentBounds()`。
- 拖拽：`panel:resize`（实时，不写盘）→ `resizePanel()` 固定停靠边改宽、固定顶边改高；
  松手 `panel:resize-commit` 写 `panelWidth / panelHeight / panelOffsetY`。高度顶到上限时存 0。
- 渲染层 `ResizeHandles.tsx`：pointer capture + **screenX/screenY**（窗口本身在移动，clientX 会漂移）；
  IPC 串行化、只保留最后一帧；吸附到预设宽高与「撑满」；HUD 显示尺寸 / 列数；方向键可微调。
- 列数由 `columnsForWidth(window.innerWidth)` 在 resize 事件里重算（约 470 起 2 列、700 起 3 列）。
  `.sheet[data-cols]` 切换 CSS grid；`align-content: start` + `grid-auto-rows: min-content`，
  避免 `min-height:100%` 把多出来的高度平分给每张卡（会把头图卡撑成一大块空玻璃）。
- 三列时待办默认 span 3（独占整行，由 `WidgetDefinition.spanFor` 决定）；其余跨列仍由 `layout.json` 决定。
- 设置界面按**实际宽度**分两套：< 620 用顶部 tab，≥ 620 或独立窗口用左侧 152px 导航 + 右侧内容；
  内容列上限 560，避免宽面板把表单拉成横条。

### 6.13 布局编辑

- 模型在 `src/shared/layout.ts`：`CARD_IDS`、`PanelLayout { order, spans, hidden }`、`normalizeLayout`
- 存储 `%APPDATA%\Sill\layout.json`，主进程 `src/main/layout.ts` 负责原子写与补全缺失卡片
- 每张卡由 `WidgetShell` 用 `style.order` 和 `gridColumn` 落位，`data-card` 供拖拽与测试选择
- 编辑态（`editing`）下卡片 `draggable`，把 A 拖到 B 上 = 交换位置；箭头做相邻交换
- 跨列在渲染时用 `clampSpan(span, columns)` 夹住，所以一列时只会是 1
- 隐藏（`hidden`）只过滤渲染，不删 `order` / `spans`；行为页「组件」里的开关改它
- Esc 的分层顺序：编辑态 → 设置面板 → 收面板（`setOverlayOpen(customizing || editing)`）

### 6.14 媒体控制：SMTC 传输 + WASAPI 音量

- `resources/media-control.ps1` 是常驻的 **Windows PowerShell 5.1**（不是 pwsh 7，WinRT 投影不同）：
  stdin 一行命令、stdout 一行 JSON。命令：`get` / `playpause` / `play` / `pause` / `next` / `prev` /
  `mute` / `volume <0-100>` / `volup` / `voldown`。
- 传输键走 SMTC（`TryTogglePlayPauseAsync` / `TrySkipNextAsync` / `TrySkipPreviousAsync`），
  作用在**真正持有媒体会话的应用**上；音量走默认渲染设备的 `IAudioEndpointVolume`（系统主音量，
  不是应用内音量 —— SMTC 没有音量接口）。
- 主进程 `src/main/data/media-control.ts`：面板显示时 spawn，隐藏即 kill；stdin 命令排队、
  按行回包匹配；每 4s 发一次 `get`；进程退出按 1.5s 重试；单条命令 8s 超时。
- `data/index.ts` 的 `getSnapshot()` 会**覆盖式合并**控制进程的即时 `volume/muted`，
  否则刚点完静音后 1.5s 内的快照还是旧值，UI 会闪回。
- 播放/暂停后 SMTC 的 `PlaybackStatus` 常停在旧值几十到几百毫秒；UI 不拿命令返回值覆盖乐观状态，
  而是让乐观状态最多保持 2.6s，等 collector 的快照追上。
- 音量拖动是乐观 UI + 松手写一次；输入范围 0–100，`aria-valuetext` 带百分比。

### 6.15 待办动效

- 行为对齐 `D:\Projects\LiquidGlassTodo` 的 task 交互：**任务按插入顺序留在原位**，勾选只改变
  done 状态，不再重排 / 沉底；这是之前「从上方闪到下方」的根因。
- 新增：`task-in` 从 `translateY(7px) + blur(3px)` 淡入，0.42s `--ease-out`；只在行挂载时播放。
- 勾选：圆点背景/阴影 + SVG 勾 `stroke-dashoffset`；删除线用 `.task__text::after` 的
  `scaleX(0 → 1)`（`text-decoration` 无法补间）；勾上时 `.dot__ripple` 播 0.55s ripple。
- 删除：`.task-row` 加 `is-leaving` 后 `grid-template-rows: 1fr → 0fr` + margin 收合，内容同时
  `opacity → 0`、`translateX(10px)`；**没有 translateY**。280ms 后才 `onRemove`。
- `leaving` 不提前清空：等 `items` prop 真的不包含该 id 时才移除，避免「父级还没删、行先弹回」
  的闪烁；`onRemove` 失败 420ms 后有兜底恢复。
- **最后一行也保留 12px margin**，由 `.addrow` 的 4px padding-top 补偿成 16px；不要用
  `:last-child { margin-bottom: 0 }`——删最后一条时上一行会瞬间失去 margin，跳 12px。
- 滚动容器加 `overflow-anchor: none`，避免浏览器 scroll anchoring 在行高变化时替我们改 scrollTop。
- `prefers-reduced-motion` 下所有动画/过渡关闭。

### 6.16 组件宿主（v0.4.9）

- `widgets/registry.tsx` 是唯一的组件清单：每个 `WidgetDefinition` 声明 `id`、`nameKey`、
  可选 `className`、`spanFor(columns)` 与 `render(context)`。
- `App.tsx` 不再写任何一张卡的 JSX：按 `layout.order` 过滤 `hidden`，查 `WIDGET_BY_ID`，
  交给 `WidgetShell` 包一层网格 / 拖拽 / 跨列工具。
- `WidgetContext`（`widgets/types.ts`）是组件唯一的数据入口：`language`、`now`、`snapshot`、
  `todos`、媒体位置 / 进度 / 命令、待办回调。组件不 import IPC、不读 settings。
- 新增内置组件：
  1. `shared/layout.ts` 的 `CARD_IDS` 加 id
  2. 写一个组件 + 在 `registry.tsx` 加 definition
  3. i18n 加 `widget.<id>` 与必要文案
  `App.tsx` 不需要改；`layout.json` 的 `normalizeLayout` 会把新 id 补到 `order` 末尾。
- 边界：这层**不是 IR 引擎**。它认识 `CardId`、直接 import 五个组件，没有 manifest / 沙箱 / Compiler。
  别在 registry 里继续堆语法，下一步是 `packages/engine`。
- 全部隐藏时渲染 `.sheet__empty` 空状态（提示去设置里打开），不会留一块没有任何文字的玻璃。

### 6.17 设置布局比例（v0.5.0）

- 宽面板（`data-wide='true'`）的 grid 是 `152px + minmax(0, 560px)`，内容列不再铺满整个面板。
- 控件各自有上限：`.cz-field` 420、`.cz-keycap` 280、`.cz-sizepresets` / `.cz-size-meta` 420、
  `.cz-grid` 380；主题预设 `aspect-ratio: 16/9`，氛围预览 `16/10`。
- 宽窄切换点从「列数」换成实际宽度 620；620 以下用顶部 tab，表单拿满 343–583 的可用宽度。
- 目的：拉宽面板时只增加留白，不把滑杆、快捷键、预览卡拉成细长条；高度方向始终滚动，不压缩。

### 6.18 独立设置窗口（v0.5.0）

- `settings.settingsInWindow` 决定齿轮行为：false 打开面板内 `.cz-sheet`，true 调
  `settings:open-window`。
- 主进程 `src/main/settings-window.ts`：同一个 renderer 入口 + `?settings=1`；窗口透明无边框、
  固定尺寸（≤760×820，按工作区夹住），标题栏是 `-webkit-app-region: drag`，X 按钮 no-drag。
- 两个窗口都跑 `useSillSettings`；主进程在 `settings:update` / `panel:resize-commit` /
  `layout:set|reset` / `hotkey:set` 之后广播 `settings:changed` / `layout:changed`，
  所以两边永远收敛到同一份状态。更新状态也广播 `update:state`。
- 打开设置窗口时 `suspendPanelTop()` 把面板从 `screen-saver` 层放下，避免面板变宽后盖住设置；
  `closed` / 关闭函数里 `restorePanelTop()`。
- 设置窗口里的「编辑布局」走 `panel:edit-layout`：关设置窗 → showPanel → 给面板发事件，
  App 收到后 `setEditing(true)`。
- 主题滑杆仍有 220ms 防抖；设置窗口关闭前 `flushTheme()` 把最后一帧写掉，避免关窗丢主题。
- **不要用 `window.innerHeight` 当面板高度**：在独立设置窗口里它是设置窗自己的高度。关闭「撑满高度」
  时用 `maxHeight`（面板工作区上限），否则会把面板高度写成 824 之类的值。
- 窗口位置：按面板当前停靠边，把设置窗放在面板旁边的剩余区域；放不下时夹在工作区内。

### 6.19 真实天气（v0.5.0）

- `shared/weather.ts`：28 个城市坐标、WMO code → 语义条件、`WeatherSnapshot`。
- `main/weather.ts`：
  - 手动城市：直接取城市坐标。
  - 自动定位：`https://ipwho.is/` 取 IP 粗坐标，落在已知城市 90km 内就用本地化城市名，
    否则保留 IP 返回的 cityName；失败回退上海。
  - 天气：Open-Meteo `current=temperature_2m,weather_code` + `daily=temperature_2m_max/min`，
    无 API key，超时 12s；失败重试一次，再失败保留旧值并 30s 后重试。
  - 缓存 `%APPDATA%/Sill/weather.json`；面板显示时才刷新，15 分钟一次；隐藏不轮询。
  - 设置 `weatherLocation` 改变时 IPC 立即 `refreshWeather()`，不等 15 分钟。
- `PanelSnapshot.weather`；HeroWidget 用 `cityId` 本地化城市，按 WMO 条件画太阳/月亮/云/雨/雪/雷，
  并显示当前温度、天气、最高/最低。未知/失败显示「天气暂不可用」。
- 设置：通用 → 天气 → 地区下拉（自动 + 28 城市）；归属文案 Open-Meteo / ipwho.is。
- 注意：这是 IP 粗定位，不是系统定位权限；VPN/代理会改变结果。

### 6.20 点外收起（v0.5.0）

- 面板不抢焦点，收不到 `blur`；`resources/mouse-watch.ps1` 用 `GetAsyncKeyState(VK_LBUTTON)` 40ms
  轮询，只在按下那一帧输出 `click`，不安装全局钩子、不消费点击。
- `main/mouse-watch.ts` 只在面板可见时启动，隐藏立即 kill；崩溃/退出按 1.5s 重启。
- `panel.ts` 收到 click 后用 **Electron `screen.getCursorScreenPoint()`（DIP）** 判断，不把
  PowerShell 的物理坐标混进多屏 / 高 DPI。以下情况不收起：
  - 面板内（content bounds）；
  - 托盘图标（`tray.getBounds()`）；
  - 任何第二个 BrowserWindow（设置窗口 / DevTools）；
  - `overlayOpen`（设置覆盖层 / 布局编辑）。
- 点击任务栏其他区域、桌面、其他应用会收起；这是预期。
- 副作用：面板可见时多一个 PowerShell 进程；已写进已知问题。

### 6.21 TODO：Open / Closed / All + 编辑 + 撤销（v0.5.0）

- 所有任务始终渲染在插入顺序里；`.task-row.is-filtered` 用 `grid-template-rows: 0fr` + margin 0
  + 横向淡出收起，**不重排**。切换过滤器时行是展开/收合，不是 DOM 重排。
- 标题行右侧 `.task-filter` 三段（Open / Closed / All）+ 计数 + 滑动 thumb（`--filter-index`）。
- 勾选 / 取消后如果当前过滤器会隐藏它，先 `held` 360ms 让 check 动画播完，再收起；不产生上下跳变。
- 编辑：行内 pencil → input，Enter 保存 / Esc 取消 / 失焦保存；主进程 `todo:update`。
- 删除：280ms 收合后 `todo:remove`；成功后显示 5s toast（`todo-toast`，fixed 在面板底部），
  `todo:restore` 按原 id / done / index 恢复；`todo.json` 顺序不变。
- Esc：输入框聚焦时 renderer 调 `panel:typing(true)`，主进程把 Esc 发回 `panel:escape-input`，
  由 TodoWidget 取消输入；`setTyping(false)` 后 Esc 才收面板。避免全局 Esc 吞掉输入框取消。
- 空状态按过滤器显示：`todo.empty` / `emptyOpen` / `emptyClosed`。

### 6.22 组件开发仓库（v0.5.0）

`D:\Projects\Sill-Components` 是独立 git 仓库（[GitHub](https://github.com/Enkrid-Rao/sill-components)），
包含 manifest / IR / runtime / script sandbox / security / testing / roadmap 文档、JSON Schema
和 clock / counter 示例。

Sill 主仓库只保留宿主实现（`WidgetShell`、`WIDGETS`、数据 provider）与内置组件；
**不要把组件规范再散落回 Sill 文档**，两边以链接和版本号对齐。

### 6.23 绿色版 / Portable ZIP（v0.5.0）

- **不要用 electron-builder 的 `portable` target**：它产出的是自解压 exe，不是绿色文件夹版；
  本项目用普通 ZIP 文件夹。
- `electron-builder.yml` 的 `win.target` 只有 `nsis`，安装包是 `Sill-Setup-<version>.exe`。
- `pnpm dist:portable`：
  1. `dist:dir` 生成 `dist/win-unpacked`；
  2. `scripts/make-portable-zip.ps1` 复制成临时 `Sill/` 文件夹；
  3. 在 exe 旁写 `portable.flag` 和 `README.txt`；
  4. `Compress-Archive` 出 `Sill-<version>-portable-win64.zip`。
- `paths.ts` 在 `app.isPackaged` 且 exe 旁存在 `portable.flag` 时，把 userData 指到
  `<exe dir>/Sill-data`；ZIP 解压后直接运行 `Sill/Sill.exe`，不会解压到临时目录。
- `SILL_USER_DATA` 仍然优先，测试不受影响。
- `applyAutostart` 在便携模式下注册 `process.execPath`（绿色文件夹里的 `Sill.exe`）。
- 便携版不写安装目录/卸载项；删除整个文件夹即完全卸载。
- **不要把 portable 数据写到 `Program Files`**：settings 会失败；README 已注明放在可写目录。
- 脚本文件必须保存为 **UTF-8 with BOM**，否则 Windows PowerShell 5.1 会把中文脚本按 ANSI 解析。

### 6.24 监测推送与刷新频率（v0.5.1–v0.5.2）

- 主进程按 `settings.monitorIntervalMs`（1 / 2 / 3 / 5s）采样，并通过 `data:changed` 主动推给面板；
  渲染进程不再用 `setInterval` 拉快照。
- 面板 `backgroundThrottling: false`：隐藏/重新唤出时渲染进程不被冻结，否则 `panel:state`
  和首帧数据会排队到点击面板后才处理（表现为“唤出后必须先点一下才刷新”）。
- 显示后先等 250ms 再采第一帧 CPU，避免把 reset 后的 0ms 差值显示成 0%。
- **collector 常驻**：应用启动时 `warmCollector()` 先拉起 PowerShell，面板隐藏时只停快照推送 /
  媒体控制 / 天气，不停 collector。这样唤出时 GPU、网速、进程已有最新样本；媒体和点外监视器仍只在
  面板可见时运行。
- collector 重启时保留上一帧样本；`getCollected()` 用陈旧阈值（2 × 间隔，至少 4s）兜底，
  真正过期的数据才显示 —。
- `collector.ps1` 接受 `-IntervalMs`；网络计数先预热 250ms 再发首行，避免第一次输出 0 B/s；
  设置变更时 `refreshDataCadence()` 换节拍并重启采集。
- `SystemWidget` 用 `useSmoothNumber` 对 CPU / 内存 / GPU / 网络做 560ms easeOutCubic 插值；
  `prefers-reduced-motion` 下直接落值。柱宽和读数走同一份插值值。
- 相关：`shared/data.ts` 的 `MONITOR_INTERVALS` / `normalizeMonitorInterval`，
  `main/data/index.ts`、`main/data/collector.ts`、`renderer/lib/useSmoothNumber.ts`。

## 7. 视觉规范

字号与间距直接沿用 `docs/mockups/panel-forms.html` 的 C 场景（384 宽），改样式时以那份为准。

| 用途 | 类 | 规格 |
|---|---|---|
| 日期/分组标题 | `.cap` | 10px / letter-spacing .17em / 大写 / `--ink-faint` |
| 时钟 | `.num` | Instrument Serif Italic `clamp(56px, 9.5vw, 100px)` / line-height .92 |
| 正文说明 | `.sub` | 12.5px / `--ink-dim` |
| 行内标签 | `.lbl` | 11px / `--ink-dim` |
| 数值 | `.val` | 12.5px / tabular-nums |
| 待办 | `.task` | 13.5px / 行距 13 |
| 分组上下留白 | `.grp` | `padding: 11px 0` |
| 分隔线 | `.hair` | 1px，左右渐隐 |

颜色只有这几个：`--ink` / `--ink-soft` / `--ink-dim` / `--ink-faint` / `--mint` / `--apricot`。
新增颜色先问「能不能用现有透明度解决」。

### 7.1 中文排版（v0.5.0）

中文不能直接沿用上表的英文小字：微软雅黑在 9–10px + 0.17em 字距下发虚、发灰。
`html[lang='zh']` 下有一层独立覆盖，英文不受影响：

| 位置 | 英文原值 | 中文覆盖 |
|---|---|---|
| 面板日期 / 分组标题 `.cap` | 10px / .17em / 400 | **11.5px / .045em / 500**，颜色 .72 |
| 面板正文 `.sub` | 12.5px | **13.5px / 1.55 行高** |
| 行内标签 `.lbl` | 11px | **12px** |
| 待办 `.task` | 13.5px | **14px / 1.45 行高** |
| 媒体标题 / 艺术家 | 13.5 / 11.5 | **14.5 / 12.5** |
| 设置 tab | 10 / 11（wide） | **11.5 / 12** |
| 设置分组 / 小标签 | 8.5px / .17em | **10.5px / .055em / 500** |
| 设置行名 / 说明 | 11.5 / 9 | **12.5 / 10.5** |
| 设置标题 | 25px | **24px / 1.15 行高** |
| 设置页脚 | 8.5px | **10.5px** |

- 颜色变量同步提亮：`--ink-dim` .58→.68、`--ink-faint` .4→.52；中文 `.cap` 额外到 .72。
- `html[lang='zh'] body { -webkit-font-smoothing: auto; }`：Windows 上 `antialiased` 会让小号中文发灰，
  恢复系统次像素渲染。
- 字体栈仍以 Instrument Sans 开头（英文/数字），中文回退 `Microsoft YaHei UI` / `Microsoft YaHei` /
  `PingFang SC` / `Noto Sans SC`；不把整个页面换成雅黑，避免英文和数字失去原字形。
- 中文放大后内容变高，超出面板时按设计滚动（DEVPLAN §5.2）；不要为了塞下内容把字号再压回去。
- 独立设置窗口的 `document.title` 也跟着语言：`Sill 设置` / `Sill Settings`；BrowserWindow 的
  `title` 只是加载前的初始值，最终以 renderer 写回的为准。
- 验收：`getComputedStyle` 在 `lang=zh` / `lang=en` 下各读一次；中文 `.cap` 11.5、`.task` 14，
  英文回到 10 / 13.5；切换语言不能残留旧字号。

---

## 8. 排错

| 症状 | 原因 | 处置 |
|---|---|---|
| `TypeError: Cannot read properties of undefined (reading 'setName')`，栈里是 `Node.js v24.x` | `ELECTRON_RUN_AS_NODE=1` 被注入（DSH 的 Electron 宿主会带这个变量），electron 以纯 Node 跑，`require('electron')` 返回路径字符串 | `Remove-Item Env:ELECTRON_RUN_AS_NODE` 再跑 |
| `ERR_PNPM_IGNORED_BUILDS` | pnpm 10+ 默认不执行依赖脚本 | `pnpm approve-builds --all` 再 `pnpm install` |
| `electron` 目录里没有 `dist/` | 二进制没下（GitHub Release 被 reset） | 走 npmmirror 镜像跑 `node install.js`，见 §3.3 |
| `Package subpath './internal' is not defined` | plugin-react 6 与 Vite 7 不兼容 | 锁 `@vitejs/plugin-react@^5.2.0` |
| 面板出现但一片黑 | renderer 资源 404（`out/renderer` 未生成） | 先 `pnpm build`；dev 模式检查 Vite 端口 |
| 热键没反应 | 被别的程序占用 | 看主进程日志 `热键 xxx 被其他程序占用`；托盘仍可唤出 |
| 滑入动画一顿一顿 | 透明窗口 `setContentBounds` 的合成开销 | 调大 `TICK_MS` 到 16，或把 `SLIDE_IN_MS` 调到 200 |
| 打包后的 exe 报 `bad option: --smoke` | 继承了 `ELECTRON_RUN_AS_NODE=1`，exe 以纯 Node 跑 | 启动前 `Remove-Item Env:ELECTRON_RUN_AS_NODE` |
| `EPERM ... win-unpacked.tmp` | 上次构建残留被占用 | 删 `apps/desktop/dist/win-unpacked.tmp` 重跑 |
| `The server aborted pending request` | Electron / NSIS 下载被代理掐断 | 确认 §3.5 的镜像变量都在，重跑一次 |
| 面板数据一直是「—」 | `collector.ps1` 没起来 | 手工跑 `powershell.exe -File apps\desktop\resources\collector.ps1` 看是否有 JSON；再查进程里有没有 `collector.ps1` |
| 中文歌名乱码 | PowerShell 输出编码不是 UTF-8 | 保留脚本开头的 `[Console]::OutputEncoding = UTF8` |
| 面板宽度每次拖拽/重开都 +1px | 用了 `getBounds/setBounds`（Windows 把 1px 边框算进去） | 统一 `getContentBounds/setContentBounds` + `useContentSize: true`，见 §6.12 |
| 媒体卡显示「未在播放」但系统里有歌 | SMTC 没有当前会话，或控制进程还没编译完 C# | 先看 `Get-Process powershell` 是否有 collector / media-control / mouse-watch 三个；手工跑 `media-control.ps1` 输入 `get`；首次启动约 1–2s |
| 音量滑杆一开始是 0 | 控制进程还没回第一帧，`volume = -1` | 等 1–2s；重开面板会先用上一帧缓存值 |
| 点播放后按钮又弹回暂停 | SMTC 的 `PlaybackStatus` 更新滞后，UI 拿到了旧状态 | v0.4.8 已改成乐观状态保持 2.6s；别把 `next.status` 写回 override |
| 拖边缘没反应 | 会话锁屏（`LockApp` 盖住全屏）或指针不在窗口内 | 解锁后手动拖；自动化时用合成 PointerEvent（窗口移动后 clientX 会漂移，必须用 screenX） |
| 勾选任务后它跑到下面 | 旧版把已完成项沉底（v0.5.0 已移除） | 任务必须留在插入位置；不要再加 `ordered` / FLIP 重排 |
| 设置控件被拉得特别长 | 宽面板内容列没有上限 | 内容列 560、滑杆 420、快捷键 280、预览 380；改 `customize.css` 的 max-width，不要用 100% |
| 独立设置窗口打不开 | `settingsInWindow` 为 false、或面板齿轮仍走 overlay | 通用页开关打开；重启不必要；设置窗口只在下次点齿轮时生效 |
| 设置窗口被面板盖住 | 面板仍是 screen-saver 层 | 打开设置窗口应 `suspendPanelTop()`；关闭时 `restorePanelTop()` |
| 关闭设置窗口后面板不再置顶 | 关闭路径没走 `restorePanelTop()` | 检查 `closed` 事件与 `closeSettingsWindow()` 两条路径 |
| 中文发虚 / 层级糊成一片 | 中文还在吃英文的 9–10px + .17em 字距，或 `lang` 没切到 zh | 看 `<html lang>`；中文必须命中 `:root[lang='zh']` 覆盖，`.cap` 11.5、说明 ≥10.5、正文 13.5–14 |
| 切语言后字号没变 | `document.documentElement.lang` 没跟随 settings.language | `useSillSettings` 的 language 变化要写 `document.documentElement.lang`，CSS 才能切覆盖 |
| 中文在设置窗口又变小 | 独立窗口没跑同一个 `useSillSettings`，或 `lang` 没设置 | 设置窗口与面板共用 hook；检查窗口里的 `document.documentElement.lang` |
| 天气一直显示「正在获取」 | 首次 ipwho.is / Open-Meteo 慢，或网络被拦 | 等 12s 超时 + 1.2s 重试；看主进程 `天气获取失败` 日志；用浏览器打开两个 API；失败会回退上海并 30s 重试 |
| 天气城市不对 | 自动定位是 IP 粗判，VPN/代理会改变出口 | 设置 → 通用 → 天气 → 地区，手动选城市；或关掉代理再试 |
| 点外不收面板 | mouse-watch.ps1 没启动 / 被杀 / 点在设置或托盘 | 看 `Get-Process powershell` 是否有 mouse-watch；设置/布局编辑/独立设置窗/托盘点击本来就豁免 |
| 面板突然收起 | 真实点击了外部，或 40ms 轮询把托盘点击误判 | 托盘 bounds 已排除；检查光标是否在面板外；需要调试时临时注释 `startMouseWatch` |
| TODO 过滤后行不见了 | 当前过滤器是 Open/Closed，任务状态不匹配 | 切到 All；检查 `data-filtered` / `.is-filtered`；不要用 `display:none` 重排 |
| TODO 撤销后顺序错 | `todo:restore` 的 index 用了过滤后的索引 | 必须用**原 items 数组**里的 index，不是可见列表 index |
| 绿色版设置不保存 | exe 放在只读目录（如 `Program Files`） | 移到可写目录；确认 exe 旁生成了 `Sill-data` |
| 绿色版数据跑到 AppData | ZIP 里缺 `portable.flag`，`paths.ts` 没进便携分支 | 用 `pnpm dist:portable` 生成的 ZIP；检查 `Sill/portable.flag` 是否在 `Sill.exe` 旁 |
| `dist:portable` 脚本中文解析报错 | Windows PowerShell 5.1 按 ANSI 读无 BOM 的 UTF-8 脚本 | 脚本保存为 UTF-8 with BOM；或改用 ASCII 文案 |

---

## 9. 已知问题

1. **渲染产物约 774 kB 未压缩**。`electron-vite` 6 默认 `minify: false`（已在其 dist 源码中核实），
   产物里 dev/prod 两条 React 分支都在。M6 打包前给 renderer 开 `build.minify`。
2. **不在 Alt+Tab 里隐藏**。`skipTaskbar` 只管任务栏；要从 Alt+Tab 消失需要 `WS_EX_TOOLWINDOW`，
   Electron 没有直接 API（要 `win.setSkipTaskbar` + 自定义样式或第三方模块），M0 没做。
3. **自启的注册表键名**：`app.setLoginItemSettings()` 在 Windows 写的是
   `HKCU\Software\Microsoft\Windows\CurrentVersion\Run\<app name>`，即 `Sill`。
   DEVPLAN 里写的 `com.sill.app` 是 AppUserModelId，两者不是一回事，**首次实跑后要核对并订正文档**。
4. **托盘仍是「打开设置文件」**。面板内已有完整 Settings；托盘这一项保留给调试，M2 可换成直接打开设置页。
5. **多屏只按鼠标所在屏计算**，未做每块屏的独立记忆；`panelOffsetY` 是全局值。
6. **只有组件宿主，没有组件引擎**。hero/system/processes/media/todo 已全部走 `WIDGETS` 注册表，
   但 registry 直接 import 组件、认识 `CardId`；IR / Validator / Compiler / Provider / 沙箱都还没写。
   下一步是 `packages/engine`，别把宿主当引擎；组件契约在
   [Sill-Components](https://github.com/Enkrid-Rao/sill-components)。
7. **设置窗口是固定尺寸、不可缩放**（≤760×820）。面板本身可自由缩放；设置窗口只在工作区太小时
   夹小，靠内部滚动。
8. **面板可见时有三个 PowerShell 进程**（collector + media-control + mouse-watch），各占几十 MB；
   隐藏面板后都会退出。mouse-watch 是 40ms 轮询，不装全局钩子；极快点击可能漏判。
   若以后常驻组件变多，需要合并采集/控制/点击监视。
9. **真实鼠标拖拽未在解锁桌面上验证**。自动化跑的时候机会话锁屏，只用合成 PointerEvent
   验证了 `screenX` 逻辑；下次人肉拖内侧边 / 底边 / 内下角确认手感。
10. **设置窗口打开期间面板会临时失去置顶**（避免盖住设置窗）；关闭后恢复。若使用者希望面板始终
    压在最上层，这条需要再权衡。
11. **天气依赖外部网络**：Open-Meteo + ipwho.is 都是直连；IP 定位到城市级，VPN/代理会改变结果；
    失败回退上海，首次无缓存显示不可用，30s 重试。没有系统定位权限/高精度坐标。
12. **点外收起依赖鼠标左键轮询**：面板可见时才有进程；不是全局钩子，不消费点击，但 40ms 轮询
    对极快点击有理论漏判；托盘/设置/布局编辑已豁免。
13. **绿色版数据在 exe 旁的 `Sill-data`**，文件夹必须可写，不能放 `Program Files`；
    删整个文件夹即卸载。ZIP 版不会解压到临时目录，启动速度和安装版接近。

## 10. 发布与自动更新（M0.5 进行中）

**已跑通（2026-11-13）**：`pnpm dist` 出 `Sill-Setup-0.1.0.exe`（约 116 MB），静默装到
`%LOCALAPPDATA%\Programs\Sill`，开始菜单有 Sill，打包态 `--smoke` 通过，托盘图标走 asar 外的
`extraResources`（`resources\resources\tray.ico`）。
**v0.5.3**：安装版接入 electron-updater；`pnpm dist` 额外生成 `latest.yml` + blockmap，
release 需要一起上传；绿色 ZIP 不参与自动更新。
当前源码版本 **0.5.3**，安装包输出 `apps/desktop/dist/Sill-Setup-0.5.3.exe`，绿色版输出
`apps/desktop/dist/Sill-0.5.3-portable-win64.zip`，已发布到 GitHub Releases；
`media-control.ps1` / `mouse-watch.ps1` 走 `extraResources` 的 `*.ps1` 过滤，打包时会带上。

模型与验收在 DEVPLAN §11，这里只记实现约束：

- 更新器**只在打包态且非 portable 时生效**：`app.isPackaged` 为假（`pnpm dev` / `--smoke`）或
  `IS_PORTABLE` 为真时直接返回 `unsupported`。
- `autoUpdater.autoDownload = false`；是否自动下载由 `settings.autoUpdate` 决定。
- `autoUpdater.autoInstallOnAppQuit = true`；`installUpdate()` 调用
  `quitAndInstall(false, true)`，不要强制静默重启。
- `pnpm dist` 走 electron-builder + NSIS，装到 `%LOCALAPPDATA%\Programs\Sill`；
  `%APPDATA%\Sill` 是数据目录，卸载不删、更新不碰
- 主进程里**允许碰网络的只有 `updates.ts` 和 `weather.ts`**；渲染进程只消费
  `window.sill.update.*` / `snapshot.weather` 的状态。天气请求超时 12s、失败 30s 重试，不在渲染进程发请求
- `package.json` 的 `version` 是 `latest.yml`、安装包文件名、面板页脚的唯一来源，发版前先核对它
