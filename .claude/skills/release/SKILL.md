---
name: release
description: >-
  Cut a new Voyager release end-to-end: pick the next version, sync it across
  package.json / tauri.conf.json / Cargo.toml (+ Cargo.lock), run the
  completion gate, commit and push, then push the v* tag that triggers the
  GitHub Actions release build, watch it, and verify the uploaded bundles.
  Use this whenever the user asks to release or ship a new version — e.g.
  "リリースして", "v0.2.0 を出して", "新しいバージョンを出したい", "cut a
  release", "bump the version and release" — even if they only mention
  bumping the version or tagging, when the intent is producing a release.
  Do NOT use for ordinary commits (ax-commit-x), fixing CI, or editing the
  release workflow itself.
---

# Voyager Release

Releases are built by `.github/workflows/release.yml`: pushing a `v*` tag
builds macOS (aarch64, ad-hoc signed), Windows, and Linux bundles and attaches
them to a **draft** GitHub Release. Publishing the draft is always a manual
browser step at the end — never attempt to publish it yourself.

## Constraints that shape this flow

- The release name and `__VERSION__` substitution come from
  `src-tauri/tauri.conf.json`, **not** from the tag. If the tag and the config
  version disagree, the release is created under the wrong name. Version sync
  across all three manifests is therefore the critical step.
- The `gh` CLI may be authenticated as an account without admin rights on this
  repository. In that case `gh workflow run` fails with HTTP 403 and draft
  releases are invisible to `gh` (`release not found`). Trigger the build by
  pushing the tag, and verify uploads through the public run logs instead of
  `gh release view`.
- Tags on a public repository are outward-facing and awkward to retract, so
  everything (gate, CI) must be green *before* the tag is pushed.

## Steps

### 1. Determine the new version

- Read the current version from `src-tauri/tauri.conf.json`.
- Take the new version from the user's request; if not given, propose a patch
  bump and confirm. Validate it is `X.Y.Z` semver and greater than current.
- Confirm the working tree is clean and on `main` (`git status`). Unrelated
  uncommitted changes must be committed or stashed first — the release commit
  must contain only the version bump.

### 2. Sync the version

Update the version in all three manifests:

- `package.json`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`

Then refresh the lockfile entry: `cd src-tauri && cargo check` (this rewrites
`Cargo.lock` for the `voyager` package). Verify all four files now carry the
same version before continuing.

### 3. Run the completion gate

```sh
pnpm check
pnpm test
cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
```

Stop and report if anything fails — do not commit or tag on a red gate.

### 4. Commit, push, wait for CI

- Commit per the CLAUDE.md commit format, e.g. summary `Bump version to X.Y.Z`
  (no Why line needed; no bullets — it is one change).
- Push to `main`, then wait for the CI workflow on that commit:
  `gh run watch <run-id> --exit-status` (find the id with
  `gh run list --workflow=ci.yml --limit 1`).
- If CI fails, stop before tagging and report.

### 5. Tag and build

```sh
git tag vX.Y.Z && git push origin vX.Y.Z
```

Watch the release build (three jobs, typically 5–10 minutes):

```sh
gh run list --workflow=release.yml --limit 1   # get the run id
gh run watch <run-id> --exit-status --interval 30
```

Run the watch in the background and report when it completes.

### 6. Verify the uploaded assets

Draft releases may be invisible to `gh`, so verify through the public logs:

```sh
gh run view <run-id> --log | grep "successfully uploaded" \
  | sed -E 's/.*Z (.*) successfully uploaded.*/\1/' | sort -u
```

Expect 7 assets: `.dmg`, `.app.tar.gz` (macOS), `-setup.exe`, `.msi`
(Windows), `.AppImage`, `.deb`, `.rpm` (Linux).

### 7. Hand off to the user

Report the asset list and ask the user to review and publish the draft at
<https://github.com/axunion/voyager/releases>. Remind them the macOS build is
ad-hoc signed, so first launch needs System Settings > Privacy & Security >
"Open Anyway" (or `xattr -cr /Applications/voyager.app`).

## If the build fails after the tag was pushed

1. Diagnose and fix on `main` (gate + CI green again).
2. Delete the remote tag and any draft release the failed run created
   (the draft must be deleted in the browser if `gh` cannot see it):
   `git tag -d vX.Y.Z && git push origin :refs/tags/vX.Y.Z`
3. Re-tag the fixed commit and push again (step 5).

Never force-move a tag that already produced a published release; bump to the
next patch version instead.
