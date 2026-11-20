# Changelog

## 未发布

### 界面

- 时钟、日历、天气、监控环拆成独立卡片，并移到 `Sill-Components` 作为官方可安装组件；新装默认只含 hero / system / processes / media / shelf / todo 六个初始组件，hero 恢复显示；
- 天气地区改为「搜索 + 结果列表 + 常用城市」；支持任意坐标，自动定位增加多源 IP 回退与「重新定位」；
- 进程卡新增 GPU 占用最高的进程（Windows GPU Engine 计数器）；
- 收纳支持把文件 / 文件夹直接拖进卡片；
- 设置 → 组件页按安装、开发、目录、显示、已安装折叠分组，不再越加越长；
- 中文界面里的装饰标题改用英文（`Make it yours.`）；CPU / GPU / RAM 不再翻译；
- 监控环改为官方组件 `sill.rings`：一张卡里的 CPU / GPU / RAM / SWAP 四个独立圆环，Apple 风格渐变、圆角、发光与呼吸动画。
- 展示组件 `analog` / `halo` / `tasks` / `wave` 去掉组件名标题；`halo` 增加 SWAP 并统一 CPU/GPU/RAM 命名；`pnpm dev` 自动清理 `ELECTRON_RUN_AS_NODE`。

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






