# Handoff

当前状态以本页为准。规划背景见 [DEVPLAN.md](../DEVPLAN.md)（历史计划）和
[ARCHITECTURE.md](ARCHITECTURE.md)（当前架构）。

- 时间：2026-11-19
- 正式版本：**v0.5.4**（已发布；不含组件平台）
- 当前版本：**0.6.1**（稳定版，组件平台 + 更新提醒）
- 组件规范：[Sill-Components](https://github.com/Enkrid-Rao/sill-components) ·
  写组件先读 [authoring.md](https://github.com/Enkrid-Rao/sill-components/blob/main/docs/authoring.md)

## 已存在

### 桌面壳

- Electron 45 透明窗，左右停靠，`Alt+Q` 唤出，`Esc` / 点外收起，四个预设 + 连续宽高。
- 布局支持流式（拖拽/箭头/跨列）与自由画布（任意 x/y/w/h、拖拽、缩放）；
  新增组件会按当前流式排布自动补 box，数据晚到后只增不减地修正高度。
- 快捷方式收纳盒、真实系统 / 媒体 / 天气 / 待办数据、五段式设置、自动更新、设置内卸载。
- 时钟 / 日历 / 天气 / 监控环拆成独立卡片并移到 `Sill-Components`；新装默认只含 hero / system / processes / media / shelf / todo，hero 显示。
- 收纳支持把文件 / 文件夹直接拖进卡片。
- 设置 → 组件页按「安装 / 开发与文件 / 组件目录 / 面板显示 / 已安装」折叠分组。
- 进程卡读取 GPU Engine 计数器，显示 GPU 占用最高的进程；圆形监控改为一张卡里的 CPU / GPU / RAM / SWAP 四个独立圆环。

### 组件平台（0.6 dev）

- 组件 = 文件夹：`widget.json` + `ui/index.html` + 可选 `style.css` / `main.js` / `ui/**`。
- **模板同页运行**：任意 HTML/SVG/内联样式，`ui/main.js` 在面板页面里执行一次，拿 `sill` / `root`。
- **Skins 目录**：`<userData>/skins/<名字>/` 放进去即用，保存即热重载（只重载改动的组件）。
- **资源协议**：`sill-asset://<id>/ui/...`，HTML/CSS 里的相对路径自动改写。
- **组件存储**：`sill.storage` → `<userData>/widget-data/<id>.json`。
- **组件设置**：`widget.json` 里声明 `settings`，宿主渲染表单；值存 `widget-settings/<id>.json`，
  组件用 `sill.settings` 读。
- **网络**：CSP 允许 `https:` 的 fetch / img / font / media；包内 JS 可 `import()`。
- **调试**：F12 / Ctrl+Shift+I 开 DevTools；`main.js` 同步异常在卡内显示错误条。
- **安装**：`.sill`（zip）+ `.sill` 文件关联；安装提示按能力分档（static / script / isolated /
  node），纯静态组件直接装，确认过的 id 记在 `trust.json`，能力不变不再问。
- **分发**：https 直链安装（设置 → 组件 → 从 URL 安装）与只读组件目录（`catalog.json` 的
  `installable + download`）；打开组件页时对比目录版本，显示「vA → vB」并可一键更新。
  下载后按包内容重新校验。
- **CLI**：`sill new / validate / pack / dev`（npm 0.3.1 已发布）。
- 测试：Vitest（安装器 + provider + 动作 + .sill 参数）+ GitHub Actions。

## 已实际验证

| 项 | 证据 |
|---|---|
| `pnpm typecheck` | 通过 |
| `pnpm test` | 49 个测试通过 |
| `pnpm build` | 通过 |
| `pnpm smoke` | 截图输出正常（0.6.1） |
| 脚手架组件 | `sill new demo` 生成的卡片在面板里正常渲染（本地时间 / 日期 / 存储计数） |
| 错误提示 | `main.js` 抛错时卡片内出现红色错误条 |
| 新建组件 | 设置 → 组件 →「创建…」在 skins 里生成脚手架（单测覆盖；模板与 CLI 共用） |
| 组件诊断 | skins 里 `widget.json` 坏的目录出现在「未加载的组件」并可直接打开（Playwright 截图核对） |
| 信任分级 | 档位计算与 `trust.json` 单测覆盖；设置里显示「静态 / 脚本 / 完整 Node」（Playwright 核对） |
| 组件设置 | `widget.json` 的 `settings` 解析、默认值/范围/select 校验单测覆盖；宿主表单与 `sill.settings.onChange` 实测（选 °F 后组件收到更新） |
| URL / 目录安装 | 本地 HTTP 源实测：URL 与目录条目各装一个静态组件；下载后按包内容校验（单测覆盖 URL 与目录规范化） |
| 组件更新 | 预装 v1.0.0 + 目录 v2.0.0，组件页显示「v1.0.0 → v2.0.0」，点更新后只剩 v2.0.0（实测） |
| 内置模板迁移 | system / processes 从 resources 加载，卡片渲染与数据格式化正常（smoke 截图核对） |
| 后台更新检查 | 启动 20s 后自动检查目录并广播；实测 `count=1`，设置按钮出现小圆点 |
| 独立时钟 / 日历 / 天气 | smoke 截图核对；天气卡按自定义坐标显示 |
| 天气地点搜索 | 搜索 Tokyo 返回 8 条；点选后 `settings.json` 写入 `weatherCustom`，卡片城市变为「東京, 东京都」 |
| GPU 进程 | collector 输出 `gpuProcs`；进程卡显示 electron 12% / System 5% / dwm 3% |
| 组件页分组 | 组件页 4 个折叠组，长度明显缩短（截图核对） |
| 收纳拖放 | `addShelfPaths` 实测把 `notepad.exe` 加入收纳；拖放 UI 走同一 API |
| 组件升级 | 同 id 新版本覆盖旧目录、布局槽位保留（单测覆盖） |
| Web 隔离层 | 非 Node guest 拥有 `sill.storage` 与 `https:` 网络；每个组件独立 partition（实测写入 widget-data） |
| 热重载作用域 | 只改 a 的样式，a 重新执行、b 不重新执行（boot 计数 2 / 1） |
| 自由布局补种 | `boxes:{}` 的 free 布局启动后自动补出全部 box，不再退回 flow |
| 布局高度修正 | 媒体/进程卡在数据到达后自动长高，不再被裁切 |
| 网络（临时放开 CSP 验证） | `fetch` GitHub / Baidu / npmmirror 均 200 且能读 body；远程图片可加载 |
| 多文件 JS | `import('sill-asset://…/lib.js')` 在 `script-src sill-asset:` 下可用 |
| 组件仓库 | `python scripts/validate.py` 通过；CLI `validate` / `pack` 通过 |
| 安装/坏包 | 额外文件、路径穿越、缺 `ui/index.html` 被拒；`ui/**` 任意文件可安装 |

### 液态玻璃（v0.8 实验档，`docs/GLASS.md` §11）

| 项 | 证据 |
|---|---|
| P2 隐藏后抓屏干净 | 探针在 `win.hide()` 后抓整屏，面板所在区域的「品红窗口」像素占比 0.03%（可见时 99.6%）；图见 [liquid-mock.png](media/glass/liquid-mock.png)（合成桌面 + 真抓屏两条链路都验过）与本机 `out/glass-probe/p2b-hidden-*.png` |
| P2 抓屏耗时 | hide 后 4 次 `getSources` 均 ~1.15s（可见时 0.30–0.38s）；异步喂下一次唤出，不阻塞滑入 |
| P2c WDA 可用 | `setContentProtection(true)` 时同一区域占比 0.04% → 窗口能被排除出采集（Phase 3 技术上可行，本轮不用） |
| P3 WebGL2 | ANGLE D3D11 / RTX 4060；`MAX_TEXTURE_SIZE` 16384；854×534 BGRA 上传 2ms |
| 采样坐标正确 | 假桌面四角放 90×90 纯色块，玻璃里分别落在面板四角（未翻转、未偏移）：[probe-coordinates.png](media/glass/probe-coordinates.png) |
| 抓帧链路 | 真实抓屏时 `debug().frame.source === 'desktop'`、`panelX` 与窗口实际位置一致；面板里能看到桌面内容 |
| 回退 | `theme.glassMode = 'film'` 面板回到 v0.7 四层贴膜，`data-glass="film"`：[film-fallback.png](media/glass/film-fallback.png) |
| 动效数值 | 滑入 +140ms 时 `pulse≈1.04 / swell≈1.01 / stretch≈0.15`，+220ms 时 `stretch≈-0.078`（回摆反向），+420ms 收敛；同刻截图 [wobble-on-vs-off.png](media/glass/wobble-on-vs-off.png) |
| 设置页 | 外观页新增「液态玻璃」开关 + 4 个滑杆，关掉即回贴膜 |
| dev 服务器能载入 | installNetworkGate 原本把所有 http(s) 都 cancel，开发服务器的 http://localhost:5173 一起中招（ERR_BLOCKED_BY_CLIENT 白屏）；改为回环地址放行后 pnpm dev 正常起窗 |
| 自检 | `pnpm typecheck` / `pnpm test`（58 个） / `pnpm build` / `pnpm smoke` 全绿，smoke 截图里玻璃是液态档 |

### 实时背景（v0.8.1，`docs/GLASS.md` §12）

| 项 | 证据 |
|---|---|
| 实时流可用 | `getDisplayMedia` 经 `setDisplayMediaRequestHandler` 拿到 2560×1600@≤30fps 的显示器流，`currentTime` 持续推进 |
| 上传成本 | `texImage2D(video)` 中位 0.1ms（10 次采样）；逐帧合成 CPU 提交 0.35ms |
| 背景真的在动 | 面板底下放 60fps 变色窗口，隔 700ms 两张截图：面板内部 80% 像素变化、最大差值 144；[live-motion.png](media/glass/live-motion.png) |
| WDA 排除 | 探针：带标记的窗口在采集里占比 开 0 / 关 12.9% |
| 组件拿不到屏幕 | handler 校验 `request.frame` 属于面板 webContents，否则 `callback({})` |
| 三档可切 | `live` / `frame` / `film`，设置 → 外观 → 液态玻璃；切换会同步开关 WDA 与屏幕流 |
| 自检不受 WDA 影响 | `webContents.capturePage()` 仍然可用，Playwright 截图/冒烟照常 |
| 背景随桌面变化 | 面板底下放纯色窗口，按需改色：红 → 玻璃均值 (111,40,40)；绿 → (32,92,35)；**收起面板期间**改成蓝再唤出 → (37,54,114) |
| 延迟 | 拆开实测（60Hz 屏，1 帧 = 16.7ms）：**capture 18ms ≈ 1 帧** + **ours 3–4ms**；关掉 WGC 反而 24ms，`AllowWgcZeroHz` 无差别 → 已在平台地板附近，见 [GLASS.md §12.5](GLASS.md) |
| 滑入震荡 | `theme.glassWobble` 独立开关，**默认关**；只关 `uPulse` 一族，呼吸 / 折射鼓包 / 掠光不受影响 |
| 快捷方式图标 | pp.getFileIcon() **不解析 .lnk**：五个不同快捷方式返回的 PNG 哈希完全相同（2f637864a2b8，通用白纸）。改为先用 shell.readShortcutLink 读出 .ico / target exe 再取图标；.url 读 IconFile=。实测 DeepDock / 腾讯会议 / Access / 豆包 四个快捷方式哈希互不相同且不再等于通用值。老数据里存着通用图标的快捷方式会在每次启动重取一次 |
| 收纳盒图标不再被裁 | free 布局下卡片高度写死 96px，而一条内容要 55px：.shelf__grid 加了「至少一行」的下限 + 标题行不参与压缩，让溢出露到卡片层；App 侧把「只在补种后长高一次」改成 ResizeObserver + [data-fit] 内部溢出的通用修正。实测卡片 96→108px，图标与名字完整、8 个条目时只在内部滚动、下方卡片按序下推 |
| 滚动不再带动背景 | 「滚动视差」独立开关（`theme.glassScrollFlow`，**默认关**）。实测：滚动 300px 前后，卡片左侧 18px 纯玻璃带的像素 **0.00% 变化**（最大差 1）；打开开关后同一区域 **31% 变化**（最大差 42），内容滚动本身照常（整块画布 47% 变化） |
| 静态帧不再插播 | 实时档在跑时收到的静态帧只入队不换纹理，流断了才顶上 —— 修掉「突然闪一下旧桌面」 |

## 未完成

- 后台自动检查更新 / 目录托管与审核流水线；更新需要打开组件页手动点。升级是覆盖式。
- 签名 / 哈希；安装器只做静态校验 + 权限提示。
- hero / media / shelf / todo 仍是 React；`system` / `processes` 仍随应用发布在 `resources/builtin-widgets/`；
  时钟 / 日历 / 天气 / 监控环 已移到 `Sill-Components`，作为官方可安装包。
- 文档：`DEVPLAN.md` 的 IR / rmskin 章节是历史规划。

## 下一条命令

```powershell
pnpm install
pnpm approve-builds --all
Remove-Item Env:ELECTRON_RUN_AS_NODE
pnpm typecheck
pnpm test
pnpm build
pnpm smoke
```

跑组件：

```powershell
pnpm sill new clock
pnpm sill validate .\clock
pnpm sill pack .\clock -o clock.sill
```

开发循环不需要 CLI：把文件夹放进 `%APPDATA%\Sill\skins\`，设置 → 组件 → 打开文件夹。

## 建议顺序

> 2026-11-20 起的发布与生态战略（含验收标准、风险与判断依据）见
> [RELEASE-STRATEGY.md](RELEASE-STRATEGY.md)；下面是旧的最小行动清单。

1. 后台自动检查更新 + 目录托管 / 审核流水线。
3. 把 system / processes 迁到模板，验证模板能力足够。
4. 签名 / 哈希。
5. `webview` → `WebContentsView` 迁移。














