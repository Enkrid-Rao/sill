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














