# Handoff

当前状态以本页为准。规划背景见 [DEVPLAN.md](../DEVPLAN.md)（历史计划）和
[ARCHITECTURE.md](ARCHITECTURE.md)（当前架构）。

- 时间：2026-11-18
- 正式版本：**v0.5.4**（已发布）
- 开发分支：`main`，比 0.5.4 多了组件平台
- 组件规范：[Sill-Components](https://github.com/Enkrid-Rao/sill-components)

## 已存在

### 桌面壳

- Electron 45 透明窗，右侧/左侧停靠，`Alt+Q` 唤出，`Esc` / 点外收起。
- 连续宽高、1/2/3 列、四套预设、布局拖拽/箭头/跨列/隐藏。
- 设置五段式，主题 / 氛围 / 强调色 / 中英 / 天气城市 / 监测频率 / 自启 / 自动更新 / 卸载。
- 系统、媒体、天气、待办数据都是真实采集，不是 mock。

### 组件平台（main，不在 0.5.4）

- 模板组件：`widget.json` + `ui/index.html` + `ui/style.css`。
- 安装：本地 `.sill`（zip），确认 id / 版本 / 作者 / 权限后原子安装。
- 布局：模板 id 进入 `layout.json`，可拖拽、跨列、隐藏、卸载。
- 模板指令：`data-sill-text` / `i18n` / `if` / `repeat` / `action` / `meter`。
- Provider：time / system / media / weather / todo。
- CLI：`pnpm sill validate / pack / new / dev`。
- 测试：Vitest（安装器 + provider）+ GitHub Actions。

## 已实际验证

| 项 | 证据 |
|---|---|
| `pnpm typecheck` | 通过 |
| `pnpm test` | 13 个测试通过 |
| `pnpm build` | 通过 |
| `pnpm smoke` | 截图输出正常 |
| 模板卡玻璃 | 默认 / Lagoon / 320 宽截图 |
| `.sill` 安装 | 程序化安装、加载、卸载 |
| 坏包拒绝 | 额外文件 / 路径穿越 / `<script>` / CSS `url()` |
| repeat / if / i18n | `examples/processes` 安装后渲染 |
| action / meter | `examples/media` 安装后渲染，按钮可见 |
| 规范仓库 | `python scripts/validate.py` + GitHub Actions 通过 |

## 未完成

- 目录下载 / 自动更新 / 版本升级。
- 签名 / 哈希；安装器现在只做静态校验和权限确认。
- 模板格式化函数、图片资源、通用样式绑定。
- 五个内置组件仍是 React，不是模板。
- web 组件只有开发原型：不能 `.sill` 安装，没有 assets / fetch / storage。
- 根目录 LICENSE；许可策略还没定。
- `DEVPLAN.md` 的 IR / rmskin 章节是历史规划，不要按它实现。

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
pnpm sill validate .\path\to\widget
pnpm sill pack .\path\to\widget -o .\widget.sill
pnpm sill dev .\path\to\widget
```

## 建议顺序

1. 目录下载 / 更新（先做只读索引 + 本地安装，再做自动下载）。
2. 版本升级（卸载再装的体验太差）。
3. 图片 / 字体资源白名单。
4. 把 system / processes 迁到模板，验证模板能力足够。
5. 再决定 webview 任意 JS 组件。
