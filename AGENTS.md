# Voyager — Claude Rules

Tauri v2 + SolidJS + Rust desktop file explorer. Project rules first, general
behavioral defaults below. Bias toward caution over speed; on trivial tasks,
use judgment.

> **Sync rule:** `CLAUDE.md` and `AGENTS.md` are identical copies (kept as
> plain files, not symlinks). When you change either one, apply the exact
> same change to the other so the two files stay byte-identical.

## Product invariants

Voyager exists to be a lightweight file manager that leaves no traces. These
are permanent constraints, not current limitations:

- **No OS traces (portable).** Voyager behaves like a portable app, meaning
  three things: (1) it never alters OS state — no registry, OS settings,
  default-app, or file-association changes; (2) it never reads file contents,
  so it neither creates nor triggers content caches (once a file is handed to
  the OS default app via the opener, external caching is out of scope); (3) it
  never writes caches, history, or settings into OS locations (`~/Library`,
  AppData, XDG) — no localStorage/sessionStorage, no store plugins, and the
  webview runs with `incognito: true` so it leaves no WebKit/WebView2 data
  directories. App state is session-only by default and dies with the process;
  deliberate defaults (e.g. window size) replace remembered state. The only
  sanctioned persistence is an opt-in sidecar settings file next to the
  executable (next to the `.app` on macOS, never inside it), silently falling
  back to session mode when that location is unwritable — see the portability
  section of `spec/README.md`.
- **No OS clipboard.** File copy/cut/paste uses the in-app clipboard only.
- **No content display.** No previews or thumbnails; file-type icons only.
- **Lightweight.** No new runtime dependencies unless explicitly agreed
  for a feature.

Modern-filer UX (tabs, keyboard shortcuts, mouse, DnD) is in scope; the
feature roadmap was completed in 2026-07.

## Architecture

- Rust commands live in `src-tauri/src/commands.rs` and are registered in
  `generate_handler!` in `src-tauri/src/lib.rs`. Every command gets a typed
  wrapper in `src/lib/ipc.ts`.
- State lives in singleton stores in `src/store/` — `explorer.ts` is the main
  facade, with small satellites (`clipboard.ts`, `settings.ts`, `tree.ts`).
  Pure logic is extracted into separate tested modules (`src/lib/*`,
  `src/store/history.ts`, `src/store/tabs.ts`); reactive stores are not tested.
- Components are dumb (props only). Only `src/App.tsx` touches the stores.

## Conventions

Before modifying anything under `src/` or `src-tauri/`, read
`spec/README.md` — the single source of truth for error format, IPC, store,
component, CSS, and test conventions. Do not restate its content.

## Repo invariants

- No new UI libraries (`@kobalte/core` only) and no new test frameworks.
- No DOM or E2E tests — Vitest covers pure logic modules only.
- Never touch `src-tauri/capabilities/` or `src-tauri/tauri.conf.json` unless
  a feature's agreed scope explicitly requires it.
- Colors come only from `:root` custom properties in `src/App.css`; row height
  is fixed at 28px.

## Feature workflow

- `spec/README.md` is the only spec document: conventions, implementation
  history, and investigation notes for on-hold work (OS drop-in, drag-out).
- For a new feature, write Goal / Non-goals / file changes / acceptance
  criteria up front and get agreement before implementing. Non-goals are
  prohibitions; changes stay within the listed files.
- Exception to the English-only rule below: `spec/README.md` prose is written
  in Japanese (code identifiers, types, and error messages stay English).

## Completion gate

Run before finishing any implementation work:

```sh
pnpm check          # biome check + tsc --noEmit
pnpm test           # vitest run
cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
```

## Approach

- **Think before coding.** State assumptions; if uncertain, ask. When multiple
  interpretations exist, surface them rather than silently picking one. If a simpler path
  exists, say so and push back when warranted.
- **Simplest thing that works.** Write the minimum code that solves the stated problem —
  nothing speculative. No unasked-for abstractions, flexibility, or error handling for
  impossible cases. If 200 lines could be 50, rewrite it.
- **Surgical changes.** Every changed line should trace to the request. Don't refactor,
  reformat, or "improve" adjacent code that isn't broken; match the surrounding style.
  Remove only the imports and symbols your change orphaned; leave unrelated dead code alone
  and mention it.
- **Goal-driven.** Turn each task into a verifiable outcome ("fix the bug" → "write a
  failing test that reproduces it, then make it pass"). For multi-step work, state a brief
  plan with a verification check per step, then loop until it passes.

## Language

Write in **English only**: in-code comments, console output, error and log messages, and
AI-readable config files (CLAUDE.md, AGENTS.md, etc.). The only exception is `spec/` prose
(see Feature workflow).

## Code Structure

- Name variables, functions, and files to communicate intent.
- One concern per file; split when a file exceeds ~300 lines.
- Extract a helper only when used in 3+ places; otherwise inline it.
- Delete dead code you create; never comment it out.

## Testing

- Write tests before or alongside implementation — they are your success criteria.
- Test observable outcomes and edge cases, not implementation details.
- Each test is fully self-contained; no shared mutable state between tests.

## Commits

Format:

```
<one-line summary>

<Why: one sentence — motivation or problem>

- <change 1>
- <change 2>
```

- Summary: imperative mood, ≤70 chars, no trailing period, no prefix tags (`feat:`, `fix:`, etc.).
- Why line: include only when motivation is not evident from the diff alone.
- Bullets: include only for 2+ distinct changes.
- Never commit secrets (`*.key`, `*.pem`, `credentials*`).
- Never use `--no-verify` or `--amend`; always create a new commit.
