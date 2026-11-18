# Web Clock

`type: "web"` prototype: HTML/CSS/JS in a transparent webview guest.

```powershell
$env:SILL_DEV_WIDGET = 'D:\Projects\Sill\examples\dev-web'
pnpm dev
```

- The guest calls `sill.ready` for the first host payload.
- The guest has its own JS realm; `setInterval` only updates this widget.
- `ui/main.js` is inlined into a data URL with a strict CSP; no network, no Node.
- The card is a normal `.card`; the webview is transparent.

Not installable as `.sill` yet. See [docs/WEB-WIDGETS.md](../../docs/WEB-WIDGETS.md).
