import { invoke } from "@tauri-apps/api/core";

export interface Entry {
  name: string;
  path: string;
  is_dir: boolean;
  is_symlink: boolean;
  size: number | null;
  mtime: number | null;
}

export const readDirectory = (path: string, includeHidden: boolean) =>
  invoke<Entry[]>("read_directory", { path, includeHidden });

export const moveEntry = (source: string, targetDir: string) =>
  invoke<string>("move_entry", { source, targetDir });

export const moveToTrash = (path: string) =>
  invoke<void>("move_to_trash", { path });

export const renameEntry = (path: string, newName: string) =>
  invoke<string>("rename_entry", { path, newName });

export const createEntry = (parent: string, name: string, isDir: boolean) =>
  invoke<string>("create_entry", { parent, name, isDir });
