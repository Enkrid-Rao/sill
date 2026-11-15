# Sill

![Platform](https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-0078D4?style=flat-square)
![Electron](https://img.shields.io/badge/electron-45-47848F?style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square)
![Milestone](https://img.shields.io/badge/milestone-M0.5%20%C2%B7%20installer-F2A33C?style=flat-square)
[![Release](https://img.shields.io/badge/release-v0.5.0-2EA043?style=flat-square)](https://github.com/Enkrid-Rao/sill/releases)

A glass side rail for the Windows desktop: summon it with a hotkey, docked to the edge of the screen,
built to host installable widgets — and eventually to eat Rainmeter skins.

**English** · [中文](README_zh.md)

<table>
  <tr>
    <td align="center"><img src="docs/media/panel-preview.webp" width="320" alt="Sill panel"><br>
      <sub>The rail: live system, media and todo data on one piece of glass</sub></td>
    <td align="center"><img src="docs/media/settings-preview.webp" width="320" alt="Sill settings"><br>
      <sub>Settings: appearance / behavior / general</sub></td>
  </tr>
</table>

## Where it is now

- **M0 shell — done.** A real Electron transparent window, docked to the screen edge, summoned with
  `Alt+Q`, dismissed with `Esc` or a click outside. **Resize it like an iPad panel**: drag the inner edge, the bottom edge
  or the bottom corner; four presets (rail / compact / board / wide) are just starting points.
  The content reflows from one to three columns as it widens.
- **Settings — in.** Three tabs (Appearance / Behavior / General), 8 theme presets, accent colours,
  hotkey recorder, free panel size (drag, sliders, presets, fill-height), dock side, edge distance,
  zh/en switch, weather location (auto or 28 cities), per-widget visibility, and an option to open
  Settings in its own window.
- **Layout — editable.** Drag a card onto another to swap, or use the arrows, and set how many columns
  each card spans. The arrangement lives in `layout.json`; hidden widgets keep their slot.
- **Widget host — in.** Cards render from a registry (`WidgetShell` + `WIDGETS`), so adding a built-in
  component no longer means editing `App.tsx`. The declarative IR compiler is the next step.
- **Live data — in.** CPU, memory, GPU, network, top processes, Windows SMTC now-playing with
  play/pause, previous/next and system volume, real weather (Open-Meteo), and an editable todo list
  stored in `todo.json`. Completed tasks stay in place; deletes fade horizontally while the row
  height collapses, so nothing jumps up or down. The todo card has **Open / Closed / All**, inline
  edit, and a 5-second undo.
- **Weather — real.** Auto-locate by coarse IP, or pick one of 28 cities in Settings. The hero card
  shows the current temperature, WMO condition, high/low and city; last good data is cached and
  retried after a network failure. Attribution: Open-Meteo / ipwho.is.
- **Dismiss on outside click.** Clicking anywhere outside the rail folds it away, except while
  Settings or layout editing is open, or when the click is on the tray icon.
- **Chinese type — tuned.** Chinese no longer inherits the 9–10px English caption sizes: it gets a
  YaHei fallback, 11.5–14px body/caption sizes, tighter tracking, higher faint-text contrast and
  subpixel rendering; English keeps Instrument Sans.
- **M0.5 — installer done.** `pnpm dist` builds an NSIS per-user installer; the app has an
  auto/manual release check. Auto-update installation is not wired yet.

## Install

Grab `Sill-Setup-0.5.0.exe` from [Releases](https://github.com/Enkrid-Rao/sill/releases).
It installs per-user to `%LOCALAPPDATA%\Programs\Sill` (no admin prompt). The build is **unsigned**,
so SmartScreen warns once — choose “More info → Run anyway”.
The source is currently at **v0.5.0** (real weather with auto/manual location, click-outside
dismissal, Open/Closed/All todo with edit and undo, widget host, optional standalone Settings
window); this release is published.

Requires Windows 10/11 x64.

## Development

```powershell
pnpm install
pnpm approve-builds --all              # pnpm 10+ skips dependency build scripts by default
Remove-Item Env:ELECTRON_RUN_AS_NODE   # injected by the Electron host; must be removed, not just cleared
pnpm dev
```

`Alt+Q` summons / hides the rail, `Esc` dismisses it (closing Settings first), and a click outside
folds it away unless Settings or layout editing is open. The sliders icon in the
top-right corner opens Settings. **Drag the left/inner edge or the bottom edge to resize** — the panel
snaps to the four presets and remembers its size.

Self-checks:

```powershell
pnpm typecheck   # main + renderer
pnpm build       # output in apps/desktop/out
pnpm smoke       # headless panel → screenshot to apps/desktop/out/smoke.png → exit
pnpm dist        # NSIS installer → apps/desktop/dist
```

## Docs

| Doc | What it covers | For |
|---|---|---|
| [DEVPLAN.md](DEVPLAN.md) | product and architecture, milestones, widget spec, rmskin strategy | understanding **what it should become** |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | environment, commands, layout, implementation decisions, troubleshooting | **changing the code** |
| [docs/HANDOFF.md](docs/HANDOFF.md) | current state, verified vs. unverified, blockers, next steps | **picking it up** |
| [docs/mockups/panel-forms.html](docs/mockups/panel-forms.html) | four panel shapes at 1:1 scale | why the side rail |

## Component development

The component manifest / IR / runtime / sandbox spec lives in the separate
**[Sill-Components](https://github.com/Enkrid-Rao/sill-components)** repository.
Sill itself only keeps the host (`WidgetShell`, `WIDGETS`, data providers) and built-in components.

## Naming

Brand **Sill** (the window ledge), CLI `sill`, package format `.sill`, package ids `sill.*`,
data under `%APPDATA%\Sill\`. The reasoning is in [DEVPLAN §2](DEVPLAN.md).
