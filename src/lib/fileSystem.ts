// File system operations: create, rename, move (with cycle prevention),
// delete, tree building, and asset ingestion.

import {
  ASSETS_FOLDER_NAME,
  ASSETS_SUBFOLDERS,
  assetsSubfolderFor,
  assetHasBlob,
  classifyFile,
  getExtension,
  stripExtension,
} from "./assets";
import {
  bulkPutNodes,
  deleteNode,
  deleteNodeRecursive,
  getBlob,
  getNodesByWorkspace,
  putBlob,
  putNode,
} from "./idb";
import type { NodeRecord, TreeNode, Workspace } from "./types";
import { deleteWorkspace as idbDeleteWorkspace, putWorkspace } from "./idb";

function uid(): string {
  // Compact unique id (time + random).
  return (
    Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10)
  );
}

export function newId(): string {
  return uid();
}

// ---- Workspace lifecycle ----

export async function createWorkspace(name: string): Promise<Workspace> {
  const now = Date.now();
  const ws: Workspace = {
    id: uid(),
    name: name.trim() || "Workspace",
    createdAt: now,
    updatedAt: now,
  };
  await putWorkspace(ws);
  // Auto-create Assets folder + Audio/Images/Documents subfolders.
  const assetsFolder: NodeRecord = {
    id: uid(),
    workspaceId: ws.id,
    parentId: null,
    type: "folder",
    name: ASSETS_FOLDER_NAME,
    mime: null,
    assetKind: null,
    textContent: null,
    size: 0,
    createdAt: now,
    updatedAt: now,
    contentVersion: 0,
  };
  const subfolders: NodeRecord[] = ASSETS_SUBFOLDERS.map((sub) => ({
    id: uid(),
    workspaceId: ws.id,
    parentId: assetsFolder.id,
    type: "folder",
    name: sub,
    mime: null,
    assetKind: null,
    textContent: null,
    size: 0,
    createdAt: now,
    updatedAt: now,
    contentVersion: 0,
  }));
  await bulkPutNodes([assetsFolder, ...subfolders]);
  return ws;
}

export async function renameWorkspace(
  id: string,
  name: string
): Promise<void> {
  // Fetch, rename, put.
  const { getWorkspace } = await import("./idb");
  const ws = await getWorkspace(id);
  if (!ws) return;
  ws.name = name.trim() || ws.name;
  ws.updatedAt = Date.now();
  await putWorkspace(ws);
}

export async function removeWorkspace(id: string): Promise<void> {
  await idbDeleteWorkspace(id);
}

// ---- Node helpers ----

export async function getWorkspaceNodes(
  workspaceId: string
): Promise<NodeRecord[]> {
  return getNodesByWorkspace(workspaceId);
}

// Returns true if candidateId is the same as nodeId or one of its descendants.
export function isDescendant(
  nodes: NodeRecord[],
  nodeId: string,
  candidateId: string
): boolean {
  if (candidateId === nodeId) return true;
  // Walk up from candidate to root via parentId.
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let cur = byId.get(candidateId);
  while (cur && cur.parentId) {
    if (cur.parentId === nodeId) return true;
    cur = byId.get(cur.parentId);
  }
  return false;
}

// Build an in-memory tree from flat nodes.
export function buildTree(nodes: NodeRecord[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  for (const n of nodes) {
    byId.set(n.id, { ...n, children: [], path: n.name });
  }
  const roots: TreeNode[] = [];
  for (const n of nodes) {
    const node = byId.get(n.id)!;
    if (n.parentId && byId.has(n.parentId)) {
      byId.get(n.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  // Compute paths and sort.
  const annotate = (node: TreeNode, parentPath: string) => {
    node.path = parentPath ? `${parentPath}/${node.name}` : node.name;
    node.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
    for (const c of node.children) annotate(c, node.path);
  };
  roots.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
  for (const r of roots) annotate(r, "");
  return roots;
}

export function findNodeById(
  nodes: NodeRecord[],
  id: string
): NodeRecord | undefined {
  return nodes.find((n) => n.id === id);
}

// Determine whether a node lives inside the Assets folder tree.
export function isInsideAssets(
  nodes: NodeRecord[],
  nodeId: string
): boolean {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let cur = byId.get(nodeId);
  while (cur) {
    if (cur.name === ASSETS_FOLDER_NAME && cur.parentId === null) return true;
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return false;
}

// Find the Assets root folder for a workspace.
export function findAssetsFolder(nodes: NodeRecord[]): NodeRecord | undefined {
  return nodes.find((n) => n.name === ASSETS_FOLDER_NAME && n.parentId === null);
}

// Find a subfolder of Assets by name (e.g., "Images").
export function findAssetsSubfolder(
  nodes: NodeRecord[],
  assetsFolderId: string,
  name: string
): NodeRecord | undefined {
  return nodes.find(
    (n) => n.parentId === assetsFolderId && n.name === name && n.type === "folder"
  );
}

// ---- Name uniqueness ----

export function nameExistsInParent(
  nodes: NodeRecord[],
  parentId: string | null,
  name: string,
  excludeId?: string
): boolean {
  return nodes.some(
    (n) =>
      n.parentId === parentId &&
      n.name.toLowerCase() === name.toLowerCase() &&
      n.id !== excludeId
  );
}

export function uniqueName(
  nodes: NodeRecord[],
  parentId: string | null,
  name: string
): string {
  if (!nameExistsInParent(nodes, parentId, name)) return name;
  const ext = getExtension(name);
  const base = ext ? stripExtension(name) : name;
  let i = 1;
  // Cap attempts to avoid infinite loops.
  while (i < 10000) {
    const candidate = ext ? `${base} ${i}.${ext}` : `${base} ${i}`;
    if (!nameExistsInParent(nodes, parentId, candidate)) return candidate;
    i++;
  }
  return `${name} ${Date.now()}`;
}

// ---- Create folder / file ----

export async function createFolder(
  workspaceId: string,
  parentId: string | null,
  name: string,
  nodes: NodeRecord[]
): Promise<NodeRecord> {
  const finalName = uniqueName(nodes, parentId, name.trim() || "New Folder");
  const now = Date.now();
  const folder: NodeRecord = {
    id: newId(),
    workspaceId,
    parentId,
    type: "folder",
    name: finalName,
    mime: null,
    assetKind: null,
    textContent: null,
    size: 0,
    createdAt: now,
    updatedAt: now,
    contentVersion: 0,
  };
  await putNode(folder);
  return folder;
}

export async function createNote(
  workspaceId: string,
  parentId: string | null,
  name: string,
  nodes: NodeRecord[]
): Promise<NodeRecord> {
  let proposed = name.trim();
  if (!proposed) proposed = "Untitled";
  if (!getExtension(proposed)) proposed = `${proposed}.md`;
  const finalName = uniqueName(nodes, parentId, proposed);
  const { assetKind, mime } = classifyFile(finalName, null, false);
  const now = Date.now();
  const note: NodeRecord = {
    id: newId(),
    workspaceId,
    parentId,
    type: "file",
    name: finalName,
    mime,
    assetKind,
    textContent: "",
    size: 0,
    createdAt: now,
    updatedAt: now,
    contentVersion: 0,
  };
  await putNode(note);
  return note;
}

// ---- Rename ----

export async function renameNode(
  node: NodeRecord,
  newName: string,
  nodes: NodeRecord[]
): Promise<NodeRecord> {
  const proposed = newName.trim();
  if (!proposed || proposed === node.name) return node;
  // Preserve extension for files if user omitted it.
  let finalName = proposed;
  if (node.type === "file") {
    const oldExt = getExtension(node.name);
    if (oldExt && !getExtension(proposed)) {
      finalName = `${proposed}.${oldExt}`;
    }
  }
  // Enforce uniqueness among siblings.
  finalName = uniqueName(nodes, node.parentId, finalName);
  if (finalName === node.name) return node;
  const updated: NodeRecord = {
    ...node,
    name: finalName,
    updatedAt: Date.now(),
  };
  // Re-classify for files (extension may have changed).
  if (node.type === "file") {
    const inside = isInsideAssets(nodes, node.id);
    const { assetKind, mime } = classifyFile(finalName, node.mime, inside);
    updated.assetKind = assetKind;
    updated.mime = mime;
  }
  await putNode(updated);
  return updated;
}

// ---- Move ----

// Validate a move. Returns error string or null if valid.
export function validateMove(
  nodes: NodeRecord[],
  nodeId: string,
  targetParentId: string | null
): string | null {
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return "Item not found.";
  if (node.parentId === targetParentId) return "Already in this location.";
  if (node.type === "folder") {
    // Cannot move into itself or any descendant.
    if (targetParentId && isDescendant(nodes, nodeId, targetParentId)) {
      return "Cannot move a folder into itself or one of its descendants.";
    }
  }
  if (targetParentId) {
    const target = nodes.find((n) => n.id === targetParentId);
    if (!target || target.type !== "folder") return "Invalid destination.";
  }
  // Name uniqueness check (we'll auto-rename on conflict instead of blocking).
  return null;
}

export async function moveNode(
  node: NodeRecord,
  targetParentId: string | null,
  nodes: NodeRecord[]
): Promise<NodeRecord> {
  const err = validateMove(nodes, node.id, targetParentId);
  if (err) throw new Error(err);
  // Auto-rename if a name collision exists at the destination.
  let finalName = node.name;
  if (nameExistsInParent(nodes, targetParentId, node.name, node.id)) {
    finalName = uniqueName(nodes, targetParentId, node.name);
  }
  const updated: NodeRecord = {
    ...node,
    parentId: targetParentId,
    name: finalName,
    updatedAt: Date.now(),
  };
  await putNode(updated);
  return updated;
}

// ---- Delete ----

export async function removeNode(node: NodeRecord): Promise<void> {
  if (node.type === "folder") {
    await deleteNodeRecursive(node.id);
  } else {
    await deleteNode(node.id);
  }
}

// ---- Content save (with conflict protection) ----

// Save text content for a note. Only writes if `expectedVersion` matches the
// latest version known by the store; otherwise the save is silently skipped to
// prevent older async saves overwriting newer edits. The caller passes the
// version that was current when the edit was made.
export async function saveNoteContent(
  nodeId: string,
  content: string,
  expectedVersion: number
): Promise<boolean> {
  // Re-read the node to compare versions.
  const { getNode } = await import("./idb");
  const current = await getNode(nodeId);
  if (!current) return false;
  if (current.contentVersion > expectedVersion) {
    // A newer edit has been persisted already; skip this stale save.
    return false;
  }
  const updated: NodeRecord = {
    ...current,
    textContent: content,
    size: content.length,
    updatedAt: Date.now(),
    contentVersion: expectedVersion + 1,
  };
  await putNode(updated);
  return true;
}

// Force-save used on navigation / beforeunload. Bumps version from current.
export async function forceSaveNoteContent(
  nodeId: string,
  content: string
): Promise<void> {
  const { getNode } = await import("./idb");
  const current = await getNode(nodeId);
  if (!current) return;
  if (current.textContent === content) return;
  const updated: NodeRecord = {
    ...current,
    textContent: content,
    size: content.length,
    updatedAt: Date.now(),
    contentVersion: current.contentVersion + 1,
  };
  await putNode(updated);
}

// ---- Asset ingestion ----

// Ingest a binary/text File into the appropriate Assets subfolder.
// Returns the created node and the markdown reference string.
export async function ingestAsset(
  workspaceId: string,
  nodes: NodeRecord[],
  file: File,
  overrides?: { name?: string; folderId?: string }
): Promise<{ node: NodeRecord; markdownRef: string }> {
  const assetsFolder = findAssetsFolder(nodes);
  if (!assetsFolder) throw new Error("Assets folder missing.");
  // Determine kind from file name + type.
  const inside = true;
  const { assetKind, mime } = classifyFile(
    overrides?.name || file.name,
    file.type || null,
    inside
  );
  if (!assetKind) throw new Error("Unsupported file type.");
  const subName = assetsSubfolderFor(assetKind);
  const subfolder = findAssetsSubfolder(nodes, assetsFolder.id, subName);
  if (!subfolder) throw new Error(`${subName} subfolder missing.`);
  const targetFolderId = overrides?.folderId || subfolder.id;

  let proposedName = overrides?.name || file.name;
  let finalName = uniqueName(nodes, targetFolderId, proposedName);

  const now = Date.now();
  const id = newId();

  let textContent: string | null = null;
  let blob: Blob | null = null;
  let size = file.size;

  if (assetHasBlob(assetKind)) {
    blob = file;
  } else {
    // document (txt/md) asset — read text.
    textContent = await file.text();
    size = textContent.length;
  }

  const node: NodeRecord = {
    id,
    workspaceId,
    parentId: targetFolderId,
    type: "file",
    name: finalName,
    mime,
    assetKind,
    textContent,
    size,
    createdAt: now,
    updatedAt: now,
    contentVersion: 0,
  };
  await putNode(node);
  if (blob) {
    await putBlob({ nodeId: id, blob, updatedAt: now });
  }
  // Markdown reference uses asset:<id> so it survives renames & moves.
  const markdownRef = `![${stripExtension(finalName)}](asset:${id})`;
  return { node, markdownRef };
}

// Get a blob URL for an asset (cached on the node id).
const blobUrlCache = new Map<string, string>();

export async function getAssetBlobUrl(nodeId: string): Promise<string | null> {
  if (blobUrlCache.has(nodeId)) return blobUrlCache.get(nodeId)!;
  const blob = await getBlob(nodeId);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  blobUrlCache.set(nodeId, url);
  return url;
}

export function revokeAssetBlobUrl(nodeId: string): void {
  const url = blobUrlCache.get(nodeId);
  if (url) {
    URL.revokeObjectURL(url);
    blobUrlCache.delete(nodeId);
  }
}

export function clearBlobUrlCache(): void {
  for (const url of blobUrlCache.values()) {
    URL.revokeObjectURL(url);
  }
  blobUrlCache.clear();
  for (const url of thumbUrlCache.values()) {
    URL.revokeObjectURL(url);
  }
  thumbUrlCache.clear();
}

// Compressed thumbnail generation for image assets.
// Generates a small JPEG preview (max ~240px on the long edge) cached by node
// id, so grids of many assets stay responsive without decoding full images.
const thumbUrlCache = new Map<string, string>();
const thumbPromiseCache = new Map<string, Promise<string | null>>();

export async function getAssetThumbnailUrl(
  nodeId: string
): Promise<string | null> {
  if (thumbUrlCache.has(nodeId)) return thumbUrlCache.get(nodeId)!;
  if (thumbPromiseCache.has(nodeId)) return thumbPromiseCache.get(nodeId)!;
  const p = (async (): Promise<string | null> => {
    const blob = await getBlob(nodeId);
    if (!blob) return null;
    try {
      const url = URL.createObjectURL(blob);
      const img = await loadImage(url);
      URL.revokeObjectURL(url);
      const maxDim = 240;
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0, w, h);
      const thumbBlob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.7)
      );
      if (!thumbBlob) return null;
      const thumbUrl = URL.createObjectURL(thumbBlob);
      thumbUrlCache.set(nodeId, thumbUrl);
      return thumbUrl;
    } catch {
      return null;
    }
  })();
  thumbPromiseCache.set(nodeId, p);
  return p;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Resolve all asset references inside markdown content to their node ids.
export function extractAssetRefs(content: string): string[] {
  const set = new Set<string>();
  const re = /asset:([a-z0-9-]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) set.add(m[1]);
  return Array.from(set);
}

// Ingest a text asset (used for txt/md documents placed in Assets via import).
export async function ingestTextAsset(
  workspaceId: string,
  parentId: string,
  name: string,
  text: string,
  nodes: NodeRecord[]
): Promise<NodeRecord> {
  const finalName = uniqueName(nodes, parentId, name);
  const { assetKind, mime } = classifyFile(finalName, null, true);
  const now = Date.now();
  const node: NodeRecord = {
    id: newId(),
    workspaceId,
    parentId,
    type: "file",
    name: finalName,
    mime,
    assetKind,
    textContent: text,
    size: text.length,
    createdAt: now,
    updatedAt: now,
    contentVersion: 0,
  };
  await putNode(node);
  return node;
}

// Ingest a binary asset with raw bytes (used during ZIP import).
export async function ingestBinaryAsset(
  workspaceId: string,
  parentId: string,
  name: string,
  bytes: Uint8Array,
  mime: string | null,
  nodes: NodeRecord[]
): Promise<NodeRecord> {
  const finalName = uniqueName(nodes, parentId, name);
  const { assetKind, mime: fixedMime } = classifyFile(finalName, mime, true);
  const now = Date.now();
  const id = newId();
  const node: NodeRecord = {
    id,
    workspaceId,
    parentId,
    type: "file",
    name: finalName,
    mime: fixedMime,
    assetKind,
    textContent: null,
    size: bytes.byteLength,
    createdAt: now,
    updatedAt: now,
    contentVersion: 0,
  };
  await putNode(node);
  const blob = new Blob([bytes], { type: fixedMime || undefined });
  await putBlob({ nodeId: id, blob, updatedAt: now });
  return node;
}

// Create a note from imported text (markdown/txt outside Assets).
export async function ingestNote(
  workspaceId: string,
  parentId: string,
  name: string,
  text: string,
  nodes: NodeRecord[]
): Promise<NodeRecord> {
  const finalName = uniqueName(nodes, parentId, name);
  const { assetKind, mime } = classifyFile(finalName, null, false);
  const now = Date.now();
  const node: NodeRecord = {
    id: newId(),
    workspaceId,
    parentId,
    type: "file",
    name: finalName,
    mime,
    assetKind,
    textContent: text,
    size: text.length,
    createdAt: now,
    updatedAt: now,
    contentVersion: 0,
  };
  await putNode(node);
  return node;
}

// Ensure the Assets structure exists (used after import to guarantee folders).
export async function ensureAssetsStructure(
  workspaceId: string,
  nodes: NodeRecord[]
): Promise<{ assetsFolder: NodeRecord; subfolders: NodeRecord[] }> {
  let assetsFolder = findAssetsFolder(nodes);
  const now = Date.now();
  if (!assetsFolder) {
    assetsFolder = {
      id: newId(),
      workspaceId,
      parentId: null,
      type: "folder",
      name: ASSETS_FOLDER_NAME,
      mime: null,
      assetKind: null,
      textContent: null,
      size: 0,
      createdAt: now,
      updatedAt: now,
      contentVersion: 0,
    };
    await putNode(assetsFolder);
    nodes.push(assetsFolder);
  }
  const subfolders: NodeRecord[] = [];
  for (const sub of ASSETS_SUBFOLDERS) {
    let existing = findAssetsSubfolder(nodes, assetsFolder.id, sub);
    if (!existing) {
      existing = {
        id: newId(),
        workspaceId,
        parentId: assetsFolder.id,
        type: "folder",
        name: sub,
        mime: null,
        assetKind: null,
        textContent: null,
        size: 0,
        createdAt: now,
        updatedAt: now,
        contentVersion: 0,
      };
      await putNode(existing);
      nodes.push(existing);
    }
    subfolders.push(existing);
  }
  return { assetsFolder, subfolders };
}
