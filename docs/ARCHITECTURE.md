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
4. **Template engine** — `TemplateWidget` sanitises HTML/CSS, mounts a Shadow DOM and applies:
   - `data-sill-text`
   - `data-sill-i18n`
   - `data-sill-if` / `!`
   - `data-sill-repeat` with `item`
   - `data-sill-action` (`media.*`, `todo.toggle`)
   - `data-sill-meter` (`--sill-value`, 0–100)
5. **Providers** — `providers.ts` maps manifest `data[].source` to public objects:
   `time.now`, `system.*`, `media.nowPlaying`, `weather.current`, `todo.list`.

The engine rebuilds the shadow root on data changes. That is deliberate: no diffing, no hidden
state, and the same output for the same snapshot.

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

- No `eval`, no `new Function`, no inline handlers, no `href` / `src`.
- CSS allowlist rejects `@import`, `url()`, `expression()`.
- Actions are a fixed enum and require `action.media` / `action.todo`.
- The installer trusts only `widget.json`, `ui/index.html`, `ui/style.css`; path traversal and extra
  files are rejected.
- Providers expose only the public fields in `spec/providers.json`; process paths, command lines,
  PIDs and users are not included.

## Extension points

| Point | Where | Rule |
|---|---|---|
| New built-in card | `renderer/src/widgets/registry.tsx` | add a definition + i18n key |
| New provider | `main/data` + `renderer/src/widgets/providers.ts` | public shape, permission, docs |
| New directive | `TemplateWidget.tsx` | no arbitrary expressions; update spec/validator |
| New action | `TemplateWidget.tsx` + main IPC | permission + allowlist + docs |
| New package rule | `main/widgets/package.ts` + CLI + spec | keep installer/CLI/spec in sync |
| New UI surface | renderer | reuse `.card` glass and CSS tokens |`n| Web component | `WebWidget.tsx` + `preload/widget.ts` | sandboxed webview, bridge only |

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
- No package upgrade-in-place.
- Template has no formatting functions, image assets or generic style bindings.
- The five built-ins remain React, not templates.
- Web components are a dev-only prototype; no `.sill` package, assets, fetch/storage or `WebContentsView` migration.
- No root license yet.
