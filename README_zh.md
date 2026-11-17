# Sill

![Platform](https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-0078D4?style=flat-square)
![Electron](https://img.shields.io/badge/electron-45-47848F?style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square)
![Milestone](https://img.shields.io/badge/milestone-M0.5%20%C2%B7%20installer-F2A33C?style=flat-square)
[![Release](https://img.shields.io/badge/release-v0.5.3-2EA043?style=flat-square)](https://github.com/Enkrid-Rao/sill/releases)

Windows 桌面上的玻璃侧边廊：热键唤出，停靠在屏幕边缘，用来承载可安装的组件——将来还要吃下 Rainmeter 皮肤。

[English](README.md) · **中文**

<table>
  <tr>
    <td align="center"><img src="docs/media/panel-preview.webp" width="320" alt="Sill 面板"><br>
      <sub>侧边廊：系统、媒体、待办的真实数据，同一块玻璃</sub></td>
    <td align="center"><img src="docs/media/settings-preview.webp" width="320" alt="Sill 设置"><br>
      <sub>设置：外观 / 行为 / 通用</sub></td>
  </tr>
</table>

## 现在到哪了

- **M0 骨架——已完成。** 真的 Electron 透明窗口，停靠屏幕边缘，`Alt+Q` 唤出，`Esc` 或点面板外收起。
  **面板像 iPad 一样自由缩放**：拖内侧边、底边或内下角；侧廊 / 紧凑 / 板式 / 宽屏只是四个起点，
  宽到一定程度内容自动从一列变两列、三列。
- **设置——已落地。** 外观 / 面板 / 数据 / 系统 / 通用五段式；8 套主题预设、强调色、热键录制、自由面板尺寸
  （拖拽 / 滑杆 / 预设 / 撑满高度）、停靠边、边缘距离、中英切换、天气地区（自动或 28 个城市）、
  监测刷新频率、每个组件的显隐、「设置页使用独立窗口」开关，以及自动更新。
- **布局——可编辑。** 把一张卡拖到另一张上即可换位，也可以用箭头；每张卡还能设跨几列。
  顺序、跨列与隐藏状态存在 `layout.json`。
- **组件宿主——已落地。** 卡片从注册表（`WidgetShell` + `WIDGETS`）渲染，新增内置组件不再改
  `App.tsx`；下一步是声明式 IR 编译器。
- **真实数据——已接入。** CPU、内存、GPU、网络、TOP 进程、Windows SMTC 正在播放（含播放 / 暂停、
  上一首 / 下一首、系统音量）、真实天气（Open-Meteo），以及可编辑的待办（存在 `todo.json`）。
  勾选后任务留在原位，删除只做横向淡出与行高收合，不会上下跳动。待办卡支持
  **Open / Closed / All（未完成 / 已完成 / 全部）**、行内编辑和 5 秒撤销。系统监测支持
  **1 / 2 / 3 / 5 秒** 可调刷新，读数会在两次采样之间平滑过渡，不再突然跳变；collector 在面板
  隐藏时保持预热，唤出后的第一帧就有 GPU、网速和进程数据。
- **天气——已接真实数据。** 自动按 IP 粗略定位，或在设置里从 28 个城市中选择；Hero 卡显示
  当前温度、WMO 天气、最高/最低与城市。最后一次成功数据会缓存，网络失败自动重试。
  数据来源：Open-Meteo；自动定位：ipwho.is。
- **点外收起。** 点击侧边廊外的任意位置会收起面板；设置 / 布局编辑打开时不收，
  托盘图标上的点击也不误判。
- **中文排版——单独调过。** 中文不再沿用英文 9–10px 的小字：雅黑回退、正文/说明 11.5–14px、
  页面标题 24px、收紧字距、提高浅色文字对比度，并恢复 Windows 次像素渲染；英文继续用 Instrument Sans。
- **M0.5——安装包已通。** `pnpm dist` 出 NSIS per-user 安装包；安装版用 electron-updater
  后台自动下载，退出时安装或重启更新；绿色 ZIP 需要手动替换文件夹。
- **卸载——设置里直接做。** 通用 → 数据与卸载会显示用户数据目录，并提供「打开文件夹」与
  「卸载 Sill」。安装版打开官方 NSIS 卸载器，可勾选同时删除 `%APPDATA%\Sill`；绿色版退出后
  删除整个文件夹（包括 `Sill-data`）。

## 安装

从 [Releases](https://github.com/Enkrid-Rao/sill/releases) 下载 `Sill-Setup-0.5.3.exe`，
或绿色版 ZIP `Sill-0.5.3-portable-win64.zip`（最新已发布版本；v0.5.4 已本地构建，尚未发布）。
per-user 安装到 `%LOCALAPPDATA%\Programs\Sill`，不弹 UAC。安装包**未签名**，SmartScreen 会拦一次，
点「更多信息 → 仍要运行」。

**绿色版**是普通文件夹 ZIP：把 `Sill` 文件夹解压到任意可写位置，双击 `Sill.exe` 即可。
没有安装程序、不写注册表卸载项、不碰 Program Files，也不会每次启动解压到临时目录。
`settings.json`、`todo.json`、`layout.json`、`weather.json` 都放在 `Sill.exe` 旁的 `Sill-data`；
移动整个文件夹时数据跟着走。卸载用设置 → 通用 → 数据与卸载（退出后删整个文件夹），
或退出后直接删文件夹。不要放在 `Program Files`（可能只读）。
源码当前是 **v0.5.4**（在 v0.5.3 的真实天气、点外收起、待办过滤/编辑/撤销、绿色版、可调监测刷新、
五段式设置、安装版自动更新之上，新增设置内卸载）；**v0.5.4 尚未发布**，最新 Release 仍是 v0.5.3。

需要 Windows 10/11 x64。

## 开发

```powershell
pnpm install
pnpm approve-builds --all              # pnpm 10+ 默认不跑依赖的安装脚本
Remove-Item Env:ELECTRON_RUN_AS_NODE   # Electron 宿主会注入，必须移除而不是置空
pnpm dev
```

`Alt+Q` 唤出 / 收起，`Esc` 收起（开着设置时先关那一层），点面板外也会收起（设置 / 布局编辑时除外）。右上角滑杆图标进入设置。
**拖内侧边或底边即可改尺寸**——面板会吸附到四个预设，并记住大小。

自检命令：

```powershell
pnpm typecheck   # 主进程与渲染进程各查一遍
pnpm build       # 产物在 apps/desktop/out
pnpm smoke       # 无头起面板 → 截图到 apps/desktop/out/smoke.png → 退出
pnpm dist        # NSIS 安装包 → apps/desktop/dist
```

## 文档

| 文档 | 内容 | 读者 |
|---|---|---|
| [DEVPLAN.md](DEVPLAN.md) | 产品与架构规划、里程碑、组件规范、rmskin 策略 | 想理解**要做成什么**的人 |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | 环境、命令、目录职责、关键实现决策、排错 | 要**动手改代码**的人 |
| [docs/HANDOFF.md](docs/HANDOFF.md) | 当前进度、已验证 / 未验证、阻塞、下一步 | 要**接手**的人或下一个会话 |
| [docs/mockups/panel-forms.html](docs/mockups/panel-forms.html) | 四种面板形态的实尺对比（按 1/2/3/4 切换） | 想回看**为什么选侧边廊**的人 |

## 组件开发

组件的 manifest / IR / runtime / sandbox 规范在独立的
**[Sill-Components](https://github.com/Enkrid-Rao/sill-components)** 仓库里。Sill 主仓库只保留宿主
（`WidgetShell`、`WIDGETS`、数据 provider）与内置组件。

## 命名

品牌 **Sill**（窗台），命令行 `sill`，包格式 `.sill`，包 id `sill.*`，数据目录 `%APPDATA%\Sill\`。
名字的理由见 [DEVPLAN.md §2](DEVPLAN.md)。
