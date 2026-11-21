# Changelog

## 0.7.0 — 2026-11-21

首个正式版。相比 0.6.1：

- 设置重组为 8 组侧栏 + 搜索；独立设置窗口记住位置；组件页按需加载。
- 面板最大高度、自由布局拖动/缩放、边缘与中线吸附、辅助线。
- 首启隐私门与联网 consent；天气/歌词/更新统一门禁。
- 组件目录 SHA-256 校验；官方组件 `clock` / `rings` 1.1.1，`lyrics` 1.1.2。
- 媒体当前歌词、SMTC 封面、共享歌词偏移、布局撤销/重做、诊断信息、恢复默认设置。
- 采集分源与 last-good；系统/进程卡显示 stale 延迟标识。
- 自动更新 Beta/RC 通道修复；稳定版只看 Latest。

**风险声明**：未做 Authenticode 签名；未完成真实双屏、完整 2h soak、Playwright E2E。自定义组件源只有 SHA-256，没有签名或人工审核；组件是可执行代码，只安装可信来源。

## 0.7.0-beta.5 — 2026-11-21

- 媒体卡读取 SMTC 封面并缓存；无封面时保持渐变占位，不改变布局。
- 歌词时间轴偏移成为全局设置，媒体卡与官方 `sill.lyrics` 1.1.2 共用。
- 组件仓库支持额外 HTTPS catalog 源；按需拉取、失败隔离，可安装条目必须带 SHA-256。
- 设置 → 数据与监测增加“恢复默认设置”：先备份 settings/layout，重置外观、布局、监测、天气、快捷键；待办与组件保留。

## 0.7.0-beta.4 — 2026-11-21

- 布局编辑增加撤销 / 重做（按钮 + Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y），历史最多 30 步。
- 设置 → 通用增加“诊断信息”复制：版本、Electron/Windows、显示器、面板参数、联网状态、组件清单。
- 修复设置窗口重置布局时撤销栈记录错误基线的问题。

## 0.7.0-beta.3 — 2026-11-21

### 首启与隐私

- 首次启动直接露出面板；增加隐私说明门，可选“允许联网功能 / 先离线使用”。
- 未同意联网前阻断外部 HTTP(S)，天气、歌词、更新检查都走 consent；天气可单独关闭联网。
- 热键注册失败时显示托盘提示，不再只在日志里报错。
- 设置 → 关于页可达隐私与第三方说明。

### 组件完整性

- catalog 增加 `sha256`；安装 / 更新下载后校验，不匹配直接拒绝。
- Sill-Components 官方五个可安装包补齐 hash，目录校验器核对包内容。

### 数据可信度

- 系统 / 进程卡在 collector 长时间无样本时显示 `~Ns` 延迟标识，保留旧值但不再伪装实时。

## 0.7.0-beta.2 — 2026-11-20

- Beta/RC 构建启用 pre-release 更新通道，稳定版仍只看 Latest；更新可用链接改为对应 tag。
- 补 PRIVACY.md / THIRD-PARTY.md，设置关于页与 README 可达。
- 补 M1 门禁记录；打包态 soak、设置窗口位置/DPI、稳定版更新隔离验证。

## 0.7.0-beta.1 — 2026-11-20

### 界面

- 时钟、日历、天气、监控环拆成独立卡片，并移到 `Sill-Components` 作为官方可安装组件；新装默认只含 hero / system / processes / media / shelf / todo 六个初始组件，hero 恢复显示；
- 天气地区改为「搜索 + 结果列表 + 常用城市」；支持任意坐标，自动定位增加多源 IP 回退与「重新定位」；
- 进程卡新增 GPU 占用最高的进程（Windows GPU Engine 计数器）；
- 收纳支持把文件 / 文件夹直接拖进卡片；
- 设置重组为 8 组侧边栏（通用 / 外观 / 面板与布局 / 组件 / 数据与监测 / 更新 / 高级 / 关于），顶部搜索可跳转；组件可见性与已安装列表合并，热键、更新、数据目录、.sill 关联各自归位；
- 数据采集按源分频：进程 5s、GPU 3s、媒体 2s、交换区 10s，GPU 进程计数拆到 `gpu-procs.ps1` 单独进程，避免 `Get-Counter` 阻塞主采集循环；
- 漏采不再清空卡片：主进程保留上一份进程 / 网络 / 媒体 / 显存，媒体首次采样前显示「正在连接媒体…」而不是「未在播放」；面板唤出时先推缓存快照；
- 面板最大高度改为工作区高度减 32px（`PANEL_MAX_HEIGHT` 提到 3200）；设置重开恢复上次分组与滚动位置；独立设置窗口记住上次关闭时的位置；
- 面板头部：快捷键移到 Sill 标识右侧，新增「调整布局」入口；自由布局拖动 / 缩放加入边缘与中线吸附、实时辅助线；
- 组件页改为「我的组件 / 组件仓库」折叠分组；仓库默认不加载，展开后才拉取官方目录，内置卡不再混入仓库列表；
- 收纳盒旧快捷方式启动时补齐文件图标；系统卡 RAM 只显示百分比、去掉 CPU 频率；圆形监视组件 CPU 下方改为约略 `GHz`；
- 媒体卡通过宿主 LRCLIB 显示当前歌词行（封面读取仍待接入，`<img>` 槽位已预留）。
- 中文界面里的装饰标题改用英文（`Make it yours.`）；CPU / GPU / RAM 不再翻译；
- 监控环改为官方组件 `sill.rings`：一张卡里的 CPU / GPU / RAM / SWAP 四个独立圆环，Apple 风格渐变、圆角、发光与呼吸动画。
- 展示组件 `analog` / `halo` / `tasks` / `wave` 去掉组件名标题；`halo` 增加 SWAP 并统一 CPU/GPU/RAM 命名；`pnpm dev` 自动清理 `ELECTRON_RUN_AS_NODE`。

### 组件与布局

- 卡片改为容器查询单位：`.card` 自身是 `container-type: inline-size`，Hero 时钟用 `clamp(40px, 26cqw, 100px)`，自由布局拖窄不再裁字；free 卡最小宽度从 120 提到 150。
- 自由布局拖拽改为本地草稿 + 松手提交：拖动 / 缩放不再每个 `pointermove` 都写 `layout.json`；把手改成可聚焦按钮，方向键移动（Shift 加速），`pointercancel` 与卸载时清理监听。
- 移除 React 版 system / processes（`SystemWidget` / `ProcessesWidget` / `useSmoothNumber`）：两张卡只保留 `resources/builtin-widgets/` 里的模板实现，避免双份视觉与功能漂移。
- `system` 模板：补 `SYSTEM` 眉标与约略主频、网络改为「下行 · 上行」读数（不再画会被误读成百分比的进度条）、三条进度条带 `role="progressbar"` / `aria-valuenow`、采集为空时显示「正在采样 / 没有采样数据」。
- `processes` 模板：GPU 只出现一次（头部显存 + GPU 进程列表）、用 `data-sill-repeat` 走宿主增量列表、最多三行、空态区分「正在采样」与「还没有进程数据」。
- 模板宿主把 `lang` 写到 Shadow DOM host：`system` / `processes` 可以用 `:host([lang='zh'])` 接管中文最小字号（原先把 9.5–10px 中文留给系统字体）。
- Hero：天气 `stale` 时降透明度并标「缓存」、长地名截断、加载中不再显示月亮、去掉 `<br>{NBSP}` 占位。
- Media：音量 `-1`（未读上来）显示 `--` 并禁用滑杆、时长补小时位、播放键去掉重复的 `aria-pressed`、滑杆焦点环、暂停时封面不再扫光。
- Todo：勾选 / 编辑 / 新增失败会回滚或还原输入、撤销条出现时自动聚焦、撤销条从 `position:fixed` 收进卡片、短定时器改用 `Set` 防增长、补 `maxLength` 与任务 `title`。
- Shelf：补「快捷方式」标题与计数、删除键在 `:focus-within` 时显形、`busy` 用 `try/finally` 复位、初次加载不再闪空态、网格可滚动、中文名称字号单独放大。

## 0.6.1 — 2026-11-19

- 更新提醒：发现新版本 / 下载完成时弹托盘气泡，点击直接打开设置；
- 面板底部常驻提醒条：发现新版本可直接下载，下载完成可直接重启安装，也可「稍后」；
- 手动检查模式与自动下载模式都覆盖，同一版本不重复弹。

## 0.6.0 — 2026-11-19

首个稳定版组件平台。

### 组件开发

- 模板组件：Shadow DOM 内 HTML/CSS + 可选 `ui/main.js`，提供
  `sill.data / onData / onDispose / command / storage / settings / host`；
- 声明式 DSL：`data-sill-text / i18n / if / repeat / action / meter`；
- 组件设置：`widget.json` 的 `settings` 由宿主渲染表单，值存 `widget-settings/<id>.json`；
- Skins 目录热重载，只重载真正改动的组件；`F12` 打开 DevTools；
- 资源协议 `sill-asset://`，`ui/**` 任意文件；模板页允许 `https:` fetch / 图片 / 字体 / 媒体。

### 安装、信任与分发

- `.sill` 安装 / 卸载，按包内容计算能力档位（static / script / isolated / node）并分级提示；
- `trust.json` 记住确认结果，能力不变不再询问；
- 覆盖式升级，布局槽位保留；
- 从 URL 安装、只读组件目录、手工一键更新；
- 启动后每 6 小时检查组件目录更新（只提示，不自动安装）。

### Web 组件

- 隔离模式（默认，无 Node）：桥 + `sill.storage` + 每个组件独立 partition，网络走 `https:`；
- `trust: "trusted"` 为完整 Node 插件模式。

### 内置组件

- `system` / `processes` 改为随应用发布的模板包，与第三方模板共用渲染路径。

### CLI

- `@heavenlydemon/sill-cli` 0.3.1：`new / validate / pack / dev`，脚手架与宿主共用模板。

### 安装包

- NSIS per-user 安装包 + 绿色版 ZIP；安装版使用 electron-updater；
- Windows 10 / 11 x64，**未签名**（SmartScreen 会提示一次）。

### 已知问题

- 安装包没有代码签名；
- 组件目录默认走 GitHub raw，国内网络可能不稳定，可改 jsDelivr 或自有 CDN；
- 组件包没有签名 / 哈希校验；
- `webview` 尚未迁移到 `WebContentsView`。






