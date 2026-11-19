# 第三方组件模板（实验）

> 状态：实验。入口是 `SILL_DEV_WIDGET`（文件夹）或设置里的「安装组件…」（本地 `.sill` zip）。
> 安装后进入 `layout.json`，可拖拽、跨列、隐藏、卸载；没有 CLI、目录下载和权限确认面板。
> 这份文档定义「别人怎么写一张卡」以及「为什么玻璃和 atmosphere 不需要额外接入」。

## 1. 为什么不是 iframe

Sill 的玻璃在 `WidgetShell` 的 `.card` 上，atmosphere 在它背后的 `.rail__atmo`。
内置组件只返回内容，不画卡片背景，所以玻璃是自然透出来的。

iframe 会把这条链切断：透明窗口里的 iframe 是不透明白底，只能由宿主再铺一块“仿玻璃”；
无论怎么调 token，都不是同一层材质。`WebContentsView` 虽然能真透明，但它是原生子视图，
滚动、裁剪、设置面板遮挡、拖拽都要单独处理，不适合作为第一版。

因此 v1 的第三方组件是**模板**，直接渲染在 `.card` 里面。

## 2. 包结构

```text
my-widget/
├─ widget.json
└─ ui/
   ├─ index.html   # 内容结构；不写 <script>
   └─ style.css    # 内容样式
```

`widget.json`：

```json
{
  "schema": 1,
  "id": "com.you.clock",
  "name": "Clock",
  "version": "0.1.0",
  "author": "you",
  "license": "MIT",
  "runtime": ">=0.5.4",
  "engine": ">=0.1.0",
  "type": "template",
  "permissions": ["data.time"],
  "data": [{ "id": "now", "source": "time.now" }],
  "ui": "ui/index.html",
  "span": { "default": 1 }
}
```

`ui/index.html`：

```html
<div class="clock">
  <div class="clock__label">LOCAL TIME</div>
  <div class="clock__time" data-sill-text="now.time">--:--</div>
  <div class="clock__date" data-sill-text="now.dateLabel"></div>
</div>
```

`ui/style.css`：

```css
:host {
  display: block;
}

.clock__label {
  color: var(--ink-faint);
  letter-spacing: 0.17em;
}

.clock__time {
  font-family: var(--serif);
  font-size: 56px;
  color: rgba(250, 255, 252, 0.97);
}

.clock__date {
  color: var(--ink-dim);
}
```

不要给 `html` / `body` / 根节点铺背景。背景由 `.card` 负责；组件只画内容。

## 3. 渲染方式

```text
WidgetShell
  └─ section.card          # 玻璃、圆角、边框、padding
       └─ shadow root      # 第三方 index.html + style.css
            └─ 内容
```

- HTML 原样挂到 Shadow DOM，不做标签审查（`<script>` 由 innerHTML 规则保证不执行）；
- CSS 只在 Shadow DOM 内生效，不会污染其他卡；
- Shadow DOM 继承宿主的 CSS 自定义属性，`--ink` / `--serif` / `--accent` 直接可用；
- 卡片背后的 atmosphere 会自然透出来，不需要复制渐变；
- 主题切换时 CSS 变量变化，模板自动跟随，不需要 JS。

## 4. 数据绑定

v1 支持文本、本地化、条件、列表、动作和数值：

```html
<span data-sill-text="now.time"></span>
<span data-sill-i18n="label"></span>
<div data-sill-if="media.active">正在播放</div>
<div data-sill-if="!media.active">未在播放</div>
<div data-sill-repeat="processes.topRam">
  <span data-sill-text="item.name"></span>
</div>
<button type="button" data-sill-action="media.playpause">▶</button>
<div class="bar"><div data-sill-meter="cpu.usage"></div></div>
```

- 值的根来自 manifest 的 `data[].id`；repeat 内部有 `item`；
- 缺失值渲染 `—`；
- 条件只接受路径和 `!`；列表只接受数组；
- 动作只允许 `media.*` / `todo.toggle`，需要 `action.media` / `action.todo`；
- `data-sill-meter` 只写 0–100 到 `--sill-value`，不执行任意 CSS；
- 没有表达式函数和写操作；v1 不执行任意 JS。

## 5. 样式 token

模板能用宿主暴露的 CSS 变量：

| token | 用途 |
|---|---|
| `--ink` / `--ink-soft` / `--ink-dim` / `--ink-faint` | 文字层级 |
| `--accent` / `--accent-pale` / `--accent-soft` | 强调色 |
| `--sans` / `--serif` | 字体栈 |
| `--radius` | 面板圆角；卡片内部圆角自己按 `18px` 走 |

不要用 `--atmo-*` 复刻 atmosphere；那是宿主层，不是组件层。

## 6. 当前实现

- 宿主渲染：[DevWidgetCard.tsx](../apps/desktop/src/renderer/src/components/DevWidgetCard.tsx)
- 文件夹读取：[dev-widget.ts](../apps/desktop/src/main/dev-widget.ts)
- 示例：[examples/dev-widget](../examples/dev-widget)

运行：

```powershell
$env:SILL_DEV_WIDGET = 'D:\Projects\Sill\examples\dev-widget'
pnpm dev
```

不设置这个变量时，面板行为不变。

## 7. 内容边界（实验版）

- 标签 / 属性不做白名单：`svg`、`img`、内联 `style`、`on*` 都可以；
- `<script>` 通过 `innerHTML` 插入不会执行；要 JS 写 `ui/main.js`，它在宿主页面里执行一次；
- 组件与宿主同页，被视为可信代码；需要独立进程才用 `type: "web"`；
- 包内资源走 `sill-asset://`；数据更新走增量替换，CSS 过渡不会被打断。

## 8. 下一步

1. 组件存储 / 目录下载；
2. `.sill` 签名与哈希；
3. `data-sill-action` 继续扩命令；
4. 模板能力补齐：格式化函数、通用样式绑定。
