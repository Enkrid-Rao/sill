# Web Widgets (prototype)

Status: **dev-only prototype.** Not installable as `.sill` yet, not in the 0.5.4 release.

Template widgets are HTML/CSS only and run in the host renderer. Web widgets are full HTML/CSS/JS
and run in a separate `<webview>` guest. The guest is transparent, so the host `.card` still supplies
glass and atmosphere.

## Why not put JavaScript in templates

A template is mounted into the host renderer's Shadow DOM. Shadow DOM isolates CSS and DOM, not
JavaScript. A `<script>` in a template would run with the host's `window`, `window.sill`, IPC and
other cards. That is why templates stay JS-free.

A web widget is a separate JS realm. It gets a narrow bridge instead of the host realm.

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
  "size": { "w": 384, "h": 220 },
  "span": { "default": 1 },
  "permissions": ["data.media", "action.media"],
  "data": [{ "id": "media", "source": "media.nowPlaying" }],
  "ui": "ui/index.html"
}
```

`size.h` is the webview height. Templates size from content; web widgets need a height.

## Bridge

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
- Host tokens (`--ink`, `--serif`, `--accent`, ...) are written onto the guest `<html>` as CSS
  variables.
- `command` is checked against the host action allowlist and the manifest permissions. A guest
  cannot call arbitrary IPC.
- No Node, no `require`, no `fs`, no direct network.

## Security

- `webviewTag: true` on the host window.
- Guest `contextIsolation`, `nodeIntegration=false`, `sandbox`.
- Main-process `will-attach-webview` forces the widget preload and rejects non-`data:text/html` src.
- Guest document has a strict CSP: no network, no remote images/fonts, inline style/script only.
- `will-navigate` blocks navigation; the guest is a data URL with no remote origin.
- Install is not implemented, so a web widget cannot be delivered by the package manager yet.

Electron marks `<webview>` deprecated. This prototype uses it because it is transparent and
participates in layout; the long-term replacement is `WebContentsView` with the same component API.

## Current example

```powershell
$env:SILL_DEV_WIDGET = 'D:\Projects\Sill\examples\dev-web'
pnpm dev
```

The example uses `sill.ready` for the first clock value and a guest-local `setInterval` for updates.

## Missing

- `.sill` packaging / install for `type: "web"`.
- Assets (`ui/assets/...`) and a custom protocol.
- `sill.fetch` / `sill.storage`.
- Per-window / per-app audio APIs.
- `WebContentsView` migration.

## Per-app volume

A settings page that controls per-app volume needs more than a webview:

1. host audio session enumeration (WASAPI / Core Audio);
2. host commands to set volume / mute for a session;
3. permissions `data.audio` / `action.audio`;
4. a web widget UI.

The current runtime can render the UI (items 4), but items 1–3 do not exist. A template or web
widget cannot read or change other applications' audio sessions by itself.
