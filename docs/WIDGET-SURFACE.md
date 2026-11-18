# 第三方组件的表面契约（实验）

> 状态：实验。入口是 `SILL_DEV_WIDGET`，只从文件夹加载；没有 zip 安装、动态布局和权限面板。
> 这份文档定义「组件的表面」怎么和 Sill 的玻璃 / atmosphere 对齐，避免以后换渲染方式时重写组件。

## 1. 问题

Sill 的面板窗口是 `transparent: true`。在这个窗口里，iframe 的合成表面是不透明白底：

- `html/body { background: transparent }` 无效；
- 加不加 `sandbox` 都一样；
- 加 `color-scheme` 也一样；
- 这是 Chromium 对 frame 合成层的处理，不是 CSS 能修的。

所以 iframe 模式必须由宿主给一块**不透明内衬**，否则卡片里会出现白块。
未来的 `WebContentsView` 可以用 `setBackgroundColor('#00000000')` 做真透明，但它不是 iframe 的平替。

## 2. 两种 surface 模式

宿主在组件的 `<html>` 上写 `data-sill-surface`：

| 模式 | 宿主 | 组件文档 |
|---|---|---|
| `inset` | 在 iframe 里画一块不透明内衬，颜色/氛围来自主题 token | `html/body` 保持透明；不要自己铺 full-bleed 背景 |
| `glass` | 宿主负责真正的玻璃与 atmosphere，组件区域透明 | 同上；组件内容直接落在宿主的玻璃上 |

当前实现是 `inset`。以后切换到 `WebContentsView` 时，只改宿主：

1. `view.setBackgroundColor('#00000000')`；
2. `data-sill-surface="glass"`，宿主的内衬伪元素全部关掉；
3. 组件的 `window.sill` API 和 CSS token 不变。

## 3. 宿主注入的 CSS token

组件不要硬编码 Sill 的玻璃色；用这些变量：

| token | 含义 |
|---|---|
| `--sill-hue` / `--sill-tint` | 当前面板色相 / 上色强度 |
| `--sill-surface` | 不透明内衬的基色；`inset` 模式下由宿主铺在 `body` 上 |
| `--sill-glass` | 卡片玻璃的浅色渐变；可用在内部小块 |
| `--sill-glass-alpha` | 玻璃底透明度 |
| `--sill-atmo-k` | atmosphere 可见度 0–1 |
| `--sill-atmo-base` / `--sill-atmo-layer` | 当前 atmosphere 配方的渐变 |
| `--sill-halo-k` / `--sill-grain-k` | 顶光 / 颗粒开关 |
| `--sill-ink` / `--sill-soft` / `--sill-dim` / `--sill-faint` | 文字层级 |
| `--sill-accent` / `--sill-accent-pale` / `--sill-accent-soft` | 强调色 |
| `--sill-sans` / `--sill-serif` | 字体栈 |

`inset` 模式下宿主还会在 iframe 内画 atmosphere 渐变和顶光；组件不需要自己复刻。
主题切换时宿主通过 MessagePort 推送新的 token，组件只要用 CSS 变量就会跟着变。

## 4. 组件作者的规则

1. `html, body` 的背景必须是 `transparent`；不要盖住宿主的内衬。
2. 需要一块自己的面板/卡片时，用 `var(--sill-surface)` 或 `var(--sill-glass)`，不要写死颜色。
3. 不要用 `backdrop-filter` 或桌面采样；Sill 的玻璃只有宿主这一种材质。
4. 用 `data-sill-surface` 判断自己是在 `inset` 还是 `glass` 模式；两种模式视觉上要都能读。
5. `window.sill` 的 `ready` / `onData` / `log` 在两种模式下保持一致，不要把布局假设写进组件。

## 5. 当前实现

- 宿主：[DevWidgetCard.tsx](../apps/desktop/src/renderer/src/components/DevWidgetCard.tsx) 的 `themeVariables()`、`hostSurface`、MessagePort；
- 读取文件夹：[dev-widget.ts](../apps/desktop/src/main/dev-widget.ts)；
- 示例：`D:\Projects\Sill-dev-widget`。

`inset` 模式的表面层是宿主 CSS，不是组件 CSS；示例组件的 `style.css` 只写内容，不铺背景。

## 6. 迁移到 WebContentsView 时需要补的

- 每个组件一个 `WebContentsView`，`setBackgroundColor('#00000000')`；
- 把卡片 DOM rect 同步到 view bounds，滚动/缩放/布局编辑时更新；
- 设置面板、布局编辑、下拉菜单打开时隐藏 view，避免原生 view 盖住 HTML；
- 拖拽时用把手或临时隐藏 view；
- `will-frame-navigate` / 导航拦截、焦点、输入法、Esc 仍要单独处理；
- 组件继续使用同一套 CSS token 和 `window.sill` API，不重写组件。
