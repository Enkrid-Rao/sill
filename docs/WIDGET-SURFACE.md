# 组件模板：宿主侧实现

> **写组件的文档不在这里。** 组件格式、`sill` API、主题变量、数据源、配方和调试方法
> 全部收在 Sill-Components 仓库的
> [docs/authoring.md](https://github.com/Enkrid-Rao/sill-components/blob/main/docs/authoring.md)。
> 本文只记录宿主这边的实现位置与边界，避免同一套规则写两遍、然后漂移。

## 渲染链路

```text
WidgetShell
  └─ section.card              # 玻璃、圆角、边框、padding（宿主拥有）
       └─ shadow root          # 组件 HTML + CSS（TemplateWidget 拥有）
            ├─ <style>         # textContent 注入，不拼字符串
            ├─ 组件 HTML        # innerHTML 解析（<script> 不执行）
            └─ 可选 ui/main.js  # 宿主页面里执行一次，注入 sill / root
```

- 模板 HTML **不做标签/属性白名单**（v0.6 起）：`svg`、`img`、内联 `style`、`on*` 都允许；
- `<script>` 标签仍然不执行（`innerHTML` 规则）；要写 JS 放 `ui/main.js`；
- 数据更新是增量的：只改文本、`--sill-value`、`[hidden]` 和列表行，不重建 shadow root；
- CSS 过渡 / `@keyframes` 因此可以跨采样继续。

## 文件与安装

- 包结构：`widget.json` + 根目录 `README/LICENSE/NOTICE` + `ui/**`（`ui/index.html` 必需）；
- 安装：临时目录 + 原子 rename 到 `<userData>/components/<id>@<version>/`；
- 开发：`<userData>/skins/<名字>/` 一个子目录就是一个组件，保存即热重载；
- 资源：`ui/` 下的相对路径由宿主改写成 `sill-asset://<id>/ui/...`。

## 运行边界

- `type: "template"`：与宿主同页。`main.js`、`on*` 能访问 `window.sill` 的全部 IPC，
  等同 Sill 权限；安装提示里必须说清楚。
- `type: "web"`：独立 webview guest。`trust: "trusted"` 时开 Node（`child_process`、native），
  `sandboxed` 只走 `sill.ready / onData / command` 桥。
- 组件是本地可信代码（Rainmeter 模型）：不做运行时权限拦截，只防手滑（路径穿越、大小、
  文件白名单）。信任模型见 [SECURITY.md](../SECURITY.md) 与
  [security.md](https://github.com/Enkrid-Rao/sill-components/blob/main/docs/security.md)。

## 调试

- 面板上按 **F12** / `Ctrl+Shift+I` 开关 DevTools（DevTools 打开时点它不会收起面板）；
- `main.js` 同步异常会在该卡片里显示错误条（`renderWidgetError`）；
- 改 `skins/` 下任意文件只重载对应组件（payload 按内容比较，未变化的不重建）。

## 代码位置

| 关注点 | 文件 |
|---|---|
| 模板挂载 / 增量更新 / 错误条 | `apps/desktop/src/renderer/src/components/TemplateWidget.tsx` |
| 动作白名单 | `apps/desktop/src/renderer/src/widgets/actions.ts` |
| 数据 provider | `apps/desktop/src/renderer/src/widgets/providers.ts` |
| 资源协议 | `apps/desktop/src/main/assets.ts` |
| 包校验 / 安装 / skins | `apps/desktop/src/main/widgets/package.ts` |
| 安装确认 / .sill 关联 | `apps/desktop/src/main/widget-install.ts`、`file-assoc.ts` |
| 热重载入口 | `apps/desktop/src/main/skins.ts`、`dev-widget.ts` |
| 组件列表 / 注册表 | `apps/desktop/src/renderer/src/widgets/WidgetRegistryProvider.tsx` |
