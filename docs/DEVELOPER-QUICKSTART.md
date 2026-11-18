# Developer Quickstart

不需要 clone Sill 源码。目标流程：

```text
安装 Sill 开发版（0.6.0-dev.1 便携版）
安装 @sill/cli
sill new com.example.clock
sill dev
sill pack
```

## 1. Sill

用 `Sill-0.6.0-dev.1-portable-win64.zip`，解压到任意可写目录，记下 `Sill.exe` 路径。

```powershell
$env:SILL_EXE = 'D:\Apps\Sill\Sill.exe'
```

不设置时，CLI 会找 `%LOCALAPPDATA%\Programs\Sill\Sill.exe`。

## 2. CLI

发布后：

```powershell
npm i -g @sill/cli
```

本地 tarball：

```powershell
npm i -g .\sill-cli-0.2.0.tgz
sill --help
```

需要 Node.js >= 20。

## 3. 新建

```powershell
sill new com.example.clock
cd com.example.clock
```

默认：

```json
"type": "web",
"trust": "trusted",
"size": { "w": 384, "h": 180 }
```

`ui/main.js` 可以直接 `require('node:os')`。需要旧模板格式：

```powershell
sill new com.example.clock --template
```

## 4. 开发

```powershell
sill dev
```

- 使用 `%APPDATA%\Sill-dev` 作为独立开发数据，不碰正式版设置；
- 正式 Sill 开着也能启动，开发实例不抢单实例锁；
- 改 `ui/index.html` / `style.css` / `main.js`，宿主监控文件并热重载；
- 面板会自动打开。

覆盖开发数据目录：

```powershell
$env:SILL_DEV_DATA = 'D:\sill-dev-data'
```

## 5. 打包

```powershell
sill pack -o clock.sill
```

在 Sill 设置 → 组件 → 安装，选择 `.sill`；trusted 会显示完全访问警告。

## 不需要为每个能力加宿主 API

trusted 组件是通用 escape hatch：

- 带 `ui/assets/**`；
- 从 `sill.ready(({ dir }) => ...)` 拿包目录；
- `require('node:child_process')` 执行自己的 helper；
- 或 `require` 自己的 native `.node` addon。

per-app 音量、传感器、专有 SDK 都应该由组件自己带 helper/native，而不是每来一个功能就在宿主加一个
`action.xxx`。宿主 provider 是给 sandboxed/简单组件的便利层，不是能力上限。

## 当前限制

- `ui/assets/**` 已开放；trusted 用 `sill.ready(({ dir }) => ...)` 拿包目录，helper 随包走；
- 目录下载 / 自动更新还没做；
- CLI 还没发布到 npm，先用 tarball；
- Sill 0.6 目前是开发版，不是正式发布。

## 组件类型

| 类型 | 能力 | 适合 |
|---|---|---|
| `web` + `trust: trusted` | 完整 Node、`child_process`、native addon | 本地、自己写、审核过的组件 |
| `web` + `trust: sandboxed` | `window.sill` 桥 | 不可信市场组件 |
| `template` | 无 JS，Shadow DOM | 简单只读卡 |
