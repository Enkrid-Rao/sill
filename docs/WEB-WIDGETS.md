# Web Widgets

Status: **stable in `0.6.0`**. Local `.sill` install, URL install and the read-only catalog/update
prompt work; package signing and hashes do not.

A `web` component runs in its own webview guest instead of the panel page. Two modes:

| trust | JavaScript | Node / Win32 | Use |
|---|---|---|---|
| `sandboxed` (default, “isolated”) | yes, own realm | no Node; bridge + `sill.storage`; network via `https:` | heavy UI, crash isolation |
| `trusted` (“Node plugin”) | yes | **full Node** | local/personal plugins, native helpers |

The guest is transparent, so the host `.card` still supplies glass and atmosphere.

## Templates already have JavaScript

A template runs in the host page's Shadow DOM and can ship `ui/main.js`, which executes once with
`sill` and `root` (see the authoring guide). So the choice is not "JS or no JS"; it is:

| | template | web guest |
|---|---|---|
| Realm | host page (shared) | separate renderer |
| Host DOM | can reach it (trusted code) | only its own document |
| Crash isolation | no — a hang freezes the panel | yes — own process |
| Best for | normal cards, SVG, small scripts | React/Vue/Three, large libraries, crashy code, Node plugins |

Use `web` when you need process isolation or Node; otherwise `template` is lighter and gets the glass
for free.

## Package

```text
my-web-widget/
├─ widget.json
└─ ui/
   ├─ index.html
   ├─ style.css
   ├─ main.js
   └─ assets/          # optional: helper, icons, fonts
```

```json
{
  "schema": 1,
  "id": "com.example.player",
  "name": "Player",
  "version": "0.1.0",
  "author": "you",
  "license": "MIT",
  "runtime": ">=0.5.4",
  "engine": ">=0.1.0",
  "type": "web",
  "trust": "sandboxed",
  "size": { "w": 384, "h": 220 },
  "span": { "default": 1 },
  "permissions": ["data.media", "action.media"],
  "data": [{ "id": "media", "source": "media.nowPlaying" }],
  "ui": "ui/index.html"
}
```

`size.h` is the webview height. Templates size from content; web widgets need a height.

For full access:

```json
"trust": "trusted"
```

Trusted widgets can use `require('node:fs')`, `child_process`, native addons and Windows APIs.
They are **not** sandboxed. Only run code you wrote or reviewed.

## Bridge (isolated mode)

The guest preload exposes:

```js
sill.ready(({ data, language }) => {
  document.querySelector('#title').textContent = data.media.title
})

sill.onData(({ data, language }) => {
  // called on every host data update
})

sill.command('media.playpause')

// private storage: <userData>/widget-data/<id>.json
const saved = await sill.storage.get()
await sill.storage.patch({ lastPlayed: Date.now() })
```

- `data` uses the same manifest `data[].id` aliases as templates.
- `language` is `zh` / `en`.
- `dir` is the package/dev folder; trusted only. Use it with `ui/assets/**`.
- Host tokens (`--ink`, `--serif`, `--accent`, ...) are written onto the guest `<html>`.
- `command` is checked against the host action allowlist and manifest permissions.
- No Node, no `require`, no `fs`; `fetch` / remote images / fonts over `https:` are allowed.

## Trusted widgets

```js
const os = require('node:os')
const { execSync } = require('node:child_process')

document.querySelector('#host').textContent = os.hostname()
document.querySelector('#who').textContent = execSync('whoami').toString()
```

- The host sets partition `sill-trusted`; the main process then enables
  `nodeIntegration`, disables `contextIsolation` and `sandbox`.
- The widget HTML cannot choose its own trust: `trust` comes from the manifest and is fixed before
  attach.
- No marketplace / auto-update for trusted packages. Install must show a full-access warning.
- A trusted widget can read/delete files, run commands, access the network and call Windows APIs.

## Sandbox security

- `webviewTag: true` on the host window.
- Guest `contextIsolation`, `nodeIntegration=false`, `sandbox`.
- Main-process `will-attach-webview` forces the widget preload; only the host-set partition decides
  trusted vs sandboxed.
- Guest CSP blocks remote scripts; `https:` fetch, images, fonts and media are allowed, and
  `ui/**` modules load through `sill-asset:`. Each isolated component gets its own
  `sill-widget-<id>` partition.
- `will-navigate` blocks navigation; the guest is a data URL with no remote origin.
- Local `.sill` install is implemented; directory download / auto-update are not.

Electron marks `<webview>` deprecated. This prototype uses it because it is transparent and
participates in layout; the long-term replacement is `WebContentsView` with the same component API.

## Examples

```powershell
pnpm sill dev .\examples\dev-web       # sandboxed
pnpm sill dev .\examples\dev-trusted   # trusted full Node
```

## Missing

- Directory download / auto-update.
- `sill.fetch` (use the browser `fetch`; a host proxy only if CORS becomes a real problem).
- Host audio APIs; trusted components can ship their own WASAPI helper.
- `WebContentsView` migration.

## Per-app volume

- **trusted widget**: can call WASAPI through a bundled helper, PowerShell C# or a native addon.
  This is the Rainmeter-plugin equivalent; fastest path for a personal component.
- **isolated widget**: needs host `audio.sessions` / `action.audio`; otherwise it cannot read or
  change other applications' audio sessions.


