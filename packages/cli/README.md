# Sill CLI

本地开发命令。直接跑在 Sill 仓库里，不发布到 npm。

```bash
pnpm sill validate ./my-widget
pnpm sill pack ./my-widget -o my-widget.sill
pnpm sill new com.example.clock
pnpm sill dev ./my-widget
```

## 命令

### `validate <dir>`

检查：

- `widget.json` 可解析，`schema=1`；
- `id` / `version` / `type` / `ui` / `span` 合法；
- 三个文件存在且 ≤ 512 KB；
- HTML 没有 `<script>`、`on*`、`style`、`href`、`src`；
- CSS 没有 `@import`、`url()`、`expression()`。

### `pack <dir> [-o file]`

先 `validate`，再把三个文件打成 `.sill`。默认文件名 `<id>-<version>.sill`。
压缩包根目录就是这三个文件，不套文件夹。

### `new <id> [dir]`

生成最小可运行模板：

```text
com.example.clock/
├─ widget.json
└─ ui/
   ├─ index.html
   └─ style.css
```

### `dev <dir>`

校验后以 `SILL_DEV_WIDGET=<dir>` 启动 Sill 的 `pnpm dev`。
依赖当前工作区；不是全局安装的 `sill` 命令。
