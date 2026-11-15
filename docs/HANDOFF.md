# Sill 交接文档

写给**接手这个项目的人或下一个会话**。目标：读完这页，你知道现在到底有什么、什么是真的验证过的、
下一条命令该敲什么。

- 交接时间：2026-11-15（v0.5.0 发布：真实天气、点外收起、TODO 过滤 / 编辑 / 撤销之后更新）
- 代码位置：`D:\Projects\Sill`（从旧的 `D:\Projects\Tide` 改名而来，旧路径已不存在）
- 对应规划：[../DEVPLAN.md](../DEVPLAN.md) v0.5.0
- 对应开发文档：[DEVELOPMENT.md](DEVELOPMENT.md)
- 组件规范仓库：[Sill-Components](https://github.com/Enkrid-Rao/sill-components)
- 当前应用版本：**v0.5.0**（`package.json`，已发布）
- 上一提交：**42f1fc5** `feat: 组件宿主、独立设置窗口与中文排版 (v0.4.0)`

---

## 0. 30 秒速览

- 版本 **v0.5.0**，已发 GitHub Release；源码与安装包都在
  [Releases](https://github.com/Enkrid-Rao/sill/releases)
- 已完成：M0 骨架、三页设置、真实数据（system / media / todo / **weather**）、NSIS 安装包、
  **面板连续自由缩放**、**媒体传输键与系统音量**、**待办原位动效**、
  **组件宿主（WidgetShell + 注册表）与逐组件显隐**、**独立设置窗口开关**、
  **中文排版可读性**、**真实天气（自动 IP / 28 城市）**、**点外自动收起**、
  **TODO Open / Closed / All + 编辑 + 撤销**、
  可编辑布局（拖动 / 箭头 / 跨列，落 `layout.json`）
- 未完成：**M1 的 IR 引擎尚未开始**；组件 manifest / IR / sandbox 仍是规范，不是运行能力
- 下一步：`packages/engine` 的 IR + Validator + Compiler + Binder，按
  [Sill-Components](https://github.com/Enkrid-Rao/sill-components) 的 spec 验收
- **真相以 §2 / §3 为准**，别把「代码写了」当成「验证过」

---

## 1. 一句话现状

**M0、设置、真实数据、天气、自由尺寸、媒体控制、点外收起、TODO 过滤/编辑/撤销、组件宿主、独立设置窗口都已跑通；M1 的 IR 引擎一行都没写。**

- 窗口：Electron 透明窗，宽高连续可调（内侧边 / 底边 / 内下角），预设为 Rail 384 / Compact 420×640 /
  Board 660×780 / Wide 920×900；`Alt+Q` 从屏幕外滑入，`Esc` 收起；置顶不可关（设置窗口打开期间临时降层）。
  面板显示时用轻量左键监视器判断点外收起；设置 / 布局编辑 / 托盘点击豁免。
- 设置：外观 / 行为 / 通用三页；热键录制、**面板尺寸（拖拽 + 预设 + 宽高滑杆 + 撑满高度）**、
  停靠边、边缘距离、中英即时切换、**天气地区（自动 / 28 城市）**、自启、更新开关、
  **组件显隐**、**设置页使用独立窗口**。
- 数据：CPU / 内存 / GPU / 网络 / 进程 / SMTC 媒体 / 真实天气 / 可增删改的 `todo.json` 都是真的。
- 天气：Open-Meteo 温度 / WMO 天气 / 高低温；自动定位走 ipwho.is 的 IP 粗判，失败回退上海；
  天气缓存 `weather.json`，失败保留旧值并 30s 重试。
- 媒体：播放 / 暂停 / 上一首 / 下一首（SMTC）、系统音量与静音（WASAPI）；控制进程只在面板可见时存在。
- 组件：`WidgetShell` + `WIDGETS` 注册表，App 只按 `layout.order` 查表渲染；hero/system/processes/media/todo
  各自是独立 definition，隐藏状态存 `layout.hidden`。
- 待办：任务**留在插入位置**，勾选不换位；删除是横向淡出 + 行高收合，无 translateY；新增是模糊淡入。
  **Open / Closed / All** 三段过滤器、行内编辑、5 秒撤销；输入框 Esc 取消不再误收面板。
- 中文：`html[lang='zh']` 单独放大字号、收紧字距、提高对比度并恢复 Windows 次像素渲染；
  面板正文 13.5–14px、设置说明 10.5px，英文仍用 Instrument Sans 原字号。
- 布局：列数由实际宽度推导（1 / 2 / 3 列）；卡片是 CSS grid 落格，头图横跨整行，三列时待办独占整行。
- 布局编辑：编辑态下可拖动 / ↑↓ 换位、设跨列；顺序、跨列与隐藏存 `layout.json`，Esc 先退出编辑。
- 组件规范：独立 `Sill-Components` 仓库（manifest / IR / runtime / sandbox / examples），
  但引擎与 CLI 尚未实现。
- 发布：`pnpm dist` 出 NSIS 安装包；**v0.5.0 是当前已发布版本**（上一发布是 v0.1.3）。

---

## 2. M0 十条验收：逐条状态

对照 DEVPLAN §3.1。**「已验证」= 我实际跑过并看到结果；「未验证」= 代码写了但从没跑过。**

| # | 验收项 | 状态 | 依据 / 缺什么 |
|---|---|---|---|
| 1 | `pnpm dev` 起主进程 + 面板，renderer 热更新 | ⚠️ 部分验证 | v0.4.2 跑过：main/preload/renderer 均构建成功，Vite 起在 5173，Electron 启动；`src/shared/theme.ts` 在 dev 下被 Vite 正确加载（HTTP 200）。**HMR 与「面板真能唤出」没验证**——本次 `Alt+Q` 被其他程序占用，只能托盘唤出 |
| 2 | `Alt+Q` 唤出 / 再按收起，220ms 不卡帧 | ⚠️ 代码在，未验证 | smoke 模式**跳过**热键注册；动画流畅度没人看过 |
| 3 | 按 §5.1 几何出现在鼠标所在屏，换屏/改分辨率自动重算 | ⚠️ 几何已验证，重算未验证 | `settings.json` 的 `panelWidth:384 / edgeGap:30` 与窗口 bounds `x=1293, y=66, 385×962` 吻合；`display-metrics-changed` 分支没跑过 |
| 4 | 托盘菜单：显示/隐藏、设置、退出 | ⚠️ 代码在，未验证 | smoke 跳过托盘；菜单实际是「显示/隐藏 · 从左侧滑出 · 开机自启 · 打开设置文件 · 退出」，**没有「设置」项**，也没有置顶（置顶已改为不可关） |
| 5 | 单实例：第二次启动唤出已有实例 | ❌ 未验证 | `requestSingleInstanceLock` 写了，没启动过两次 |
| 6 | 开机自启可开关，写注册表 | ❌ 未验证 | 代码在；`HKCU\...\Run` 下当前**没有** sill 相关键（从未开启过）。键名预期是 `Sill` 而非 DEVPLAN 写的 `com.sill.app`，见 §6 |
| 7 | 设置原子写，损坏回落默认 | ✅ 已验证（写）/ ❌ 未验证（损坏回落） | 文件真的生成了且内容正确；「损坏回落」只做了代码审查 |
| 8 | 崩溃自动重载一次，连续两次降级 | ⚠️ 只做了重载 | `render-process-gone → reload()`，**没有**「连续两次降级为纯色」逻辑 |
| 9 | 空面板能显示一块玻璃 | ✅ 已验证 | `docs/media/m0-panel.png` 就是它（v0.4.2 已按新玻璃重拍） |
| 10 | Customize 能改主题并落盘，Esc 先关覆盖层 | ✅ 已验证 | CDP 实跑：点预设 → `settings.json` 的 `theme` 立即变化；开关 Grain → `--grain-k` 归零；第一次 Esc 关 Customize、第二次收面板；`pnpm build` / `--smoke` 均通过 |

**结论：M0 还不能打勾。** 第 2、4、5、6 条必须人肉跑一遍，第 1 条还差 HMR 与唤出；
第 10 条是新加的主题验收，已实跑。
**v0.4.8 的自由尺寸、媒体控制、待办动效不在 M0 表里**，对应的验证见 §3。
**v0.4.9 的组件宿主与显隐也不在 M0 表里**；它是 M1 的前置，不是 M1 完成。
**v0.5.0 的天气 / 点外收起 / TODO 过滤编辑撤销同样不在 M0 表里**；见 §3 的对应行。

---

## 3. 已经验证过的事实（可直接引用）

| 事实 | 怎么验的 |
|---|---|
| 依赖能装、能构建 | `pnpm install` → `pnpm build` 成功，产物 `out/{main,preload,renderer}` |
| 类型全过 | `pnpm typecheck`（两套 tsconfig）零报错 |
| Electron 45.3.1 运行时可用 | `dist/electron.exe` 存在，`--smoke` 能起窗口并截图 |
| 面板渲染正确 | `docs/media/panel-preview.webp`：卡片、真实系统 / 媒体 / 待办、条形指标、页脚；M0 时期的旧截图是 `docs/media/m0-panel.png` |
| 主题系统可用 | Customize → 点预设 / 拖滑杆立即改 `--hue` `--accent-h` `--atmo-k`；220ms 防抖后写入 `settings.theme`；重启面板主题仍在 |
| userData 路径正确 | `%APPDATA%\Sill\settings.json` 生成，内容 `hotkey: "Alt+Q" / panelWidth: 384 / side: "right"` |
| 原子写与 coerce 生效 | 同上，落盘的是收敛后的合法值 |
| 屏幕环境 | 工作区约 **1707 × 1067 逻辑像素**（2560×1600 @150%），默认面板 384 × 962，DPR 1.5；会话后段屏幕变成 **1464 × 720**，面板自动缩到 384 × 614，说明 workArea 计算生效 |
| 自由尺寸能跑 | Playwright 合成 PointerEvent：内侧边拖拽 384 → 660 → 920，列数 1 → 2 → 3；底边拖拽 962 → 762，重开后 y 保持、高度不变；`settings.json` 落 `panelWidth/panelHeight/panelOffsetY` |
| 尺寸不漂移 | 窗口几何改用 `getContentBounds/setContentBounds` 后，连续拖拽/重开宽度稳定在 384（此前每次会 +1px） |
| 设置里的尺寸控件 | 行为页：宽度滑杆 384→800、关掉「撑满高度」后高度 962→700、预设「宽屏」→ 920×900、恢复默认→384×962，全部即时生效并落盘 |
| 媒体控制可用 | `media-control.ps1` 独立 stdin/stdout 测试：get / volume / mute / playpause 返回 JSON；UI 点击播放→暂停、静音→取消、音量键 42→45（已恢复 42）；IPC 返回 `ok:true` |
| 待办动效可用 | Playwright 在 384×962 面板、数据稳定后逐帧量 `getBoundingClientRect().top`：勾选后三条任务的 top 完全不变（777.1 / 813.4 / 849.7，`scrollTop` 56）；删除中间/最后/第一条时被删行 top 保持、行高 24.3 → 2.7 收合、其余行只平滑上移，`scrollTop` 与 addrow 的 top 都保持不变；无 translateY、无页面报错 |
| 设置比例正常 | 宽面板 920：内容列 560、滑杆 420、快捷键 280、尺寸预设 420、预览网格 380；主题/氛围预览 16:9 / 16:10（实测 83×47，ratio 1.78）；窄面板 384 时控件仍取满 343，不被压扁 |
| 组件宿主可用 | Playwright：5 张卡全部由注册表渲染；隐藏 processes → 4 张卡，收起/重开面板仍是 4 张；再打开 → 5 张；全部隐藏 → 0 张卡 + 空状态提示；`layout.hidden` 落盘，非法 id 会被 `normalizeLayout` 过滤 |
| 布局编辑未回归 | WidgetShell 下三列：待办跨列 3→1 即时生效、媒体上移改变 `layout.order`、Done 退出编辑；无页面报错 |
| 独立设置窗口可用 | Playwright：通用页开关 → 点齿轮打开 764×824 的独立窗口（`?settings=1`）；Esc 与右上角 X 都能关窗并保留面板；窗口内改宽度/高度 700 后面板即时变；在窗口里换主题，面板 `--hue` 同步变化；窗口里「编辑布局」会关窗并把面板切到布局编辑态 |
| 置顶临时让位 | 设置窗口打开期间面板 `alwaysOnTop=false`，关闭后恢复 `screen-saver` 层；避免面板变宽后盖住设置窗口 |
| 中文排版可读 | 用 `getComputedStyle` 在 zh/en 两种语言下核对：中文 `.cap` 11.5px/500/字距 .045em、`.task` 14px/20.3px 行高、`.sub` 13.5px、设置标签 10.5px、设置说明 10.5px、设置标题 24px；切回 en 后全部回到 10 / 13.5 / 9 / 8.5 / 25px 原值。384 宽中文面板截图无发虚，内容超出时按设计滚动 |
| 中文窗口一致 | 独立设置窗口实测：`.cz-title` 24px、`.cz-tab` 12px、`.cz-setrow__name` 12.5px、`.cz-setrow__note` 10.5px、`.cz-foot` 10.5px；窗口标题为「Sill 设置」；与面板共用同一套 `html[lang='zh']` 覆盖 |
| 真实天气可用 | Playwright 等首帧后读 `snapshot.weather`：自动定位返回深圳 26° / 局部多云 / 高 26° 低 19°（不同网络出口返回过西安 9° / 毛毛雨，说明 IP 定位确实在变）；设置里 `#cz-weather-location` 有 28 个选项，切北京后 10° / 阴 / 高 11° 低 4°，`cityId=beijing`；`weather.json` 写入成功 |
| 点外收起可用 | OS 级 `mouse_event` 点击：点面板内部面板保持；打开设置覆盖层后点外部仍保持；关掉覆盖层再点外部面板收起；打开独立设置窗口点外部保持；17 秒不点击面板保持。点击监视器只在面板可见时存在，隐藏后进程退出 |
| TODO 过滤/编辑/撤销 | Playwright + DOM 点击：Open 3 → 勾选后 2（留 360ms 再收起）→ Closed 1 → All 3；行内编辑保存为「编辑测试任务」；删除后 700ms 出现「待办已删除 / 撤销」toast，点撤销恢复 3 条；无页面报错 |
| TODO 输入框 Esc | Playwright：addrow 输入 draft 后 Esc → 值清空、面板仍在；编辑输入后 Esc → 输入框消失、原文不变、面板仍在 |
| 组件规范仓库 | `D:\Projects\Sill-Components` 已同步到 [GitHub](https://github.com/Enkrid-Rao/sill-components)，标签 `v0.1.0`；clock / counter 两个 manifest 通过 `spec/widget.schema.json` 校验 |
| 打包态能跑 | 装完的 `Sill.exe --smoke` exit 0，截图写 `%APPDATA%\Sill\smoke.png`，画面与 dev 一致；托盘图标从 asar 外的 `resources\resources\` 加载（stderr 无「图标为空」） |
| 真实数据能跑 | `collector.ps1` 独立运行每 2s 输出一行 JSON；应用内快照含 CPU/内存、GPU 30%、网络速率、TOP 进程、SMTC 媒体（张惠妹《忘记》），截图已核 |
| 待办可写 | 临时 profile 下 `todo.json` 自动生成；通过 IPC add / toggle 后落盘为 `done: true` |
| 更新检查 | 手动检查走公开 GitHub Release API；v0.5.0 发布后返回 latest，设置页显示「已是最新」；不下载、不安装 |

---

## 4. 阻塞与风险

### 4.1 没有阻塞

代码能装、能构建、能跑。下面都是**未验证**，不是坏的。

### 4.2 七条真实风险

1. **透明窗口逐帧 `setContentBounds` 可能有闪烁/撕裂**（Windows 合成器行为不一）。如果滑入手感不好，
   备选方案：改成窗口不动、内容 `scale(0.985)` + 淡入（会牺牲"从屏幕边滑出来"的观感）。
   这是已知的设计取舍点，见 DEVELOPMENT.md §6.2。
2. **Esc 全局接管期间会吞掉其他程序的 Esc**。面板是瞬态浮层，可接受；如果用户抱怨，
   改回"面板抢焦点 + 窗口内监听 keydown"。
3. **`pnpm dev` 的 HMR 没验证过**。v0.4.2 已确认 dev 模式能构建、启动、用 Vite 正常加载
   renderer 与 `src/shared/theme.ts`；但热更新本身与「唤出面板」还没人看过——本机 `Alt+Q`
   被别的程序占用，需要换键或在干净环境再试。
4. **真实鼠标拖拽边缘没在解锁桌面上验过**。自动化测试时机会话处于锁屏（`WindowFromPoint`
   命中 `LockApp`），只能用合成 PointerEvent 验证逻辑；下次坐在解锁的机器前，手动拖一下
   内侧边、底边和内下角，确认 pointer capture 与光标反馈。
5. **独立设置窗口打开期间面板临时失去置顶**（否则面板变宽会盖住设置窗）。关闭设置窗后
   `restorePanelTop()` 恢复 `screen-saver`；如果用户希望面板始终压在最上层，这条需要重新权衡。
6. **面板可见时最多三个 PowerShell 进程**：collector、media-control、mouse-watch。
   mouse-watch 是 40ms 轮询 `GetAsyncKeyState`，不是全局钩子；极快的点击（<40ms）可能漏判，
   但不消费用户的点击。进程都在面板隐藏后退出；如果以后常驻组件变多，需要合并采集/控制/点击监视。
7. **天气依赖外部网络**：Open-Meteo 与 ipwho.is 都是直连；IP 定位只到城市级，VPN/代理会改变结果，
   失败时回退上海。没有系统定位权限、也没有高精度坐标；离线时保留最后一次缓存（`weather.json`），
   首次无缓存会显示「天气暂不可用」，30s 后重试。

---

## 5. 下一步（按顺序，别跳）

> v0.4.2 额外落了一件不在原 M0 清单里的事：面板内主题系统（Customize）。它不改变下面的顺序，
> 第 10 条验收已实跑。**继续先按第 1 步把 M0 剩下五条跑完，再进 M0.5（安装包 + 自动更新），最后才是 M1。**
> v0.4.3 把发布通道从 M6 提前成 M0.5，规格见 DEVPLAN §11——理由很简单：更新器会反过来改安装目录、
> 托盘和退出路径，等引擎写完再补就是返工。
> **v0.4.8 / 应用 v0.2.0** 先把「空间」这条用户反馈消化掉：面板连续缩放、媒体控制、待办动效。
> **v0.4.9 / 应用 v0.3.0** 把写死的卡片换成 `WidgetShell` + 注册表，并加了逐组件显隐。
> **v0.5.0 / 应用 v0.4.0** 修掉待办的垂直跳变、给设置布局加比例上限、加独立设置窗口，
> 并把中文从英文 8.5–10px 的小字里拆出来单独排版。
> **v0.5.0 / 应用 v0.5.0（当前工作区）** 接真实天气、点外收起、TODO 过滤 / 编辑 / 撤销，
> 并把组件 manifest / IR / sandbox 规范拆到 `Sill-Components`。
> 它不改变顺序；下一版才是 M1 的 IR 引擎——宿主只解决了「谁放在哪」，还没解决「组件怎么描述自己」。

### 第 1 步：把 M0 剩下五条跑一遍（约 30 分钟）
```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE      # 必须，否则 electron 以纯 node 跑
cd D:\Projects\Sill
pnpm dev
```

逐条确认：热键唤出/收起 → 滑入手感 → 托盘菜单 → 关掉再启动一次看单实例 → 托盘开自启后查
`HKCU:\Software\Microsoft\Windows\CurrentVersion\Run` 的键名（顺手订正 DEVPLAN §2）。
有问题的直接改 `apps/desktop/src/main/panel.ts` 或 `tray.ts`，改完更新 DEVELOPMENT.md 的排错表。

### 第 2 步：补 M0 剩下两个缺口（约 1 小时）

- **崩溃降级**：`panel.ts` 里给 `render-process-gone` 加计数，第二次崩溃时 `loadURL` 一个
  内置的纯色兜底页（`renderer/fallback.html`），并在托盘提示。
- **设置项对齐**：DEVPLAN §3.1 第 4 条要求托盘有「设置」。现在面板里已有完整 Settings，
  托盘暂时保留「打开设置文件」作为调试入口；M2 再换成直接打开设置页，并在 DEVPLAN 里改说法。

### 第 3 步：M0.5 发布通道（2–3 天，规格见 DEVPLAN §11）

M0 打勾后先做安装包与自动更新，别直接进引擎。顺序：

1. `apps/desktop/electron-builder.yml` + `pnpm dist`：先只出 NSIS 安装包，能装、能启动、开始菜单有图标
2. `src/main/updater.ts`：`app.isPackaged` 门控 + 状态机；托盘加「检查更新」；页脚留更新入口
3. 本地 feed 干跑 0.1.0 → 0.1.1，把 §11.6 的五条验收跑完（含断网、坏 sha512、dev 不发请求）
4. 更新源定了（§12 第 6 条）再发第一个真版本

**进度（2026-11-13）**：第 1 条已完成——安装包能出、能装、打包态 smoke 通过、托盘图标正常；
第 2–4 条未做。打包时的镜像变量见 DEVELOPMENT.md §3.5，不设必失败。

### 第 4 步：才进 M1（组件引擎）

M1 的验收标准在 DEVPLAN §3.2，最关键那条是：**用一个没为它写过特例的组件（比如 B 站粉丝数）
只靠 `widget.json + layout.json` 跑通**。做不到就说明引擎还是给内置组件开的特例。

建议的落地顺序：
1. `packages/engine`：IR 类型 + Validator（先不 Compiler）
2. `Compiler`：IR → React 元素树（v1 只有 `vstack/hstack/overlay/text/bar/ring/divider`）
3. `packages/data`：Provider 接口 + `time.now` + `system.cpu`（先用假的也行）
4. `Binder`：字段访问 + `format`，先不做 `Patcher` 差量更新（整棵重渲染够用）
5. 把 `widgets/HeroWidget.tsx` 换成声明式版本作为第一个真实组件；`WidgetShell` 继续当容器，
   非声明式组件（media/todo）保留为手写实现

**不要**把 `WidgetShell` 当成引擎：它认识 `CardId`、直接 import 了五个组件，没有任何 IR / 沙箱 /
包边界。M1 验收里的「无特例组件」它一条都过不了。

---

## 6. 与 DEVPLAN 的偏离（已在 v0.4.1 回写，这里留档）

| 项 | DEVPLAN 原写法 | 实际实现 | 处理 |
|---|---|---|---|
| 面板动效 | 内容 `translateX(24px)` + 淡入 | **移动窗口本身**，内容不位移（避免玻璃被窗口边界裁切） | 已改文档 |
| 自启注册表键 | `com.sill.app` | `app.setLoginItemSettings` 写的是 `<app name>`，即 `Sill`；`com.sill.app` 是 AppUserModelId | 已改文档，实跑后再核 |
| M0 验收第 4 条 | 托盘有「设置」 | 没有设置 UI，只有「打开设置文件」 | 已改文档 |
| 玻璃底图 | §5.4 写的预烘焙 `atmosphere.jpg` 单图 | 现在是「颜色网格 + 去色 grain 纹理 + 顶光 + rim」四层，颜色由 token 推导 | v0.4.2 已改文档 |
| M0 验收条数 | 9 条 | 新增第 10 条（主题面板），因为这一轮把主题做成了 M0 的一部分 | v0.4.2 已改文档 |
| 面板尺寸 | §5.1 四种形状预设 | v0.4.8 改成连续 `panelWidth` / `panelHeight` / `panelOffsetY`，预设只是起点 | 已改文档 |
| 窗口几何 | `getBounds/setBounds` | v0.4.8 统一 `getContentBounds/setContentBounds`（外框会把 1px 边框算进去，导致尺寸漂移） | 已改文档 |
| 媒体音量 | 未写进原规格 | SMTC 只做传输键；音量/静音走 WASAPI 系统主音量，不是应用内音量 | 已写进 DEVPLAN §4.4 |
| 待办排序 | `todo.json` 只存顺序 | **v0.5.0 起不再把已完成项沉底**：任务留在插入位置，勾选只改状态；删除是横向淡出 + 行高收合 | 已改 DEVPLAN §0 |
| M1 落地顺序 | 先 IR 引擎，再把卡片搬出去 | v0.4.9 反过来：先把五张卡剥成 `WidgetShell` + 注册表，再接 IR | 已写进 DEVPLAN §5.7 |
| 设置布局 | 旧的 `.cz-body` 满宽 | v0.5.0 宽面板内容列上限 560，滑杆/快捷键/预览各自有最大宽度；宽切换点 620 | 已写进 DEVPLAN §5.6 |
| 设置窗口 | 只有面板内覆盖层 | v0.5.0 增加 `settingsInWindow`；独立窗口与面板共享设置状态，打开期间面板临时降层 | 已写进 DEVPLAN §5.8 |
| 置顶不可关 | 面板恒在 `screen-saver` 层 | 独立设置窗口打开期间临时降层，关闭立即恢复；其余时间不变 | 已写进 DEVPLAN §5.8 / 决策 #11 |
| 中文字号 | 中文沿用英文的 8.5–10px，发虚 | v0.5.0 增加 `html[lang='zh']` 覆盖：最小说明 10.5、正文 13.5–14；英文保持原字号 | 已写进 DEVPLAN §5.2 / DEVELOPMENT §7.1 |
| 天气 provider | §4.4 计划 Nominatim + Open-Meteo | v0.5.0 用 ipwho.is 做 IP 粗定位 + 28 城市手动选择；Open-Meteo 取天气；不做系统定位权限 | 已写进 DEVPLAN §4.4 / 5.6 |
| 点外收起 | 原决策 #4 只列热键 / Esc / 托盘 | v0.5.0 增加鼠标左键监视器；设置 / 布局编辑 / 托盘点击豁免 | 已写进 DEVPLAN §5.2 / 决策 #4 |
| TODO 交互 | 只有增删勾选 + 原位动效 | v0.5.0 增加 Open / Closed / All、行内编辑、5 秒撤销、输入框 Esc 取消 | 已写进 DEVPLAN §5.2 / DEVELOPMENT §6.21 |
| 组件规范位置 | 全部写在 DEVPLAN §6 | 规范 / 示例拆到独立 `Sill-Components` 仓库；Sill 只留宿主与内置组件 | 已写进 DEVPLAN §6.5 |

---

## 7. 决策台账

**已定，不要重开：**

1. 名字 **Sill**（理由见 DEVPLAN §2：能当动词、能当后缀、能当命名空间、不是材质词）
2. 面板形态 **C 侧边廊**（对比页 `docs/mockups/panel-forms.html`，四选一后定的）
3. 默认热键 **Alt+Q**（`Alt+W` 在编辑器里是关闭标签）
4. 唤出**不抢焦点**；收起入口：热键 / Esc / 托盘 / **点击面板外部**（设置或布局编辑打开时除外）
5. 面板 = 窗口，动窗口不动内容
6. 玻璃只有**一种材质**（四层静态、无 `backdrop-filter`）；颜色、氛围、顶光、颗粒通过 7 个 token
   主题化，存在 `settings.theme` —— 可变的是配方参数，不是材质
7. IR v1 不做 `grid`、不做绝对定位
8. rmskin 先做 T3 桥接，T1 转换往后放
9. 自动更新是硬需求：M0.5 用 electron-builder NSIS（per-user）+ electron-updater 打通，
   更新源用 generic provider，**下载完成只提示、不自动重启**（DEVPLAN §11）
10. 默认玻璃**无色相**（Clear）；Settings 三页分类；停靠位置**锚定侧边**、不存坐标；
    每个分区一张玻璃卡片（将来就是 widget 容器）
11. **置顶不可关**：面板必须恒在 `screen-saver` 层，否则热键唤出会被其他窗口压住。
    唯一例外：独立设置窗口打开期间临时降层，关窗立即恢复（DEVPLAN §5.8）
12. 真实数据的最小实现：system / media / todo / weather 走主进程采集 + IPC；天气不再是占位
13. 更新只做「检查」：查 GitHub Release 并在设置里显示状态，不下载、不安装（安装留给 M0.5）
14. **宽度不再是离散形状**：`panelWidth` 320–1180 连续可调，`panelHeight` 0 = 撑满工作区；
    Rail 384 / Compact 420×640 / Board 660×780 / Wide 920×900 只是四个起点
15. 响应式用 **CSS grid + 宽度函数**：列数由 `columnsForWidth(width)` 推导（约 470 起 2 列、700 起 3 列）；
    三列时待办默认独占整行，跨列仍可编辑
16. 布局编辑：顺序**全局共享**（flex/grid `order`），跨列**按当前列数夹住**，隐藏只过滤渲染；
    三者都存在 `layout.json`。拖动采用「拖到另一张卡上就交换位置」，不做插入占位
17. 面板几何一律用 **content bounds**；`panelOffsetY` 记住拖底边后的垂直落点，换屏时夹在工作区内
18. 媒体控制：传输键走 SMTC（作用在真正持有会话的应用上），音量走 WASAPI 系统主音量；
    控制进程只在面板可见时存在，隐藏即退出
19. 待办**按插入顺序留在原位**，勾选不重排；删除只做横向淡出 + 行高收合，绝不 translateY。
    `todo.json` 只存数据顺序
20. 组件宿主先于 IR：`WidgetShell` 只负责落位 / 拖拽 / 跨列，组件由 `WIDGETS` 注册表提供；
    IR 引擎必须是 `packages/engine` 的独立层，**不要**把语法塞进 registry
21. 设置页可以独立窗口承载：`settingsInWindow` 开关、下次打开生效；两窗口共享 `useSillSettings`
    + 主进程广播；独立窗口打开期间面板临时 `alwaysOnTop=false`，关窗恢复
22. 设置布局有比例上限：宽面板内容列 560、滑杆 420、快捷键 280、尺寸预设 420、预览网格 380；
    预览用 16:9 / 16:10，不允许无限拉伸
23. 中文排版不能沿用英文小字：`html[lang='zh']` 单独放大字号（最小说明 10.5px、正文 13.5–14px）、
    收紧字距、提高 `--ink-dim/faint` 对比度，并恢复 Windows 次像素渲染；英文保持原字号
24. 天气：Open-Meteo 做数据，ipwho.is 做自动定位（IP 粗判，不用系统定位权限）；
    手动地区是 28 城市下拉；缓存 + 失败保留 + 30s 重试；数据归属写进设置页
25. 点外收起：用 40ms `GetAsyncKeyState` 轮询，不装全局钩子；用 Electron DIP 坐标判断；
    设置 / 布局编辑 / 独立设置窗 / 托盘图标点击都豁免
26. TODO 交互对齐 LiquidGlassTodo：Open / Closed / All 过滤（计数 + 滑动 thumb）、
    行内编辑、5 秒撤销、输入框 Esc 取消；任务仍不重排、删除不 translateY
27. 组件开发规范独立成 repo：Sill 只保留宿主的 `WidgetShell` / registry / 数据 provider；
    引擎、CLI、sandbox 以 `Sill-Components` 的 spec 为准

**还开着（等用户拍板）：**

1. 侧边廊固定在右还是允许切左 —— **代码里已支持** `side: 'right' | 'left'`，托盘可切，默认右
2. LiquidGlassTodo 合并成内置 `sill.todo` 还是保持独立
3. 面板要不要「钉住」模式（不自动收起）
4. 更新源放哪：公开 GitHub Releases 还是自建/OSS —— 现为公开 GitHub Releases
5. 组件规范的版本策略：目前是 `v0.1.0` spec；引擎实现后再决定是否随 Sill 版本同步

---

## 8. 新会话怎么接上

给下一个会话（人或 agent）的最小启动包：

**先读三个文件，按这个顺序：**

1. `DEVPLAN.md` —— 要做成什么（§0 是变更记录，能最快看出当前状态）
2. `docs/DEVELOPMENT.md` —— 环境与坑（**§3 和 §8 必读**，否则会在安装上浪费半小时）
3. 本文 §2 —— 别把"代码写了"当成"功能好了"

**先跑三条命令确认底座没坏：**

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE
cd D:\Projects\Sill
pnpm typecheck          # 应为零报错
pnpm build              # 应生成 apps/desktop/out
pnpm smoke              # 应写出 apps/desktop/out/smoke.png
```

**然后照 §5 的顺序做。** 第一条就是"把 M0 剩下五条跑一遍"，别跳过它直接写引擎 ——
M1 会用到面板窗口，窗口行为没验证过，M1 的 bug 会分不清是引擎的还是窗口的。

**接手时请保持一条纪律：** 改了 `DEVPLAN.md` 里的任何规格，同步改本文 §6 的偏离表；
改了代码行为，同步改 `DEVELOPMENT.md` 的「已知问题」。文档落后于代码，比没有文档更坏。

---

## 9. 环境备忘（这台机器）

| 项 | 值 |
|---|---|
| 代理 | `http://127.0.0.1:7898`（Clash Verge mixed-port）；npm 走代理，`NO_PROXY` 放 localhost |
| Electron 镜像 | `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`（官方 GitHub 常被 reset） |
| 必须清掉的环境变量 | `ELECTRON_RUN_AS_NODE`（DSH 的 Electron 宿主会注入 `1`） |
| 数据目录 | `%APPDATA%\Sill\`（不含旧的 `%APPDATA%\Tide\`，那是 LiquidGlassTodo 原型的，别动） |
| 原型 | `D:\Projects\LiquidGlassTodo`，仍是可运行的 TODO 应用，玻璃配方的原始出处 |
| 字体 | Instrument Serif / Instrument Sans（OFL），已随仓库带在 renderer/assets |
