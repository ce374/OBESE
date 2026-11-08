// Global fuzzy search across a workspace: file names + text content.

import Fuse from "fuse.js";
import type { NodeRecord, SearchResult } from "./types";
import { isInsideAssets } from "./fileSystem";

interface IndexEntry {
  id: string;
  name: string;
  path: string;
  content: string;
  type: "folder" | "file";
  assetKind: NodeRecord["assetKind"];
}

function buildPath(node: NodeRecord, byId: Map<string, NodeRecord>): string {
  const parts: string[] = [node.name];
  let cur = node.parentId ? byId.get(node.parentId) : undefined;
  while (cur) {
    parts.unshift(cur.name);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return parts.join("/");
}

export class SearchIndex {
  private fuse: Fuse<IndexEntry> | null = null;
  private entries: IndexEntry[] = [];
  private nodes: NodeRecord[] = [];

  rebuild(nodes: NodeRecord[]) {
    this.nodes = nodes;
    const byId = new Map(nodes.map((n) => [n.id, n]));
    this.entries = nodes.map((n) => ({
      id: n.id,
      name: n.name,
      path: buildPath(n, byId),
      content: n.textContent || "",
      type: n.type,
      assetKind: n.assetKind,
    }));
    this.fuse = new Fuse(this.entries, {
      keys: [
        { name: "name", weight: 0.6 },
        { name: "path", weight: 0.15 },
        { name: "content", weight: 0.25 },
      ],
      includeScore: true,
      includeMatches: true,
      threshold: 0.4,
      ignoreLocation: true,
      minMatchCharLength: 1,
      useExtendedSearch: false,
    });
  }

  get size() {
    return this.entries.length;
  }

  search(query: string, limit = 50): SearchResult[] {
    if (!this.fuse || !query.trim()) return [];
    const results = this.fuse.search(query, { limit });
    return results.map((r) => {
      const entry = r.item;
      let snippet = "";
      const contentMatch = r.matches?.find((m) => m.key === "content");
      if (contentMatch && entry.content) {
        const idx = contentMatch.indices?.[0]?.[0] ?? entry.content.indexOf(query);
        if (idx >= 0) {
          const start = Math.max(0, idx - 40);
          const end = Math.min(entry.content.length, idx + query.length + 60);
          snippet =
            (start > 0 ? "…" : "") +
            entry.content.slice(start, end).replace(/\s+/g, " ").trim() +
            (end < entry.content.length ? "…" : "");
        }
      }
      if (!snippet) {
        // For folders/assets, no snippet needed.
        snippet = "";
      }
      return {
        nodeId: entry.id,
        name: entry.name,
        path: entry.path,
        snippet,
        score: r.score ?? 0,
      };
    });
  }

  // Fast folder-only selector search for the move dialog.
  searchFolders(query: string, excludeId?: string): { id: string; path: string; name: string }[] {
    const q = query.trim().toLowerCase();
    const byId = new Map(this.nodes.map((n) => [n.id, n]));
    const folders = this.nodes.filter(
      (n) =>
        n.type === "folder" &&
        n.id !== excludeId &&
        (!excludeId || !isDescendantOf(this.nodes, excludeId, n.id))
    );
    const scored = folders
      .map((f) => {
        const path = buildPath(f, byId);
        const nameL = f.name.toLowerCase();
        const pathL = path.toLowerCase();
        let score = 0;
        if (nameL === q) score = 100;
        else if (nameL.startsWith(q)) score = 80;
        else if (nameL.includes(q)) score = 60;
        else if (pathL.includes(q)) score = 40;
        else score = -1;
        return { f, path, score };
      })
      .filter((x) => x.score >= 0 || !q)
      .sort((a, b) => b.score - a.score || a.path.length - b.path.length);
    return scored.slice(0, 200).map((x) => ({
      id: x.f.id,
      path: x.path,
      name: x.f.name,
    }));
  }
}

// Walk up from candidate to root; returns true if candidate is the same as
// rootId or a descendant of rootId (i.e., rootId is an ancestor of candidate).
function isDescendantOf(
  nodes: NodeRecord[],
  rootId: string,
  candidateId: string
): boolean {
  if (candidateId === rootId) return true;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let cur = byId.get(candidateId);
  while (cur && cur.parentId) {
    if (cur.parentId === rootId) return true;
    cur = byId.get(cur.parentId);
  }
  return false;
}

export const searchIndex = new SearchIndex();
