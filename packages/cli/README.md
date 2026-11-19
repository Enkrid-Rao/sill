# sill-cli

Sill 组件开发命令行。不需要 clone Sill 源码。

```bash
npm i -g @heavenlydemon/sill-cli
sill new clock
cd clock
sill validate      # 可选，打包前自检
sill pack          # 生成 clock-1.0.0.sill，双击即可安装
```

## 开发循环（不需要 CLI 也行）

1. 把组件文件夹放进 `%APPDATA%\Sill\skins\`（便携版是 `Sill-data\skins\`）；
2. Sill → 设置 → 组件 → 打开组件文件夹，保存文件自动热重载；
3. 面板上按 `F12` 打开 DevTools。

`sill dev` 是备选方式：用 `%APPDATA%\Sill-dev` 独立开发数据启动已安装的 Sill。

## 包结构

```text
clock/
├─ widget.json
├─ README.md          # 可选
└─ ui/
   ├─ index.html      # 必需
   ├─ style.css       # 可选
   ├─ main.js         # 可选（template 同页执行 / web 必需）
   ├─ sill.d.ts       # 可选，编辑器补全
   ├─ lib/**          # 随意拆
   └─ assets/**       # 图片、字体
```

规则只有一条：`widget.json` 在根目录，其余任意文件都放在 `ui/` 下。

完整写法见组件规范仓库的 `docs/authoring.md`。
