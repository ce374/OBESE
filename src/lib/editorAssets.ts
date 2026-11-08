// Helpers to resolve asset references inside the live-preview editor.
// Images resolve to their blob URL; audio/PDF/document assets resolve to a
// generated SVG placeholder card so they're recognizable while editing.

import { getAssetBlobUrl } from "./fileSystem";
import type { NodeRecord } from "./types";

const ASSET_PREFIX = "asset:";

export function isAssetRef(src: string): boolean {
  return typeof src === "string" && src.startsWith(ASSET_PREFIX);
}

export function assetIdFromRef(src: string): string {
  return src.slice(ASSET_PREFIX.length);
}

// Resolve an asset: src to a renderable URL for the editor's image plugin.
// Returns the blob URL for images, or an SVG placeholder data URI for other
// asset kinds.
export async function resolveAssetForEditor(
  src: string,
  nodeMap: Map<string, NodeRecord>
): Promise<string> {
  if (!isAssetRef(src)) return src;
  const id = assetIdFromRef(src);
  const node = nodeMap.get(id);
  if (!node) return placeholderDataUri("missing", "");
  if (node.assetKind === "image") {
    const url = await getAssetBlobUrl(id);
    return url || placeholderDataUri("image", node.name);
  }
  if (node.assetKind === "audio") {
    return placeholderDataUri("audio", node.name);
  }
  if (node.assetKind === "pdf") {
    return placeholderDataUri("pdf", node.name);
  }
  if (node.assetKind === "document") {
    return placeholderDataUri("document", node.name);
  }
  return placeholderDataUri("file", node.name);
}

// Generate an SVG data URI placeholder card for a non-image asset.
export function placeholderDataUri(
  kind: "audio" | "pdf" | "document" | "image" | "file" | "missing",
  name: string
): string {
  const label = kind.toUpperCase();
  const initial = name ? name.charAt(0).toUpperCase() : "?";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160" viewBox="0 0 240 160">
    <rect width="240" height="160" fill="#f4f4f5"/>
    <rect x="90" y="30" width="60" height="60" rx="8" fill="#d4d4d8"/>
    <text x="120" y="70" font-family="sans-serif" font-size="28" font-weight="600" fill="#71717a" text-anchor="middle">${escapeXml(initial)}</text>
    <text x="120" y="115" font-family="sans-serif" font-size="11" fill="#71717a" text-anchor="middle" font-weight="600">${escapeXml(label)}</text>
    <text x="120" y="135" font-family="sans-serif" font-size="9" fill="#a1a1aa" text-anchor="middle">${escapeXml(truncate(name, 24))}</text>
  </svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
