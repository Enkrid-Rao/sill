# Sill 后续 TODO

## 组件来源 / 仓库

调研参考：

- Mihon / Tachiyomi 系：用户添加“扩展仓库” URL（一个索引文件），客户端读取索引后按需安装扩展，不在安装包内置扩展列表。参考：<https://raw.githubusercontent.com/AngeloSha/uchiyomi/HEAD/docs/extensions.md>
- LNReader：默认不带插件，用户在 Settings → Repos 添加仓库 URL 后刷新源；插件独立更新。参考：<https://www.lnreader.app/plugins>
- GKD：通过订阅 URL 导入远程规则（JSON5），本地规则与远程订阅使用同一格式。参考：<https://gkd.li/guide/subscription>

Sill 当前状态：

- 设置 → 组件 → 「组件仓库」默认折叠，只放 Sill 官方仓库；展开后才拉取官方 `registry/catalog.json`，并按可安装项显示。
- 「我的组件」只列当前布局 / 已安装组件，不与仓库列表混排。
- 自定义仓库入口暂时置灰，文案为「自定义仓库索引协议待接入」。

待接入：

1. 定义 Sill 仓库索引协议（建议 JSON）：
   - `schema` / `name` / `homepage` / `updated`
   - `components[]`：`id`、`version`、`download`、`sha256`、`size`、`minRuntime`、`permissions`、`description`
   - 可选签名 / `ETag` / `Last-Modified` 缓存策略。
2. 主进程新增仓库管理 API：添加 / 删除 / 排序仓库，持久化到 settings；逐仓库拉取、缓存、失败隔离。
3. 仓库来源信任模型：首次添加提示来源域名；安装时展示权限与 hash；禁止 `file:` / 非 HTTPS（本地开发可用 `SILL_CATALOG_URL` 例外）。
4. 组件更新检查按仓库聚合；当前只有官方 catalog。
5. 设置搜索增加仓库 / 组件条目。

## 媒体

- **封面**：Windows SMTC 的 `MediaProperties.Thumbnail` 是 `RandomAccessStreamReference`，理论上可在主进程读取为 data URL，不依赖音乐 App 私有接口。已实测：
  - 能拿到 `Thumbnail` 对象，`OpenReadAsync()` 返回的 WinRT 流在 Windows PowerShell 5.1 里是 `System.__ComObject`，`AsStreamForRead` 无法投影，暂时读不出字节。
  - 下一步可用 C# / CsWinRT helper 或 Electron 原生侧读取 `IRandomAccessStream`；只在曲目变化时取一次并缓存。
  - `MediaSample.artwork` 与 MediaWidget 的 `<img class="cover__img">` 槽位已预留；没有封面时沿用渐变占位。
- **当前歌词行**：媒体卡已通过宿主 `main/data/lyrics.ts` 直接查 LRCLIB 并显示当前行；歌词组件仍自己请求一份，后续可把解析/缓存上提为共享 provider，并共享偏移设置。
- **同步**：官方没有统一歌词时间轴 API；当前依赖 SMTC position + 本地 LRC。已用 `sampledAt` 补偿采样延迟、加 250ms 回退迟滞并降低刷新到 100ms；下一步评估官方/第三方时间轴校准。

## 其他

- 系统 / 进程卡的显式 stale 标识（per-source timestamp）。
- 设置「恢复全部默认设置」需要主进程 reset-all API。
