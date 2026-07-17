# Voyager

A lightweight desktop file explorer that leaves no traces, built with
Tauri v2, SolidJS, and Rust.

## Features

- Tabs, path bar, directory tree, and a virtualized file list
- Full keyboard navigation and shortcuts, plus manual refresh
- Multi-select (Ctrl/Shift click) and rubber-band drag selection
- Copy / cut / paste with an in-app clipboard
- Sortable columns (name, size, modified time) and a hidden-files toggle
- File operations: open, create, rename, move to trash, drag & drop

## Design principles

- **Zero persistence.** No caches, history, or settings are written anywhere;
  all state lives in memory and dies with the process.
- **No OS clipboard.** File operations never touch the system clipboard.
- **No content display.** File-type icons only — no previews or thumbnails.

## Install

Prebuilt binaries for macOS (Apple Silicon), Windows, and Linux are available
on the [Releases](https://github.com/axunion/voyager/releases) page.

macOS builds are ad-hoc signed (no Apple Developer ID), so the first launch is
blocked by Gatekeeper. Allow it via System Settings > Privacy & Security >
"Open Anyway", or run `xattr -cr /Applications/voyager.app`.

## Development

Requires [Node.js](https://nodejs.org/) with [pnpm](https://pnpm.io/),
[Rust](https://www.rust-lang.org/tools/install), and the
[Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/).

```sh
pnpm install
pnpm tauri dev      # run the app
pnpm tauri build    # build a release bundle
```

Quality checks:

```sh
pnpm check          # biome check + tsc --noEmit
pnpm test           # vitest run
cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
```

Conventions and design records live in [`spec/README.md`](spec/README.md)
(Japanese). Rules for AI coding agents are in [`CLAUDE.md`](CLAUDE.md) /
[`AGENTS.md`](AGENTS.md).
