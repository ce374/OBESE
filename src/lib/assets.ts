// Asset format detection and classification.

import type { AssetKind } from "./types";

export const IMAGE_EXTS = ["jpg", "jpeg", "png", "gif", "webp"];
export const AUDIO_EXTS = ["flac", "opus", "webm", "mp3", "m4a"];
export const PDF_EXTS = ["pdf"];
export const DOC_EXTS = ["txt", "md", "markdown"]; // documents when inside Assets

export function getExtension(name: string): string {
  const idx = name.lastIndexOf(".");
  if (idx < 0) return "";
  return name.slice(idx + 1).toLowerCase();
}

export function stripExtension(name: string): string {
  const idx = name.lastIndexOf(".");
  if (idx <= 0) return name; // keep dotfiles, hide none
  return name.slice(0, idx);
}

export function classifyFile(
  name: string,
  mime: string | null,
  insideAssets: boolean
): { assetKind: AssetKind | null; mime: string | null } {
  const ext = getExtension(name);
  const m = (mime || "").toLowerCase();

  if (PDF_EXTS.includes(ext) || m === "application/pdf") {
    return { assetKind: "pdf", mime: mime || "application/pdf" };
  }
  if (IMAGE_EXTS.includes(ext) || m.startsWith("image/")) {
    const fixedMime = mime || imageMimeForExt(ext);
    return { assetKind: "image", mime: fixedMime };
  }
  if (AUDIO_EXTS.includes(ext) || m.startsWith("audio/")) {
    const fixedMime = mime || audioMimeForExt(ext);
    return { assetKind: "audio", mime: fixedMime };
  }
  // txt / md
  if (DOC_EXTS.includes(ext) || m === "text/plain" || m === "text/markdown") {
    if (insideAssets) {
      // Stored document, not a note.
      return { assetKind: "document", mime: mime || textMimeForExt(ext) };
    }
    // A note (markdown) or plain text note.
    return { assetKind: "text", mime: mime || textMimeForExt(ext) };
  }
  // Unknown file — treat as text note if no ext, else document asset.
  if (!ext) {
    return { assetKind: "text", mime: mime || "text/plain" };
  }
  return { assetKind: "document", mime: mime || "application/octet-stream" };
}

export function imageMimeForExt(ext: string): string {
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    default:
      return "image/octet-stream";
  }
}

export function audioMimeForExt(ext: string): string {
  switch (ext) {
    case "flac":
      return "audio/flac";
    case "opus":
      return "audio/ogg";
    case "webm":
      return "audio/webm";
    case "mp3":
      return "audio/mpeg";
    case "m4a":
      return "audio/mp4";
    default:
      return "audio/octet-stream";
  }
}

export function textMimeForExt(ext: string): string {
  if (ext === "md" || ext === "markdown") return "text/markdown";
  return "text/plain";
}

export function isNoteFile(assetKind: AssetKind | null): boolean {
  return assetKind === "text";
}

export function assetHasBlob(assetKind: AssetKind | null): boolean {
  return (
    assetKind === "image" || assetKind === "audio" || assetKind === "pdf"
  );
}

// Determine target Assets subfolder name for a given asset kind.
export function assetsSubfolderFor(assetKind: AssetKind): string {
  switch (assetKind) {
    case "image":
      return "Images";
    case "audio":
      return "Audio";
    case "pdf":
    case "document":
      return "Documents";
    default:
      return "Documents";
  }
}

// Reserved names for the auto-created asset structure.
export const ASSETS_FOLDER_NAME = "Assets";
export const ASSETS_SUBFOLDERS = ["Audio", "Images", "Documents"] as const;
