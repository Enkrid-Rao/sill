# M1 Beta 门禁记录（0.7 Beta / RC）

> 状态时间：2026-11-21。Beta.2 → Beta.3 阶段；本文件记录 M1 的验证证据与未完成项。

## 门禁总览

| 项 | 状态 | 证据 / 待办 |
|---|---|---|
| 自动化 | 通过 | `pnpm typecheck`、56 tests、`pnpm build`、CI verify |
| 全新安装 | 通过 | NSIS 静默安装到临时目录，`--smoke` exit 0 |
| 升级安装 | 通过 | 0.6.1 → 0.7.0-beta.1 覆盖安装，`settings.json` 保留 |
| 卸载 | 通过 | 静默卸载 exit 0，安装目录删除，数据目录保留 |
| 便携包 | 通过 | ZIP 解压后 `--smoke` exit 0 |
| 打包态 | 通过 | `win-unpacked/Sill.exe --smoke` exit 0 |
| 2 小时长稳 | 进行中 | 20 分钟加速 soak 先跑；完整 2h 在 Beta 窗口补 |
| 多显示器 | 阻塞 | 当前主机只有 1 块显示器；需真实双屏验证 |
| DPI | 通过（强制） | 1.5x / 2x 下设置窗口均在 workArea 内可见 |
| 设置窗口位置 | 通过 | 100,40 恢复；-9999,-9999 修正到 workArea 原点 |
| 首启 / 隐私 | 通过 | 首次启动露出面板 + 隐私门；离线阻断天气/歌词/更新 |
| 组件 hash | 通过 | catalog sha256；错误 hash 实测拒绝 |
| Beta 更新链 | 通过（代码） | Beta.3 起 pre-release 通道可用；beta.2 已带修复；beta→rc 待 RC |
| 自动更新 e2e | 部分 | 稳定 0.6.1 只看到 0.6.1；beta.2 → beta.3 实测待发布后跑 |
| 隐私 / 第三方 | 部分 | 首启隐私门、联网 consent、天气开关已做；隐私文档可达 |
| 组件签名 / hash | 部分 | catalog + 安装校验 SHA-256 已完成；包签名仍未做 |
| 应用签名 | 决策记录 | 0.7 Beta/RC unsigned；正式版前签 MSIX/OV 或明确接受 unsigned |

## 本轮 soak 结果

- 打包态 `win-unpacked/Sill.exe`，80 次显示/收起，约 16.7 分钟。
- 应用内存：400 MB 启动 → 549 MB 峰值 → 517 MB 结束；后半段在 517–544 MB 区间波动，无持续上涨。
- 隐藏时保留 1 个 collector 子进程；显示时 2 个（collector + media-control）；关闭后 0 个 PowerShell 子进程。
- 未复现进程堆积；完整 2 小时仍待补。

## 设置窗口/更新验证

- 位置恢复：`{x:100,y:40}` → 打开 `{x:100,y:40}`。
- 越界恢复：`{x:-9999,y:-9999}` → `{x:0,y:26}`（workArea 原点）。
- 强制 DPI 1.5 / 2.0：窗口均完整落在 workArea 内。
- 稳定版 0.6.1 在 Beta.1 已发布的情况下 `checkForUpdates()` 返回 `latest 0.6.1`，Pre-release 未污染稳定通道。


## 环境

- Windows 10.0.26300，单屏 1463×915 @ 175%，工作区 1463×893
- 安装包：`Sill-Setup-0.7.0-beta.1.exe`
- 便携包：`Sill-0.7.0-beta.1-portable-win64.zip`

## 更新链路判断

- `updates.ts` 原先 `allowPrerelease=false`，Beta 用户收不到后续 Beta/RC。
- 已改为：构建版本号含 `alpha/beta/rc/dev` 时 `allowPrerelease=true`；稳定版仍为 false。
- 可用版本链接改到对应 tag，而不是永远跳到 `/releases/latest`。
- 单测：`shared/update.test.ts`（beta/rc/dev true，stable false）。
- 由于 beta.1 已发布且不含此修复，beta.1 → beta.2 需要一次手动安装；从 beta.2 起才能自动收 RC。

## 隐私与签名待决

### 数据流

| 场景 | 目标 | 发送内容 |
|---|---|---|
| 天气自动定位 | ipwho.is / ipapi.co / ipinfo.io | IP（由服务端获得）、普通 HTTP 元数据 |
| 天气 | api.open-meteo.com | 经纬度 |
| 媒体歌词 | lrclib.net | 曲名、歌手、专辑、时长 |
| 组件目录 | raw.githubusercontent.com | IP、User-Agent |
| 应用更新 | github.com | IP、版本检查 |

本地数据：`settings.json`、`layout.json`、`todo.json`、`shelf.json`、`weather.json`、`widget-settings/`、`widget-data/`、`trust.json`。

### 正式版前必须做

1. `PRIVACY.md` + `THIRD-PARTY.md`，并在 README / 关于页可达。
2. 首启天气 auto 的告知—同意；未同意前对 IP 定位端点请求数为 0。
3. 组件 catalog 增加 `sha256`，安装前校验；再评估包签名。
4. 代码签名路径决策：OV 证书 / Store MSIX / 明确接受 unsigned。
5. 自动更新 `latest.yml` + 篡改拒绝测试。

## 下一步

1. 完成 2h soak 与双屏/DPI 矩阵。
2. 发 `0.7.0-beta.2`：包含 pre-release 更新修复，beta.1 用户手动升级一次。
3. 通过后进入 RC；RC 只修 P0/P1。
