# Sill 开发文档

> **历史规划。** 本文件写于 v0.5.4，里面的 IR / rmskin 方案已被 template 组件模型取代。
> 当前实现看 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)；组件格式看
> [Sill-Components](https://github.com/Enkrid-Rao/sill-components)。

v0.5.4 · 2026-11-17
Electron + TypeScript 的 Windows 桌面组件层：热键唤出的玻璃侧边廊，组件可安装、可写、可导入 rmskin。
前身是 Tide（同名原型 LiquidGlassTodo 仍在运行，互不干扰）。

---

## 0. 变更记录（v0.3 → v0.5.4）

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
| **v0.4.8** 面板形状 → **连续尺寸** | 用户反馈「四种形状太死板」。`panelShape` 换成 `panelWidth` / `panelHeight` / `panelOffsetY`；内侧边 / 底边 / 内下角可直接拖拽，预设降级为起点；列数由实际宽度推导（1 / 2 / 3 列） |
| **v0.4.8** 窗口几何改用 **content bounds** | Windows 会把 1px 边框算进 `getBounds()`，直接用外框尺寸会每次提交长 1px；统一走 `getContentBounds()` / `setContentBounds()`，尺寸不再漂移 |
| **v0.4.8** 媒体卡接传输键与系统音量 | SMTC 负责播放 / 暂停 / 上一首 / 下一首，WASAPI 默认渲染设备负责系统主音量与静音；控制进程只在面板可见时存在 |
| **v0.4.8** 待办卡补动效 | 勾选后 FLIP 落位到已完成区、删除先收合高度、勾选框与删除线连续过渡；排序只发生在渲染层，不写进 `todo.json`（**v0.5.0 已改回原位，不再沉底**） |
| **v0.4.9** 组件宿主先于 IR | `App.tsx` 不再写死五张卡：`WidgetShell` + `WIDGETS` 注册表按 `layout.order` 渲染，组件只消费 `WidgetContext`；新增内置组件不再改 App |
| **v0.4.9** 组件可见性 | `layout.hidden` 记住被隐藏的组件；行为页「组件」可逐个开关。隐藏只影响渲染，顺序与跨列不丢 |
| **v0.5.0** 待办回到「原位状态变化」 | 勾选不再把任务沉到底部（那是之前垂直跳变的来源）；删除改为横向淡出 + 行高收合，加勾选 ripple、模糊淡入。行为对齐 LiquidGlassTodo |
| **v0.5.0** 设置布局加比例约束 | 宽面板的内容列上限 560px；滑杆 420、快捷键 280、尺寸预设 420、预览网格 380；主题/氛围预览改 16:9 / 16:10，不再被拉成细条 |
| **v0.5.0** 独立设置窗口 | `settings.settingsInWindow` 开关；设置页可在独立透明窗口中打开，与面板共享 `useSillSettings` + 主进程广播；窗口打开时暂时降下面板置顶，避免互相遮挡 |
| **v0.5.0** 中文排版 | 中文不再沿用英文的 8.5–10px：面板 `.cap` 11.5、正文 13.5–14、设置说明 10.5、设置标签 10.5–12.5；字距 .17em→.045–.06em，`--ink-faint` .4→.52，中文启用次像素渲染；英文保持原字号 |
| **v0.5.0** 真实天气 | Open-Meteo 当前温度 / WMO 天气 / 最高最低；ipwho.is 自动定位 + 28 城市下拉；天气缓存 `weather.json`，失败保留旧值并重试 |
| **v0.5.0** 点外收起 | 面板可见时用轻量 PowerShell 左键监视器判断外部点击；设置 / 布局编辑 / 托盘点击豁免 |
| **v0.5.0** TODO 对齐 Tide | Open / Closed / All 三段过滤器（计数 + 滑动 thumb）、行内编辑、5 秒撤销 toast、输入框 Esc 取消；勾选仍不重排 |
| **v0.5.0** 组件规范拆分 | 组件 manifest / IR / runtime / sandbox 文档迁到独立 `Sill-Components` 仓库，Sill 只保留宿主实现 |
| **v0.5.0** 绿色版 ZIP | 普通 `win-unpacked` + `portable.flag` 打成 `Sill-<version>-portable-win64.zip`；解压即用，数据落 `Sill-data`，不写安装目录/卸载项 |
| **v0.5.1** 监测刷新 | 主进程按 1/2/3/5s 设置推送快照，快捷键唤出无需点击即可刷新；collector 常驻预热，首帧即有 GPU/网速/进程；丢弃陈旧样本；CPU/内存/GPU/网络读数 560ms 平滑过渡 |
| **v0.5.2** 常驻采集 | collector 启动即预热、面板隐藏不停；网络计数先预热 250ms；唤出后 0.4s 内 GPU/网速/进程即有值，避免每次显示都空一截 |
| **v0.5.3** 设置与自动更新 | 设置页拆成外观 / 面板 / 数据 / 系统 / 通用五段；安装版接 electron-updater，后台下载、重启安装、退出时自动安装；绿色版手动更新 |
| **v0.5.4** 设置内卸载 | 通用页新增「数据与卸载」：显示数据目录、打开文件夹；安装版打开官方 NSIS 卸载器（可带 `--delete-app-data` 删 `%APPDATA%\Sill`），绿色版退出后删整个文件夹（数据在 `Sill-data`，随文件夹一起删） |

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
| npm | `sill`、`@sill` 都是 estrattonbailey 的；`sill-cli` 被 npm 相似度规则拦（撞 `sirv-cli`） | CLI 发 `@heavenlydemon/sill-cli`（已发 0.2.1）；开发期 `pnpm link` 即可 |

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

> **v0.4.9 只完成了「宿主」**（WidgetShell + 注册表 + 可见性），上面五条一条都没开始。
> 宿主让组件不再写死在 App 里，但没有 IR、没有包、没有 Provider——别把宿主当成 M1 完成。

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
| `weather.current` | 15min（失败 30s 重试） | Open-Meteo + ipwho.is（自动定位） |
| `todo.items` | 事件 | `fs.watch` `todo.json` |
| `media.nowPlaying` | 1000 | Windows SMTC |
| `media.transport` | 事件 | SMTC TryTogglePlayPause / SkipNext / SkipPrevious |
| `system.volume` | 4000 | WASAPI 默认渲染设备（`IAudioEndpointVolume`） |

面板隐藏时 `Scheduler` 停止所有 `visibleOnly` provider。

> **v0.4.5 已落地最小实现**：`time`（渲染进程时钟）、`system.cpu` / `system.mem`（主进程 `os`）、
> `system.gpu`（`nvidia-smi`）、`system.net` / `system.processes` / `media.nowPlaying`
> （常驻 `resources/collector.ps1`，2s 一行 JSON）、`todo.items`（`todo.json` + IPC）。
> **v0.4.8** 追加 `media.transport` 与 `system.volume`：独立的 `resources/media-control.ps1`
> 常驻进程（stdin 一行命令 / stdout 一行 JSON），只在面板显示期间存在。
> **v0.5.0** 把 `weather.current` 接成真实 provider：Open-Meteo + ipwho.is 自动定位 / 28 城市选择，
> 缓存 `weather.json`，失败保留旧值并在 30s 后重试。

### 4.5 存储

| 路径 | 内容 |
|---|---|
| `%APPDATA%/Sill/settings.json` | 主题、热键、面板宽高与垂直偏移、语言、天气地区、停靠边与边缘距离、开机自启、自动更新、设置窗口模式 |
| `%APPDATA%/Sill/weather.json` | 最近一次成功的天气快照（城市、温度、高低温、WMO code、时间戳） |
| `%APPDATA%/Sill/todo.json` | 待办（`{id,text,done}`，原子写） |
| `%APPDATA%/Sill/layout.json` | 卡片顺序、跨列与隐藏组件（`{version,order,spans,hidden}`，原子写） |
| `%APPDATA%/Sill/widgets/<id>/` | 组件私有数据（配额 5MB） |
| `%APPDATA%/Sill/packages/<id>@<ver>/` | 已安装组件 |

原子写：临时文件 + rename。

---

## 5. 面板规格

### 5.1 几何

| 项 | 值 |
|---|---|
| 宽度 | 连续 320–1180；预设只是起点：Rail 384 / Compact 420×640 / Board 660×780 / Wide 920×900 |
| 高度 | 0 = 撑满工作区（工作区高 − 80）；否则 420 起，最高同样夹在工作区内 |
| 上 / 下边距 | 40（锚定工作区） |
| 右边距 | 30（设置 0–80 可调） |
| 列数 | 由**实际内容宽度**推导：< ~470 一列、≤ ~700 两列、再宽三列；拖动过程中即时重排 |
| 垂直落点 | 默认居中；拖底边改变高度后按 `panelOffsetY` 记住落点，换屏时夹住 |
| 圆角 | 34 |
| 边框 | 1px `rgba(255,255,255,.135)` |
| 阴影 | `0 26px 64px -26px rgba(0,0,0,.9)`、`0 8px 24px -12px rgba(0,0,0,.55)` |

出现屏：鼠标所在屏。监听 `display-metrics-changed`、`display-added/removed`。
拖拽入口：内侧边（改宽）、底边（改高）、内下角（同时改）；松手才写 `settings.json`。
**几何一律用 content bounds**（`getContentBounds/setContentBounds`）：Windows 的 1px 边框会让外框尺寸每次多 1px。

### 5.2 结构：一条竖向流

```
[品牌行]   mark + sill 字标 ··········· 热键 chip · 主题按钮
[时钟区]   Thursday 12 November
           22:03                       （Instrument Serif Italic 56–100px，随宽度）
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
           [封面] Nightcall / Kavinsky · OutRun
           ▓▓▓▓▓░░░░░░░░░░░░░░░░
           0:42 / 3:21
           ◀  ▶  ▶        🔊 ─────── 42%
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
- 宽过 ~470 后切成 2 列、再宽切 3 列：仍是同一份卡片顺序与跨列，只是 grid 自动落格
- 中文不沿用英文的 8.5–10px：`html[lang='zh']` 下 `.cap` 11.5、正文 13.5–14、设置说明 10.5、
  设置标签 10.5–12.5；字距从 .17em 收到 .045–.06em，`--ink-faint` 从 .4 提到 .52。
  英文排版保持 Instrument Sans 原字号。详见 DEVELOPMENT.md §7.1
- 天气在 Hero 卡：温度 / WMO 天气 / 高低温 / 城市；自动定位只做 IP 粗判（不回退系统定位权限），
  手动地区在设置里选。天气数据由 Open-Meteo 提供。

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
- **跨列**：`spans[id]`，渲染时按当前实际列数夹住（一列时恒为 1）；三列时待办默认独占整行
- **隐藏**：`hidden[id]` 只影响渲染；顺序与跨列保留
- **列数**：不再是形状属性，而是宽度的函数；拖动改宽时自动 1 → 2 → 3 列重排

入口是 Settings → 行为 →「编辑布局」。编辑态下：

- 每张卡右上角有拖动把手、↑ ↓、跨列按钮；整张卡也可以直接拖到另一张卡上交换位置
- 顶部条有 Reset / Done；Esc 先退出编辑，不直接收面板
- 改动即时写入 `layout.json`

> **v0.4.9 已落地**：写死的 `<section class="card">` 换成了 `WidgetShell`，顺序、跨列与拖拽复用同一份
> `layout.json`；下一步才是把 `WidgetDefinition.render()` 换成声明式 IR 的 Compiler。

### 5.6 设置界面

同一种设置，两套排布，**永远铺满面板**：

| 形状 | 排布 |
|---|---|
| 1 列（窄于 620） | 顶部三段 tab + 单列内容 |
| ≥ 620 或独立窗口 | 左侧 152px 竖向导航 + 右侧内容区（内容列上限 560px） |

不做固定宽度浮层：面板尺寸连续可变，直接按实际宽度切换 grid areas，比「居中的小卡片」更贴合空间。
「行为 → 面板尺寸」里同时提供四个预设、宽高滑杆与「撑满高度」开关；拖动边缘是主路径，滑杆是精确落点。
「通用 → 天气」提供地区下拉：自动定位（IP 粗判）或 28 个城市；切换后主进程立即重取天气，
不等 15 分钟刷新周期。

**比例约束**：内容列最大 560；滑杆 420、快捷键 280、尺寸预设 420、主题/氛围网格 380；
预设预览用 16:9、氛围预览 16:10。面板再宽也不会把控件拉成细长条。

### 5.7 组件宿主（v0.4.9）

```
layout.json.order
  → WIDGETS / WIDGET_BY_ID（renderer/widgets/registry.tsx）
  → WidgetShell（卡片容器：网格落位、拖拽、跨列工具）
  → definition.render(WidgetContext)（Hero / System / Processes / Media / Todo）
```

- `WidgetContext` 是组件唯一的数据合同：`language`、`now`、`snapshot`、`todos`、
  `mediaPosition`、`mediaCommand`、待办回调。组件不直接碰 IPC。
- `WidgetDefinition` 声明 `id`、设置里的名字、默认跨列（`spanFor(columns)`）与 render。
  新增内置组件 = 加 definition + i18n + `CARD_IDS`，`App.tsx` 不改。
- 隐藏状态在 `layout.hidden`；行为页「组件」里开关。隐藏的组件仍保留顺序与跨列，重新打开即回到原位。
- 这一层刻意**不是**引擎：没有 IR、没有沙箱、没有包安装。它先把「谁放在哪、显示什么」从 App 里剥出来，
  让 M1 的 IR Compiler 有一个稳定的落点。

### 5.8 独立设置窗口（v0.5.0）

`settings.settingsInWindow`（默认 false）决定设置页的承载方式：

| 值 | 行为 |
|---|---|
| false | 设置仍是面板内的 .cz-sheet 覆盖层，Esc 先关它 |
| true | 点齿轮在独立 BrowserWindow 中打开设置；面板保持可见，主题/尺寸改动实时广播回来 |

- 同一份 renderer 入口，`?settings=1` 切到 `SettingsWindow`；玻璃层复用 `.rail`。
- 两个窗口共用 `useSillSettings`：主进程写盘后广播 `settings:changed` / `layout:changed`，
  所以设置窗口改主题面板即时变，面板拖尺寸设置窗口滑杆即时跟。
- 独立窗口打开期间把面板从 `screen-saver` 层放下来，避免面板变宽后盖住设置窗口；关窗恢复置顶。
- 设置窗口里的「编辑布局」通过 `panel:edit-layout` 关窗、唤出面板并进入布局编辑。
- 窗口是透明无边框的固定尺寸（≤760×820，按工作区夹住），标题栏可拖动；Esc / 右上角关闭。
- 开关本身「下次打开设置时生效」，不会把当前窗口强行搬来搬去。

---

## 6. 组件规范

> **权威规范已拆到独立仓库 `Sill-Components`（<https://github.com/Enkrid-Rao/sill-components>）。**
> 本节只保留 M1 需要的摘要；manifest 字段、IR 节点、runtime API、sandbox、安全和验收清单
> 以该仓库的 `docs/` 与 `spec/widget.schema.json` 为准。Sill 主仓库只保留宿主实现。

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
- 更完整的 manifest / IR / runtime / sandbox 规范在独立 `Sill-Components` 仓库
  （<https://github.com/Enkrid-Rao/sill-components>；本地 `D:\Projects\Sill-Components`）；
  Sill 仓库只保留宿主实现与内置组件

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
├─ apps/desktop/src/{main,preload,renderer}
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

> **现状（v0.5.3）**：安装版用 electron-updater + GitHub provider；`pnpm dist` 生成 `latest.yml` /
> blockmap，release 一起上传。开启自动更新时后台下载，下载完成后可重启安装，退出时也会自动安装；
> 关闭时只手动检查、手动下载。绿色 ZIP 不参与自动更新。

### 11.2 选型

| 项 | 取值 | 理由 |
|---|---|---|
| 打包 | electron-builder + NSIS + 绿色 ZIP | 生态最稳；NSIS 支持 per-user 安装，不需要 UAC；绿色版用普通文件夹 ZIP |
| 更新库 | electron-updater | 直接读 electron-builder 产出的 `latest.yml` |
| 更新源 | GitHub provider | 公开仓库直接用 Releases；setup / `latest.yml` / blockmap 同源 |
| 安装位置 | `%LOCALAPPDATA%\Programs\Sill`（per-user） | 不弹 UAC；与数据目录 `%APPDATA%\Sill` 分开，默认保留主题，设置内卸载可显式清数据 |
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
6. 卸载：安装版从 Sill 设置 → 通用 → 数据与卸载打开官方卸载器；勾选「同时删除用户数据」后
   `%APPDATA%\Sill` 一并删除，不勾选则保留。绿色版设置内卸载后整个文件夹（含 `Sill-data`）消失。

绿色版仍是普通文件夹 ZIP（`win-unpacked` + `portable.flag`），数据在 exe 旁 `Sill-data`；
不写安装目录/注册表卸载项，详见 DEVELOPMENT §6.23 / §6.25。

### 11.7 实现落点

```
apps/desktop/electron-builder.yml      appId com.sill.app、NSIS per-user、publish: generic
apps/desktop/src/main/updater.ts       状态机 + electron-updater 封装（网络：更新检查）
apps/desktop/src/main/uninstall.ts     安装版调官方卸载器、绿色版删文件夹、数据目录
apps/desktop/src/main/ipc.ts           update:get / update:check / update:install / app:uninstall*
apps/desktop/src/preload/index.ts      window.sill.uninstall / getUninstallInfo / openDataFolder
apps/desktop/src/renderer/…            页脚版本号、更新入口、设置页「数据与卸载」
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

