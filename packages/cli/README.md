# @sill/cli

Sill 组件开发命令行。不需要 clone Sill 源码。

```bash
npm i -g @sill/cli
sill new com.example.clock
cd com.example.clock
sill dev
sill pack
```

- `sill dev` 找已安装的 `Sill.exe`，用独立开发数据和 `SILL_DEV_WIDGET` 启动；
- 找不到安装版时，`SILL_EXE` 指向便携版；再不行才回退源码仓库的 `pnpm dev`；
- `sill new` 默认生成 `type: "web"`、`trust: "trusted"`，`--template` 生成旧模板；
- `sill pack` 输出 `.sill`；web 组件可带 `ui/assets/**`（trusted 用包目录）。

环境变量：

| 变量 | 用途 |
|---|---|
| `SILL_EXE` | Sill.exe 路径 |
| `SILL_DEV_DATA` | 开发用 userData，默认 `%APPDATA%\Sill-dev` |

Node.js >= 20。
