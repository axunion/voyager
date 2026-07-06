# Voyager Engineering Rules

Tauri v2 + SolidJS desktop file explorer. Architecture map:

- Rust commands live in `src-tauri/src/commands.rs` and are registered in
  `generate_handler!` in `src-tauri/src/lib.rs`. Every command gets a typed
  wrapper in `src/lib/ipc.ts`.
- State is a singleton facade store (`src/store/explorer.ts`). Pure logic is
  extracted into separate tested modules (`src/store/history.ts` is the
  precedent); the reactive store itself is not tested.
- Components are dumb (props only). Only `src/App.tsx` touches the store.

## Conventions

Before modifying anything under `src/` or `src-tauri/`, read
`spec/00-conventions.md` — the single source of truth for error format, IPC,
store, component, CSS, and test conventions. Do not restate its content.

## Repo invariants

- No new UI libraries (`@kobalte/core` only) and no new test frameworks.
- No DOM or E2E tests — Vitest covers pure logic modules only.
- Never touch `src-tauri/capabilities/` or `src-tauri/tauri.conf.json` unless
  the feature spec explicitly requires it.
- Colors come only from `:root` custom properties in `src/App.css`; row height
  is fixed at 28px (virtualizer prerequisite).

## Completion gate

Run before finishing any implementation work:

```sh
pnpm check          # biome check + tsc --noEmit
pnpm test           # vitest run
cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
```

## Feature scope

Roadmap features are bounded by their `spec/NN-*.md`: Non-goals are
prohibitions, and changes stay within the spec's File changes table.
