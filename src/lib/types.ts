// Core domain types for the knowledge base

export type NodeType = "folder" | "file";

export type AssetKind =
  | "image"
  | "audio"
  | "pdf"
  | "document" // txt or markdown stored as an asset (document, not a note)
  | "text"; // generic text file

export interface Workspace {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

// A node is a folder or a file in the workspace tree.
// Text content for note files is stored inline (content field) for notes that
// are opened/edited. Binary asset blobs are stored in a separate `blobs` store
// keyed by nodeId to keep listing fast.
export interface NodeRecord {
  id: string;
  workspaceId: string;
  parentId: string | null; // null = root of workspace
  type: NodeType;
  name: string;
  // For files: mime type / extension hint. null for folders.
  mime: string | null;
  // Asset classification for files. null for folders.
  assetKind: AssetKind | null;
  // For text notes (markdown/txt that are notes, not assets): the content.
  // For asset documents (txt/md inside Assets): also stored here as text.
  // For binary assets: null (blob is in blobs store).
  textContent: string | null;
  size: number; // bytes (approx) for display
  createdAt: number;
  updatedAt: number;
  // Monotonic content version used for autosave conflict protection.
  contentVersion: number;
}

export interface BlobRecord {
  nodeId: string;
  blob: Blob;
  updatedAt: number;
}

// In-memory tree node used by the UI.
export interface TreeNode extends NodeRecord {
  children: TreeNode[];
  path: string; // full path from workspace root, e.g. "Folder/Sub/file.md"
}

export interface SearchResult {
  nodeId: string;
  name: string;
  path: string;
  snippet: string;
  score: number;
}
