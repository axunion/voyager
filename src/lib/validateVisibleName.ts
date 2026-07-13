// Returns an error message when creating/renaming to `name` would make the
// entry invisible under the current hidden-files setting, null otherwise.
// Only the leading-dot rule lives here; everything else stays in Rust.
export function hiddenNameError(
  name: string,
  showHidden: boolean,
): string | null {
  if (showHidden || !name.startsWith(".")) return null;
  return `"${name}" would be hidden`;
}
