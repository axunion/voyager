---
name: implement-feature
description: Implement a Voyager roadmap feature from its spec, with quality gates. Takes a spec number or feature name as argument. Trigger on requests like "implement spec 03", "spec 02 を実装して", "タブ機能を作って", "次の機能をやって". Also trigger on continuation requests like "spec 02 の続き" or "マイルストーン B をやって". Do not trigger for ad-hoc bug fixes or changes outside the spec roadmap — those follow the normal rules without this workflow.
---

Implement one roadmap feature (`spec/NN-*.md`) end to end in this session,
with the project's quality gates built in.

## Workflow

1. **Load context.** Read `spec/00-conventions.md` in full, then the target
   `spec/NN-*.md`, then the status table and dependency graph in
   `spec/README.md`. If the user named a feature instead of a number, resolve
   it via the README index.

2. **Gate on prerequisites.** Every spec listed under Prerequisites must be
   `完了` in the README status table. If one is not, stop and report the
   blocker — do not start implementing. (Spec 02 may be split into milestones
   A/B across two sessions; its status stays `実装中` with a 備考 note.)

3. **Mark in progress.** Set the feature's README status row to `実装中`.

4. **Implement.** Modify only files listed in the spec's File changes table.
   If the implementation seems to require a file outside the table, stop and
   ask the user instead of improvising. Follow the established patterns:
   pure logic extracted into a separate module (like `src/store/history.ts`),
   new Rust commands in `commands.rs` + `generate_handler!` + a typed wrapper
   in `src/lib/ipc.ts`, dumb components wired only in `App.tsx`.

5. **Tests.** Exactly what the spec's Test plan names: Vitest for the
   extracted pure modules, Rust `tempfile` tests in `commands.rs`. No DOM/E2E
   tests, no new frameworks.

6. **Run the completion gate** (see `CLAUDE.md`); iterate
   until everything is green.

7. **Independent review.** Launch the `code-reviewer` agent, passing the spec
   file path. Fix confirmed findings; re-run the gate if anything changed.

8. **Close out.** Set the README status to `完了` (or keep `実装中` with a
   備考 for a partial milestone). Print the spec's 手動検証手順 for the user
   — GUI behavior cannot be machine-verified, so their manual pass is the
   final quality gate.

9. **Stop. Do not commit.** Committing is handled by the user's `ax-commit-x`
   skill after manual verification.
