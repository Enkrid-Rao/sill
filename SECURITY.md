# Security

Sill runs on Windows with access to the user's desktop session. Treat widget packages and renderer
content as untrusted.

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

- **Widget package**: `.sill` zip with `widget.json`, `ui/index.html`, `ui/style.css`. It may come
  from an untrusted author.
- **Template content**: HTML/CSS only; no JS, no network, no filesystem. Sanitised and mounted in a
  Shadow DOM.
- **Renderer**: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`; all privileged
  work goes through preload IPC.
- **Main process**: owns filesystem, data collection, installer, settings and windows.

## In scope

- sandbox escape from a template or installed widget;
- path traversal or zip-slip in `.sill` install;
- reading files or data outside declared permissions;
- command execution / arbitrary network from a widget;
- IPC methods that let the renderer bypass main-process checks;
- installer writing outside `<userData>/components/`.

## Out of scope

- a user installing a malicious widget and granting it declared read permissions;
- unsigned builds triggering SmartScreen;
- denial of service by a widget that consumes CPU inside the renderer;
- third-party provider data being wrong.

## Hardening already in place

- fixed three-file package layout, size limits, zip entry allowlist;
- atomic install and uninstall;
- HTML tag/attribute allowlist and CSS `@import` / `url()` rejection;
- action allowlist with `action.media` / `action.todo`;
- no Node in the renderer.

See [Sill-Components security](https://github.com/Enkrid-Rao/sill-components/blob/main/docs/security.md)
for the widget-level model.
