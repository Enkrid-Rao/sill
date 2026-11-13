# Sill 开发文档

面向**动手改代码**的人。产品目标与架构规划在 [../DEVPLAN.md](../DEVPLAN.md)，进度与交接在 [HANDOFF.md](HANDOFF.md)。

最后更新：2026-11-13（M0 骨架完成当天）

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
pnpm dist        # 出 NSIS 安装包 → apps/desktop/dist/Sill-Setup-<version>.exe（约 2 分钟）
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
├─ DEVPLAN.md                 产品与架构规划（v0.4.3）
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
   ├─ resources/               托盘图标（tray.ico 多尺寸 + tray.png）
   ├─ scripts/make-tray-icon.py 托盘图标生成器（Pillow，可重跑）
   └─ src/
      ├─ shared/
      │  ├─ theme.ts            主题类型、默认值、8 套预设、色珠表、normalizeTheme
      │  ├─ i18n.ts             中英文案、日期格式；主进程与渲染进程共用
      │  ├─ data.ts             面板快照、待办的类型
      │  └─ update.ts           更新检查的状态类型
      ├─ main/                  主进程
      │  ├─ paths.ts            app 名称与 userData 路径（必须最先导入）
      │  ├─ settings.ts         设置类型、默认值、收敛、原子写（含 theme）
      │  ├─ data/               真实数据：collector（PS 常驻）、system（os）、todo（todo.json）
      │  ├─ updates.ts          查 GitHub Release 最新版本（只检查，不安装）
      │  ├─ panel.ts            面板窗口：几何、滑入动画、显隐、Esc 分层、崩溃重载
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
            ├─ App.tsx          面板结构（单列流）+ 主题状态
            ├─ lib/theme.ts     Theme → CSS 变量
            ├─ lib/hotkey.ts    accelerator → 显示用文案（Alt + Q）
            ├─ components/
            │  └─ CustomizeSheet.tsx  Settings 表面（外观 / 行为 / 通用三页）
            ├─ styles/
            │  ├─ panel.css     玻璃 token、8 套氛围配方、排版原子
            │  └─ customize.css 主题表面的控件样式
            └─ assets/          Instrument Sans/Serif + atmosphere-grain.jpg
```

---

## 5. 运行时结构

```
Electron 主进程
├─ paths.ts        先跑：app.setName('Sill')、userData → %APPDATA%\Sill
├─ settings.ts     loadSettings() / updateSettings(patch)  ← 原子写
├─ panel.ts        createPanel()：384 × min(工作区高−200, 900)
│                  停靠：右侧留 30、上下各留 100、垂直居中
├─ hotkey.ts       Alt+Q → togglePanel()；面板可见时临时接管 Esc
├─ tray.ts         菜单：显示/隐藏 · 从左侧滑出 · 开机自启 · 置顶 · 打开设置文件 · 退出
└─ ipc.ts          settings:get / settings:update / panel:hide / panel:toggle / panel:overlay / app:quit
        │ 结构化 IPC
        └─ renderer：React，只读 window.sill，无 Node、无 fs
           主题流程：settings.theme → lib/theme.ts → CSS 变量 → panel.css
```

窗口参数：`frame:false, transparent:true, hasShadow:false, skipTaskbar:true,
resizable:false, alwaysOnTop('screen-saver')`，创建一次、隐藏复用，**唤出用 `showInactive()`
不抢焦点**。

---

## 6. 关键实现决策

每一条都踩过或将要踩，改之前先读原因。

### 6.1 userData 路径必须显式设置

包名是 `@sill/desktop`，不设置的话 `app.getPath('userData')` 会落到 `%APPDATA%\@sill\desktop`。
所以 `paths.ts` 第一句就是 `app.setName('Sill')` + `app.setPath('userData', ...\Sill)`，
并且 `index.ts` 的**第一行必须是 `import './paths'`** —— 早于任何用到路径的模块。

### 6.2 动的是窗口，不是内容

面板窗口边界就是玻璃边界。如果只移动内部 DOM，玻璃会被窗口裁掉一块；所以滑入/滑出是在主进程里
逐帧改窗口 x（`setBounds`，`TICK_MS = 10`，easeOutCubic，进入 240ms / 退出 160ms）。
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

`updateSettings(patch)` 先 `coerce()`：类型不对回落默认、宽度夹在 340–460、side 只认 right/left。
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
- **网络 / GPU / 进程 / 媒体**：`resources/collector.ps1` 常驻，每 2s 输出一行 JSON
  - 媒体走 Windows SMTC（WinRT），必须用 **Windows PowerShell 5.1**（`powershell.exe`）跑，
    pwsh 7 的 WinRT 投影不可靠
  - 脚本开头设 `[Console]::OutputEncoding = UTF8`，否则中文歌名到 Node 会变乱码
  - GPU 读 `nvidia-smi`；没有 N 卡时字段为 null，UI 显示「—」
- **只在面板显示时采样**：`showPanel()` → `startData()`，`hidePanel()` 动画结束 → `stopData()`
- 采集结果缓存；再次唤出先用上一帧，避免先闪一段「—」
- **待办**：`%APPDATA%\Sill\todo.json`，原子写；第一次运行用当前语言的示例任务初始化

### 6.11 更新检查（只查，不装）

`updates.ts` 请求 `api.github.com/repos/Enkrid-Rao/sill/releases/latest`，与 `app.getVersion()` 比较。
**不下载、不安装**；GitHub 仓库是私有的，未带 token 会返回 404，设置页显示「仓库未公开，无法检查」。
真正的安装留给 M0.5 的 electron-updater。

## 7. 视觉规范

字号与间距直接沿用 `docs/mockups/panel-forms.html` 的 C 场景（384 宽），改样式时以那份为准。

| 用途 | 类 | 规格 |
|---|---|---|
| 日期/分组标题 | `.cap` | 10px / letter-spacing .17em / 大写 / `--ink-faint` |
| 时钟 | `.num` | Instrument Serif Italic 56px / line-height .92 |
| 正文说明 | `.sub` | 12.5px / `--ink-dim` |
| 行内标签 | `.lbl` | 11px / `--ink-dim` |
| 数值 | `.val` | 12.5px / tabular-nums |
| 待办 | `.task` | 13.5px / 行距 13 |
| 分组上下留白 | `.grp` | `padding: 11px 0` |
| 分隔线 | `.hair` | 1px，左右渐隐 |

颜色只有这几个：`--ink` / `--ink-soft` / `--ink-dim` / `--ink-faint` / `--mint` / `--apricot`。
新增颜色先问「能不能用现有透明度解决」。

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
| 滑入动画一顿一顿 | 透明窗口 `setBounds` 的合成开销 | 调大 `TICK_MS` 到 16，或把 `SLIDE_IN_MS` 调到 200 |
| 打包后的 exe 报 `bad option: --smoke` | 继承了 `ELECTRON_RUN_AS_NODE=1`，exe 以纯 Node 跑 | 启动前 `Remove-Item Env:ELECTRON_RUN_AS_NODE` |
| `EPERM ... win-unpacked.tmp` | 上次构建残留被占用 | 删 `apps/desktop/dist/win-unpacked.tmp` 重跑 |
| `The server aborted pending request` | Electron / NSIS 下载被代理掐断 | 确认 §3.5 的镜像变量都在，重跑一次 |
| 面板数据一直是「—」 | `collector.ps1` 没起来 | 手工跑 `powershell.exe -File apps\desktop\resources\collector.ps1` 看是否有 JSON；再查进程里有没有 `collector.ps1` |
| 中文歌名乱码 | PowerShell 输出编码不是 UTF-8 | 保留脚本开头的 `[Console]::OutputEncoding = UTF8` |

---

## 9. 已知问题

1. **渲染产物 637 kB 未压缩**。`electron-vite` 6 默认 `minify: false`（已在其 dist 源码中核实），
   产物里 dev/prod 两条 React 分支都在。M6 打包前给 renderer 开 `build.minify`。
2. **不在 Alt+Tab 里隐藏**。`skipTaskbar` 只管任务栏；要从 Alt+Tab 消失需要 `WS_EX_TOOLWINDOW`，
   Electron 没有直接 API（要 `win.setSkipTaskbar` + 自定义样式或第三方模块），M0 没做。
3. **自启的注册表键名**：`app.setLoginItemSettings()` 在 Windows 写的是
   `HKCU\Software\Microsoft\Windows\CurrentVersion\Run\<app name>`，即 `Sill`。
   DEVPLAN 里写的 `com.sill.app` 是 AppUserModelId，两者不是一回事，**首次实跑后要核对并订正文档**。
4. **没有设置界面**。托盘的「打开设置文件」直接打开 `settings.json`，改完重启生效（M2 再做 UI）。
5. **多屏只按鼠标所在屏计算**，未做每块屏的独立记忆。
6. **没有组件引擎**。面板内容是 `App.tsx` 里写死的占位数据，M1 才接 Provider。

## 10. 发布与自动更新（M0.5 进行中）

**已跑通（2026-11-13）**：`pnpm dist` 出 `Sill-Setup-0.1.0.exe`（约 116 MB），静默装到
`%LOCALAPPDATA%\Programs\Sill`，开始菜单有 Sill，打包态 `--smoke` 通过，托盘图标走 asar 外的
`extraResources`（`resources\resources\tray.ico`）。
**还没做**：`publish` 段、`src/main/updater.ts`、页脚/托盘更新提示、v0.1.0→v0.1.1 干跑。

模型与验收在 DEVPLAN §11，这里只记实现约束：

- 更新器**只在打包态生效**：`app.isPackaged` 为假（`pnpm dev` / `--smoke`）时模块直接返回。
  别在 dev 里调 electron-updater——它读不到 `latest.yml`，只会抛错
- `pnpm dist` 走 electron-builder + NSIS，装到 `%LOCALAPPDATA%\Programs\Sill`；
  `%APPDATA%\Sill` 是数据目录，卸载不删、更新不碰
- 主进程里**唯一允许碰网络的是 `src/main/updater.ts`**；渲染进程只消费 `window.sill.update.*` 的状态
- `package.json` 的 `version` 是 `latest.yml`、安装包文件名、面板页脚的唯一来源，发版前先核对它
