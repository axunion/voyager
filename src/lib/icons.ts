import File from "lucide-solid/icons/file";
import FileArchive from "lucide-solid/icons/file-archive";
import FileAudio from "lucide-solid/icons/file-audio";
import FileCode from "lucide-solid/icons/file-code";
import FileImage from "lucide-solid/icons/file-image";
import FileText from "lucide-solid/icons/file-text";
import FileVideo from "lucide-solid/icons/file-video";
import Folder from "lucide-solid/icons/folder";
import type { Entry } from "./ipc";

type IconComponent = typeof File;

const ICON_BY_EXTENSION: Record<string, IconComponent> = {
  txt: FileText,
  md: FileText,
  pdf: FileText,
  mp4: FileVideo,
  mov: FileVideo,
  mp3: FileAudio,
  wav: FileAudio,
  png: FileImage,
  jpg: FileImage,
  jpeg: FileImage,
  gif: FileImage,
  svg: FileImage,
  zip: FileArchive,
  ts: FileCode,
  tsx: FileCode,
  js: FileCode,
  json: FileCode,
  rs: FileCode,
  html: FileCode,
  css: FileCode,
};

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return "";
  return name.slice(dot + 1).toLowerCase();
}

export function iconFor(entry: Entry): IconComponent {
  if (entry.is_dir) return Folder;
  return ICON_BY_EXTENSION[extensionOf(entry.name)] ?? File;
}
