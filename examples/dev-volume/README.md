# Volume

`type: "web"` + `trust: "trusted"`，带 `ui/assets/audio-helper.ps1`。

- 系统主音量；
- 按 PID 聚合的每个应用音量；
- 每个会话的静音；
- 不依赖宿主 `audio.sessions`，也不是新 API：Node 直接执行包里的 helper。

开发：

```powershell
sill dev .\examples\dev-volume
```

打包：

```powershell
sill pack .\examples\dev-volume -o volume.sill
```

helper 是 PowerShell + C# WASAPI；`ui/main.js` 从 `sill.ready(({ dir }) => ...)` 拿到包目录，
再 `execFile` 它。这是 trusted 组件“什么都能写”的路径：Sill 不需要为音量新增 API。
