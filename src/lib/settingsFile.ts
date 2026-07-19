// Schema of the sidecar settings file (voyager.json). This module is the
// single authority: Rust treats the file content as an opaque string.

export interface PersistedSettings {
  showHidden: boolean;
}

/**
 * Parses raw sidecar-file content. Returns null when the content is not a
 * JSON object (corrupt file → caller stays session-only). Unknown keys are
 * ignored and missing/mistyped known keys fall back to defaults, so future
 * versions can extend the schema.
 */
export function parsePersistedSettings(raw: string): PersistedSettings | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const obj = parsed as Record<string, unknown>;
  return {
    showHidden: typeof obj.showHidden === "boolean" ? obj.showHidden : false,
  };
}

/** Pretty-printed so users can open and read the file. */
export function serializePersistedSettings(s: PersistedSettings): string {
  return `${JSON.stringify(s, null, 2)}\n`;
}
