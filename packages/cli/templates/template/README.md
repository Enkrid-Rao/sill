# {{name}}

Sill 组件（`type: "template"`）。开发三步：

1. 把这个文件夹放进 `%APPDATA%\Sill\skins\`（便携版是 `Sill-data\skins\`）。
2. 打开 Sill → 设置 → 组件 → 打开组件文件夹；保存文件会自动刷新。
3. 做好了打包：`sill pack`，然后双击 `.sill` 安装。

## 文件

| 文件 | 作用 |
| --- | --- |
| `widget.json` | 元数据、数据绑定、权限提示 |
| `ui/index.html` | 结构（就是普通 HTML） |
| `ui/style.css` | 样式（普通 CSS，可用主题变量） |
| `ui/main.js` | 可选逻辑（普通 JS，宿主注入 `sill` / `root`） |
| `ui/sill.d.ts` | 可选，编辑器补全 |
| `ui/assets/**` | 图片 / 字体，HTML 里直接写 `assets/x.png` |

调试：面板上按 `F12` 打开 DevTools；`main.js` 抛错会在卡里显示。
完整文档：https://github.com/Enkrid-Rao/sill-components/blob/main/docs/authoring.md
