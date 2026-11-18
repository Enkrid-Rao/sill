# Contributing

Sill is a Windows Electron app with a small, explicit main/preload/renderer split. The widget format
and official catalog live in [Sill-Components](https://github.com/Enkrid-Rao/sill-components).

## Before you start

- Bug fix / small UI change: open a PR directly.
- New widget capability, provider, package format change: open an issue first. It usually touches the
  spec repo and the host together.
- Security issue: follow [SECURITY.md](SECURITY.md), not a public issue.

## Setup

```powershell
pnpm install
pnpm approve-builds --all
Remove-Item Env:ELECTRON_RUN_AS_NODE   # injected by the Electron host
pnpm dev
```

Requires Node 24 and pnpm 12. Windows 10/11 x64 is the supported runtime.

## Verify

Run all of these before opening a PR:

```powershell
pnpm typecheck
pnpm test
pnpm build
pnpm smoke
```

- `typecheck`: main + renderer.
- `test`: installer and provider unit tests (Vitest).
- `build`: electron-vite output in `apps/desktop/out`.
- `smoke`: headless panel, screenshot, exit.

For widget work also run:

```powershell
pnpm sill validate ./path/to/widget
pnpm sill pack ./path/to/widget -o ./widget.sill
```

The spec repo has its own validator:

```bash
python scripts/validate.py
```

## Architecture rules

- **Main process owns I/O.** Files, settings, data collection, package install, dialogs and
  windows live in `src/main`. The renderer never touches `fs` / `child_process` / Node.
- **Preload is the only bridge.** Add a typed method in `src/preload/index.ts` and
  `src/preload/index.d.ts`; expose it on `window.sill`.
- **Renderer is display + interaction.** It receives snapshots, layout, settings and widget
  payloads; it does not persist anything itself.
- **Cards own no glass.** `WidgetShell` renders `.card`; widget content must not paint its own
  opaque background. Glass and atmosphere come from the host.
- **Template widgets execute no JS.** The template engine only supports the documented directives.
  Do not add `eval`, `new Function`, inline event handlers or raw HTML.
- **Actions are allowlisted.** New commands need a permission, a host handler and docs; do not
  expose a generic `runCommand`.
- **Theme through CSS variables.** No hard-coded accent/glass colours, no `backdrop-filter`.
- **Installer is atomic.** Validate first, extract to a temp directory, then rename. Never write a
  half package into `components/`.

## Widget changes

A widget-facing change usually needs:

1. host code (`TemplateWidget`, `providers.ts`, installer or CLI);
2. a spec update in Sill-Components (`docs/`, `spec/`, `scripts/validate.py`);
3. a fixture or test;
4. an example under `examples/`.

If the change is not backwards compatible, bump `engine` or `schema` and document migration.

## Commit / PR

- Keep one concern per commit; messages follow `feat:`, `fix:`, `docs:`, `test:`, `chore:`.
- Do not commit generated `out/`, `dist/`, screenshots or `promo/`.
- Include what you ran in the PR description (`typecheck`, `test`, `smoke`, validator).
- UI changes need a before/after screenshot.

## License

No root license file is present yet; do not add one in a drive-by PR. Licensing is a maintainer
decision. The widget spec repository is MIT.
