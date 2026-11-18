# Web Widgets

Status: **developer preview.** Local `.sill` install works; directory download / auto-update do not. Not in the 0.5.4 release.

Two trust levels:

| trust | JS | Node / Win32 | Use |
|---|---|---|---|
| `sandboxed` (default) | yes | no, bridge only | marketplace, untrusted code |
| `trusted` | yes | **full Node** | local/personal components, reviewed plugins |

The guest is transparent, so the host `.card` still supplies glass and atmosphere.

## Why not put JavaScript in templates

A template is mounted into the host renderer's Shadow DOM. Shadow DOM isolates CSS and DOM, not
JavaScript. A `<script>` in a template would run with the host's `window`, `window.sill`, IPC and
other cards. That is why templates stay JS-free.

A web widget is a separate JS realm. A sandboxed widget gets a narrow bridge; a trusted widget gets
the full Node environment and can do anything the app can.

## Package

```text
my-web-widget/
├─ widget.json
└─ ui/
   ├─ index.html
   ├─ style.css
   └─ main.js
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

## Bridge (sandboxed)

The guest preload exposes:

```js
sill.ready(({ data, language }) => {
  document.querySelector('#title').textContent = data.media.title
})

sill.onData(({ data, language }) => {
  // called on every host data update
})

sill.command('media.playpause')
```

- `data` uses the same manifest `data[].id` aliases as templates.
- `language` is `zh` / `en`.
- Host tokens (`--ink`, `--serif`, `--accent`, ...) are written onto the guest `<html>`.
- `command` is checked against the host action allowlist and manifest permissions.
- No Node, no `require`, no `fs`, no direct network.

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
- Guest document has a strict CSP: no network, no remote images/fonts, inline style/script only.
- `will-navigate` blocks navigation; the guest is a data URL with no remote origin.
- Local `.sill` install is implemented; directory download / auto-update are not.

Electron marks `<webview>` deprecated. This prototype uses it because it is transparent and
participates in layout; the long-term replacement is `WebContentsView` with the same component API.

## Examples

```powershell
# sandboxed
$env:SILL_DEV_WIDGET = 'D:\Projects\Sill\examples\dev-web'
pnpm dev

# trusted (full Node)
$env:SILL_DEV_WIDGET = 'D:\Projects\Sill\examples\dev-trusted'
pnpm dev
```

## Missing

- Directory download / auto-update.
- Assets (`ui/assets/...`) beyond `ui/main.js`.
- `sill.fetch` / `sill.storage`.
- Per-window / per-app audio APIs.
- `WebContentsView` migration.

## Per-app volume

- **trusted widget**: can call WASAPI through a bundled helper, PowerShell C# or a native addon.
  This is the Rainmeter-plugin equivalent; fastest path for a personal component.
- **sandboxed widget**: needs `audio.sessions` / `action.audio` from the host; otherwise it cannot
  read or change other applications' audio sessions.
