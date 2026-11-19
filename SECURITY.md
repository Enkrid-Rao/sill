# Security

Sill runs on Windows with access to the user's desktop session.

**Components are local trusted code.** The model is the same as Rainmeter skins or a VS Code
extension: installing a `.sill`, or dropping a folder into `skins/`, is the authorisation. The host
does not try to contain a malicious component at runtime — that would tax every honest component.
The job of the installer is to make the decision informed and the failure modes boring.

## Trust levels

| Type | Where it runs | What it can do |
|---|---|---|
| `template` | In the panel page (Shadow DOM) | Full host API: `window.sill` IPC, storage, network, DOM of its own shadow root. Optional `ui/main.js` runs in the panel page. |
| `web` + `trust: "sandboxed"` | Own webview guest | The `sill` bridge only; no Node, no host DOM. |
| `web` + `trust: "trusted"` | Own webview guest | Full Node: filesystem, `child_process`, native addons, network, Win32. |

`permissions` in `widget.json` is **metadata for the install prompt and the catalogue**, not a
runtime gate. `sill.host` exposes the whole preload API, so a template can call anything the app can.

What this means in practice:

- Only install components from a source you trust, exactly like a Rainmeter skin;
- The install prompt is **tiered by what the package actually contains**, not by its manifest:
  - `static` (no `ui/main.js`, no `on*`, no `<script>`) installs without a prompt;
  - `script` (a template that runs code) shows a warning that it runs with the same privileges as
    Sill;
  - `isolated` (`web` guest without Node) explains the bridge;
  - `node` (`web` + `trust: "trusted"`) warns about full Node and requires a checkbox.
- A confirmed component is remembered in `<userData>/trust.json`; installing the same id with the
  same or lower tier does not ask again. A tier increase (e.g. a later version adds `main.js`)
  asks again.
- A component can read the data the host already collected (todo text, process names, weather
  location, media metadata) and can send it anywhere. Treat that as part of "trusting" it.

## Supported versions

Security fixes target the latest published release and `main`. Older releases may not receive
patches.

## Reporting

Do not open a public issue for a vulnerability.

Use GitHub's private vulnerability reporting:

<https://github.com/Enkrid-Rao/sill/security/advisories/new>

Include:

- Sill version and Windows version;
- steps to reproduce;
- impact (data read/write, code execution, privilege boundary);
- whether a widget package is involved, and the package contents if safe to share.

Do not include real user data, tokens or personal paths. You will get an acknowledgement when the
report is triaged; there is no bug bounty.

## Threat model

**Assets.** The user's files, `%APPDATA%\Sill` (settings / layout / todos / widget data), the window
and tray, and the integrity of the installed component set.

**Adversaries.** A malicious `.sill` package; a compromised download; a component author who ships an
update that does more than the README says.

**Not defended.** A component that is trusted at install time can do anything the app can. There is no
sandbox to escape, because there is no sandbox.

## In scope

- installer writing outside `<userData>/components/` (path traversal, zip-slip, absolute paths);
- `sill-asset://` serving files outside the component directory;
- a package that lies about its type or privileges to change what the user is shown;
- IPC or preload surface that lets a *host* page action bypass a main-process check;
- update channel issues: unsigned installer accepted, wrong release downloaded;
- denial of service that survives a restart (orphaned processes, infinite crash-reload loops).

## Out of scope

- a component doing what its install prompt says it can (network, files, settings);
- a user installing a component from an untrusted source;
- unsigned builds triggering SmartScreen;
- a component consuming CPU inside the renderer (crash isolation is a `web`-type concern);
- third-party provider data being wrong.

## Engineering boundaries that remain

These are about accidents and bad packages, not about containing malicious code:

- fixed entry (`ui/index.html`), `widget.json` at the root, files limited to root metadata + `ui/**`;
- `/`, `\`, `..`, drive letters and UNC paths rejected in zip entries;
- 20 MB per file, 50 MB per package, 500 files;
- install through a temp directory and an atomic rename; uninstall deletes only
  `<userData>/components/<id>@<version>`;
- `sill-asset://` resolves through `within(componentDir)` and only serves existing files;
- the panel renderer keeps `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
  (components run *inside* it deliberately; the guest webview is the isolated option);
- CSP blocks remote script loading in the panel and in the guest; inline scripts and package modules
  are allowed by design.

## Hardening already in place

- component file allowlist and size budgets;
- path-safe zip extraction and atomic install;
- `sill-asset://` confined to the component directory;
- trusted-web packages ask for an explicit confirmation that mentions full access;
- release builds are produced by `electron-builder`; auto-update uses Electron's
  `electron-updater` with SHA512 verification from `latest.yml`.

See the component-level model in
[Sill-Components › security.md](https://github.com/Enkrid-Rao/sill-components/blob/main/docs/security.md).
