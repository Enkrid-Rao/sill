# Architecture

Sill is one Electron app, three processes and one widget runtime. The goal is a stable host that can
accept many small components without giving them the renderer or the filesystem.

## Processes

```text
main (Node)                    preload (isolated)             renderer (Chromium)
─────────────────              ─────────────────              ───────────────────
window / tray / hotkey         contextBridge                  React panel + settings
settings / layout / todo       typed window.sill API          WidgetRegistryProvider
collector (PowerShell)         no fs, no Node                 WidgetShell / .card
weather / media / todo         IPC only                       template engine
package install / uninstall                                   Shadow DOM / CSS tokens
```

- `apps/desktop/src/main` owns all I/O: files, child processes, network, dialogs, windows,
  settings, data collection, package manager.
- `apps/desktop/src/preload` exposes a typed, narrow API. It does not pass Node or arbitrary IPC.
- `apps/desktop/src/renderer` never touches Node. It renders snapshots and template payloads.

The renderer is configured with `contextIsolation: true`, `nodeIntegration: false`,
`sandbox: true`.

## Data flow

```text
collector.ps1 ──stdout JSON──▶ main/data ──snapshot──▶ preload.onSnapshot
settings.json / layout.json / todo.json ──IPC──▶ renderer
widget package ──installer──▶ <userData>/components/<id>@<version>
                              │
                              ▼
                        main/widgets/package.ts
                              │ payload
                              ▼
                        WidgetRegistryProvider
                              │
                              ▼
                        TemplateWidget ──▶ Shadow DOM
```

Snapshots are pushed while the panel is visible; the renderer does not poll providers.

## Widget runtime

1. **Registry** — `WidgetRegistryProvider` merges the five built-in definitions, installed packages
   and the optional dev folder. Every definition has an `id`, a label, a span and a render function.
2. **Layout** — `layout.json` stores `order`, `spans`, `hidden` as string ids. `normalizeLayout`
   filters to known ids, appends missing ones and clamps spans.
3. **Card** — `WidgetShell` renders `.card` with glass, radius, border, padding, drag/span tools.
   Widget content never owns the card surface.
4. **Template engine** — `TemplateWidget` mounts `ui/index.html` into a Shadow DOM (no tag/attribute
   allowlist in 0.6; `<script>` tags stay inert because they are parsed via `innerHTML`) and applies:
   - `data-sill-text`
   - `data-sill-i18n`
   - `data-sill-if` / `!`
   - `data-sill-repeat` with `item`
   - `data-sill-action` (`media.*`, `todo.toggle`)
   - `data-sill-meter` (`--sill-value`, 0–100)
5. **Inline JS** — optional `ui/main.js` runs once in the panel page with `(sill, root)`:
   `data()`, `onData()`, `onDispose()`, `command()`, `storage`, and `sill.host` (the preload API).
   Errors are caught and rendered inside the card.
6. **Providers** — `providers.ts` maps manifest `data[].source` to public objects:
   `time.now`, `system.*`, `media.nowPlaying`, `weather.current`, `todo.list`, and `host.state`
   (the whole snapshot).
7. **Assets** — relative `src` / `href` / `poster` and CSS `url()` are rewritten to
   `sill-asset://<id>/ui/...` and served by the main process, confined to the component directory.

Updates are incremental: bindings, `[hidden]` and list rows are patched in place, so CSS transitions
and `@keyframes` survive a data tick. The DOM is rebuilt only when the component itself changes.

## Package lifecycle

```text
pick .sill
  → inspect (zip entries, sizes, manifest, HTML/CSS)
  → show id / version / author / permissions
  → extract to <userData>/components/.tmp-*
  → atomic rename to <id>@<version>
  → invalidate layout + broadcast widgets:changed
```

Uninstall removes the directory and the id from layout. There is one version per id; upgrading
means uninstall then install.

## Security boundaries

The component model is Rainmeter-style: **components are trusted local code**; installing one is the
authorisation. See [SECURITY.md](../SECURITY.md) for the full model. What remains here is engineering
hygiene, not containment:

- Component files: `widget.json` + root `README/LICENSE/NOTICE` + `ui/**`; `ui/index.html` required.
- Zip entries reject absolute paths, drive letters, `..` and backslashes; installs go through a temp
  directory and an atomic rename.
- `sill-asset://` resolves through `within(componentDir)` and only serves existing files.
- The panel renderer keeps `contextIsolation`, `sandbox` and no Node; components run inside it by
  design. `web` guests are the isolated option (`trust: "trusted"` adds Node).
- CSP blocks remote scripts; inline scripts and package modules (`sill-asset:`) are allowed.
- `permissions` is metadata shown at install time, not a runtime gate.

## Extension points

| Point | Where | Rule |
|---|---|---|
| New built-in card | `renderer/src/widgets/registry.tsx` | add a definition + i18n key |
| New provider | `main/data` + `renderer/src/widgets/providers.ts` | public shape, permission, docs |
| New directive | `TemplateWidget.tsx` | no arbitrary expressions; update spec/validator |
| New action | `TemplateWidget.tsx` + main IPC | permission + allowlist + docs |
| New package rule | `main/widgets/package.ts` + CLI + spec | keep installer/CLI/spec in sync |
| New UI surface | renderer | reuse `.card` glass and CSS tokens |
| Web component | `WebWidget.tsx` + `preload/widget.ts` | bridge, or full Node when `trust: "trusted"` |
| Free layout | `shared/layout.ts` + `WidgetShell.tsx` | absolute boxes; auto-seeded from the flow grid |
| New theme token | `lib/tokens.ts` + `panel.css` | add to `THEME_TOKENS` so guests see it too |

## Directory map

```text
apps/desktop/src/
├─ main/        windows, data, settings, layout, widgets/package
├─ preload/     typed bridge
├─ renderer/    App, SettingsWindow, WidgetShell, TemplateWidget, providers
└─ shared/      data, layout, theme, i18n, widget payloads
packages/cli/   validate / pack / new / dev
examples/       dev-widget
docs/           DEVELOPMENT, WIDGET-SURFACE, ARCHITECTURE
```

## Testing

- Vitest: installer lifecycle, invalid packages, provider mapping.
- `pnpm smoke`: headless panel screenshot.
- Sill-Components validator: schemas, fixtures, examples, links.
- `verify.yml`: install, typecheck, test, build on Windows.

## Known gaps

- No directory download / auto-update / signing.
- No package upgrade-in-place (one version per id; uninstall then install loses the layout slot).
- Trust tiers are not implemented: every `.sill` shows the same confirmation, nothing is remembered.
- Web `sandboxed` guests have no storage / fetch and almost no API; the tier is due for a decision
  (isolation mode with real APIs, or removal).
- The six built-ins remain React, not templates.
- Free layout has no snapping, guides or nested containers yet.
- No root license yet.
