# Developer Quickstart

写 Sill 组件只需要 HTML / CSS / JavaScript。完整写法（API、token、配方、常见坑）在
[Sill-Components › docs/authoring.md](https://github.com/Enkrid-Rao/sill-components/blob/main/docs/authoring.md)。

## 路线 A：不装任何工具（推荐先走这条）

1. 安装 Sill 开发版（`0.6.0-dev.2` 安装包或便携版）。
2. 打开 Sill → 设置 → 组件 → **新建组件…**（或点 **打开组件文件夹**，自己新建
   `%APPDATA%\Sill\skins\hello\`；便携版是 `Sill-data\skins\`）。
   新建会生成下方这套文件并直接打开文件夹。
3. 文件夹结构：

```text
hello/
├─ widget.json
└─ ui/
   ├─ index.html
   └─ style.css
```

```json
{
  "schema": 1,
  "id": "hello",
  "name": "Hello",
  "version": "1.0.0",
  "type": "template",
  "ui": "ui/index.html"
}
```

```html
<div class="hello">
  <span class="hello__label">HELLO</span>
  <strong class="hello__big">Sill</strong>
</div>
```

```css
:host { display: block; }
.hello { display: flex; flex-direction: column; gap: 6px; color: var(--ink); }
.hello__label { color: var(--ink-faint); font-size: 10px; letter-spacing: .18em; }
.hello__big { font-family: var(--serif); font-style: italic; font-size: 40px; }
```

4. 保存 → 设置 → 组件里勾上 Hello → 回面板就能看到。之后改文件保存即热重载。

## 路线 B：用 CLI 生成脚手架 / 打包

```powershell
npm i -g @heavenlydemon/sill-cli   # 0.3.1+；0.2.x 不认识新的 template+main.js/assets
sill new clock
sill validate .\clock
sill pack .\clock -o clock.sill
```

> 如果 npm 上还是 0.2.x：在 Sill 仓库里用 `pnpm sill new clock` / `pnpm sill pack ...`，
> 或者直接手写文件（路线 A）。

生成的文件：

```text
clock/
├─ widget.json
├─ README.md
└─ ui/
   ├─ index.html
   ├─ style.css
   ├─ main.js        # 可选；模板里写逻辑就靠它
   ├─ sill.d.ts      # 可选；编辑器补全
   └─ assets/**      # 图片、字体
```

## 开发循环

- 把组件文件夹放进 `skins/` → 保存即热重载（只重载改动的那个组件）；
- 面板上按 **F12** 打开 DevTools；`main.js` 抛错会在卡片里显示错误条；
- 组件私有存储写在 `<userData>/widget-data/<id>.json`（`sill.storage`）；
- 安装 `.sill`：设置 → 组件 → 从 .sill 文件安装，或者双击 `.sill`；也可以粘贴 https 直链
  （从 URL 安装），或从只读的组件目录里点安装。纯静态组件直接装；有代码的会按档位提示一次
  （静态 / 脚本 / 隔离 / 完整 Node），确认后同一组件不再问。

## 两种组件类型

| 类型 | 运行方式 | 适合 |
|---|---|---|
| `template`（默认） | 面板页面内，Shadow DOM + 可选 `main.js` | 绝大多数卡片 |
| `web` | 独立 webview guest；`trust: "trusted"` 时可用 Node | 重前端框架、需要 Node 的插件 |

`template` 的 `main.js` 拿到 `sill` 和 `root` 两个参数：`sill.onData / onDispose / storage /
command`，`root` 是这张卡的 ShadowRoot。API 细节见 authoring.md。

## 常用数据源

`time.now` · `system.cpu` · `system.memory` · `system.gpu` · `system.network` ·
`system.processes` · `media.nowPlaying` · `weather.current` · `todo.list` · `host.state`（整份状态）

声明方式：

```json
"data": [{ "id": "now", "source": "time.now" }]
```

## 当前限制

- 打开组件页会对比目录版本、提示更新；后台自动检查还没做；
- web 组件的 `sandboxed` 桥能力有限（没有 storage / fetch），重组件建议直接用 `template` 或
  `web + trusted`；
- 0.6 仍是开发版，不是正式发布。


