import File from "lucide-solid/icons/file";
import FileText from "lucide-solid/icons/file-text";
import Folder from "lucide-solid/icons/folder";
import { describe, expect, it } from "vitest";
import { extensionOf, iconFor } from "./icons";

describe("extensionOf", () => {
  it("returns the lowercased last extension", () => {
    expect(extensionOf("a.TXT")).toBe("txt");
    expect(extensionOf("archive.tar.gz")).toBe("gz");
  });

  it("returns empty for no extension, leading dot, or trailing dot", () => {
    expect(extensionOf("Makefile")).toBe("");
    expect(extensionOf(".gitignore")).toBe("");
    expect(extensionOf("weird.")).toBe("");
  });
});

describe("iconFor", () => {
  it("maps directories to Folder regardless of name", () => {
    expect(iconFor({ name: "src.txt", path: "/x", is_dir: true })).toBe(Folder);
  });

  it("maps known extensions case-insensitively", () => {
    expect(iconFor({ name: "a.TXT", path: "/x", is_dir: false })).toBe(
      FileText,
    );
  });

  it("falls back to File for unknown or missing extensions", () => {
    expect(iconFor({ name: "a.xyz", path: "/x", is_dir: false })).toBe(File);
    expect(iconFor({ name: "Makefile", path: "/x", is_dir: false })).toBe(File);
  });
});
