// ZIP import/export preserving folder hierarchy, filenames, content and assets.

import JSZip from "jszip";
import {
  ASSETS_FOLDER_NAME,
  assetHasBlob,
  classifyFile,
  getExtension,
} from "./assets";
import {
  ensureAssetsStructure,
  getWorkspaceNodes,
  newId,
} from "./fileSystem";
import { getAllBlobsForWorkspace, putNode } from "./idb";
import type { NodeRecord, Workspace } from "./types";

// ---- Export ----

// Build a full path for a node within its workspace.
function pathOf(node: NodeRecord, byId: Map<string, NodeRecord>): string {
  const parts: string[] = [node.name];
  let cur = node.parentId ? byId.get(node.parentId) : undefined;
  while (cur) {
    parts.unshift(cur.name);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return parts.join("/");
}

export async function exportWorkspaceZip(
  workspace: Workspace
): Promise<Blob> {
  const nodes = await getWorkspaceNodes(workspace.id);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const blobs = await getAllBlobsForWorkspace(workspace.id);

  const zip = new JSZip();
  // Ensure the root folder is represented by a leading folder in the zip.
  const root = zip.folder(workspace.name)!;

  // First add folders (so empty folders are preserved).
  for (const n of nodes) {
    if (n.type !== "folder") continue;
    const p = pathOf(n, byId);
    root.folder(p);
  }
  // Then add files.
  for (const n of nodes) {
    if (n.type !== "file") continue;
    const p = pathOf(n, byId);
    if (assetHasBlob(n.assetKind)) {
      const blob = blobs[n.id];
      if (blob) {
        root.file(p, blob);
      }
    } else if (n.textContent !== null) {
      root.file(p, n.textContent);
    }
  }
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}

// ---- Import ----

// Import a ZIP into a new or existing workspace. If `targetWorkspace` is
// provided, content is merged into it; otherwise a new workspace is created
// with the given name.
export async function importWorkspaceZip(
  file: File,
  targetWorkspace: Workspace | null,
  createWorkspace: (name: string) => Promise<Workspace>,
  ingestText: (
    parentId: string,
    name: string,
    text: string,
    asAsset: boolean
  ) => Promise<NodeRecord>,
  ingestBinary: (
    parentId: string,
    name: string,
    bytes: Uint8Array,
    mime: string | null
  ) => Promise<NodeRecord>,
  createFolderFn: (parentId: string | null, name: string) => Promise<NodeRecord>,
  getNodes: () => Promise<NodeRecord[]>
): Promise<{ workspace: Workspace; importedCount: number }> {
  const buf = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);

  // Determine workspace name: zip file name (without extension) or top folder.
  let wsName = file.name.replace(/\.zip$/i, "");
  // If there's a single top-level folder, use its name as workspace name and
  // flatten one level.
  const topEntries = Object.values(zip.files).filter(
    (e) => !e.dir && e.name.split("/").length > 0
  );
  const topDirs = Object.values(zip.files).filter((e) => e.dir);
  let prefix = "";
  const topFolderNames = new Set(
    topDirs.map((d) => d.name.split("/")[0]).filter(Boolean)
  );
  if (topFolderNames.size === 1) {
    const only = Array.from(topFolderNames)[0];
    // Use that folder name as the workspace name if the file name is generic.
    wsName = only;
    prefix = only + "/";
  }

  const workspace = targetWorkspace || (await createWorkspace(wsName));

  // We need to track created folders by their path so we can place children.
  // Re-read the workspace nodes (which include the auto Assets structure).
  let nodes = await getNodes();
  // Ensure assets structure exists.
  await ensureAssetsStructure(workspace.id, nodes);
  nodes = await getNodes();

  const folderByPath = new Map<string, NodeRecord>();
  // Root = null parent.
  folderByPath.set("", { id: "", parentId: null } as unknown as NodeRecord);
  // Pre-register the Assets structure so imported assets can be routed.
  const assetsFolder = nodes.find(
    (n) => n.name === ASSETS_FOLDER_NAME && n.parentId === null
  );
  if (assetsFolder) {
    folderByPath.set(ASSETS_FOLDER_NAME, assetsFolder);
  }

  // Determine if a path is inside an Assets folder anywhere in the zip.
  const isAssetPath = (path: string): boolean => {
    const parts = path.split("/");
    return parts.some((p) => p === ASSETS_FOLDER_NAME);
  };

  // Collect entries in a stable order (folders first, then files), sorted by
  // path depth ascending so parents are created before children.
  const entries = Object.values(zip.files);
  entries.sort((a, b) => {
    const da = a.name.split("/").length;
    const db = b.name.split("/").length;
    if (da !== db) return da - db;
    return a.name.localeCompare(b.name);
  });

  let importedCount = 0;

  // Helper: get or create a folder for a given path (relative to workspace
  // root, without the workspace-name prefix). Returns the folder id (or null
  // for root).
  const getOrCreateFolder = async (
    relPath: string
  ): Promise<NodeRecord | null> => {
    if (!relPath) return null;
    if (folderByPath.has(relPath)) {
      const cached = folderByPath.get(relPath)!;
      return cached.id === "" ? null : cached;
    }
    const parts = relPath.split("/").filter(Boolean);
    let parentId: string | null = null;
    let accum = "";
    let lastFolder: NodeRecord | null = null;
    for (const part of parts) {
      accum = accum ? `${accum}/${part}` : part;
      if (folderByPath.has(accum)) {
        const cached = folderByPath.get(accum)!;
        if (cached.id !== "") {
          parentId = cached.id;
          lastFolder = cached;
        } else {
          parentId = null;
          lastFolder = null;
        }
        continue;
      }
      // Create folder.
      const created = await createFolderFn(parentId, part);
      folderByPath.set(accum, created);
      parentId = created.id;
      lastFolder = created;
    }
    return lastFolder;
  };

  for (const entry of entries) {
    // Skip the workspace-name top folder entry itself.
    let name = entry.name;
    if (prefix && name.startsWith(prefix)) name = name.slice(prefix.length);
    if (!name) continue;
    // Normalize trailing slash for directories.
    if (entry.dir) {
      const dirPath = name.replace(/\/$/, "");
      if (!dirPath) continue;
      await getOrCreateFolder(dirPath);
      continue;
    }
    // It's a file. Determine parent folder path.
    const lastSlash = name.lastIndexOf("/");
    const parentPath = lastSlash > 0 ? name.slice(0, lastSlash) : "";
    const fileName = lastSlash > 0 ? name.slice(lastSlash + 1) : name;
    if (!fileName) continue;
    const parentFolder = await getOrCreateFolder(parentPath);
    const parentId = parentFolder ? parentFolder.id : null;

    const insideAssets = isAssetPath(name);
    const ext = getExtension(fileName);
    const isBinaryAsset =
      ["jpg", "jpeg", "png", "gif", "webp", "flac", "opus", "webm", "mp3", "m4a", "pdf"].includes(
        ext
      );

    if (isBinaryAsset) {
      const bytes = await entry.async("uint8array");
      const mimeGuess = guessMime(ext);
      await ingestBinary(parentId, fileName, bytes, mimeGuess);
      importedCount++;
    } else {
      // Text content (md, txt, or unknown).
      const text = await entry.async("string");
      // Decide if it's an asset document or a note.
      const { assetKind } = classifyFile(fileName, null, insideAssets);
      const asAsset = assetKind === "document";
      await ingestText(parentId, fileName, text, asAsset);
      importedCount++;
    }
  }

  return { workspace, importedCount };
}

function guessMime(ext: string): string | null {
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
    case "pdf":
      return "application/pdf";
    default:
      return null;
  }
}
