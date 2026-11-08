// Global client state for the knowledge base.

"use client";

import { create } from "zustand";
import {
  buildTree,
  createFolder as fsCreateFolder,
  createNote as fsCreateNote,
  ensureAssetsStructure,
  getWorkspaceNodes,
  ingestAsset,
  ingestBinaryAsset,
  ingestNote,
  ingestTextAsset,
  moveNode as fsMoveNode,
  removeNode as fsRemoveNode,
  renameNode as fsRenameNode,
  renameWorkspace as fsRenameWorkspace,
} from "./fileSystem";
import {
  createWorkspace as fsCreateWorkspace,
  removeWorkspace as fsRemoveWorkspace,
} from "./fileSystem";
import { getAllWorkspaces } from "./idb";
import type { NodeRecord, TreeNode, Workspace } from "./types";

interface KbState {
  // Workspace list
  workspaces: Workspace[];
  workspacesLoaded: boolean;
  activeWorkspaceId: string | null;

  // Nodes for the active workspace (flat list, kept in memory)
  nodes: NodeRecord[];
  tree: TreeNode[];
  nodesLoaded: boolean;

  // Currently open file (note). Null when nothing open.
  activeNodeId: string | null;

  // UI
  panelOpen: boolean;
  searchQuery: string;

  // Actions
  loadWorkspaces: () => Promise<void>;
  selectWorkspace: (id: string) => Promise<void>;
  leaveWorkspace: () => void;
  createWorkspace: (name: string) => Promise<Workspace>;
  renameWorkspace: (id: string, name: string) => Promise<void>;
  deleteWorkspace: (id: string) => Promise<void>;

  refreshNodes: () => Promise<void>;
  createFolder: (parentId: string | null, name: string) => Promise<NodeRecord>;
  createNote: (parentId: string | null, name: string) => Promise<NodeRecord>;
  renameNode: (node: NodeRecord, name: string) => Promise<NodeRecord>;
  moveNode: (node: NodeRecord, targetParentId: string | null) => Promise<NodeRecord>;
  deleteNode: (node: NodeRecord) => Promise<void>;
  ingestAssetFile: (file: File, name?: string) => Promise<{ node: NodeRecord; markdownRef: string }>;
  ingestImportedText: (
    parentId: string,
    name: string,
    text: string,
    asAsset: boolean
  ) => Promise<NodeRecord>;
  ingestImportedBinary: (
    parentId: string,
    name: string,
    bytes: Uint8Array,
    mime: string | null
  ) => Promise<NodeRecord>;

  openNode: (id: string) => void;
  closeNode: () => void;
  setPanelOpen: (open: boolean) => void;
  setSearchQuery: (q: string) => void;

  // Patch a node in the in-memory list after an external update (e.g., autosave).
  patchNode: (id: string, patch: Partial<NodeRecord>) => void;
}

export const useKbStore = create<KbState>((set, get) => ({
  workspaces: [],
  workspacesLoaded: false,
  activeWorkspaceId: null,
  nodes: [],
  tree: [],
  nodesLoaded: false,
  activeNodeId: null,
  panelOpen: true,
  searchQuery: "",

  loadWorkspaces: async () => {
    const ws = await getAllWorkspaces();
    ws.sort((a, b) => b.updatedAt - a.updatedAt);
    set({ workspaces: ws, workspacesLoaded: true });
  },

  selectWorkspace: async (id) => {
    set({
      activeWorkspaceId: id,
      activeNodeId: null,
      searchQuery: "",
      panelOpen: true,
    });
    await get().refreshNodes();
  },

  leaveWorkspace: () => {
    set({
      activeWorkspaceId: null,
      activeNodeId: null,
      nodes: [],
      tree: [],
      nodesLoaded: false,
      searchQuery: "",
      panelOpen: true,
    });
  },

  createWorkspace: async (name) => {
    const ws = await fsCreateWorkspace(name);
    const list = await getAllWorkspaces();
    list.sort((a, b) => b.updatedAt - a.updatedAt);
    set({ workspaces: list });
    return ws;
  },

  renameWorkspace: async (id, name) => {
    await fsRenameWorkspace(id, name);
    const list = await getAllWorkspaces();
    list.sort((a, b) => b.updatedAt - a.updatedAt);
    set({ workspaces: list });
  },

  deleteWorkspace: async (id) => {
    await fsRemoveWorkspace(id);
    const list = await getAllWorkspaces();
    list.sort((a, b) => b.updatedAt - a.updatedAt);
    set({
      workspaces: list,
      activeWorkspaceId:
        get().activeWorkspaceId === id ? null : get().activeWorkspaceId,
      nodes: get().activeWorkspaceId === id ? [] : get().nodes,
      tree: get().activeWorkspaceId === id ? [] : get().tree,
      activeNodeId: get().activeWorkspaceId === id ? null : get().activeNodeId,
    });
  },

  refreshNodes: async () => {
    const wsId = get().activeWorkspaceId;
    if (!wsId) return;
    let nodes = await getWorkspaceNodes(wsId);
    // Make sure Assets structure always exists.
    await ensureAssetsStructure(wsId, nodes);
    nodes = await getWorkspaceNodes(wsId);
    const tree = buildTree(nodes);
    set({ nodes, tree, nodesLoaded: true });
  },

  createFolder: async (parentId, name) => {
    const nodes = get().nodes;
    const wsId = get().activeWorkspaceId!;
    const folder = await fsCreateFolder(wsId, parentId, name, nodes);
    const updated = [...get().nodes, folder];
    set({ nodes: updated, tree: buildTree(updated) });
    return folder;
  },

  createNote: async (parentId, name) => {
    const nodes = get().nodes;
    const wsId = get().activeWorkspaceId!;
    const note = await fsCreateNote(wsId, parentId, name, nodes);
    const updated = [...get().nodes, note];
    set({ nodes: updated, tree: buildTree(updated) });
    return note;
  },

  renameNode: async (node, name) => {
    const updated_node = await fsRenameNode(node, name, get().nodes);
    const updated = get().nodes.map((n) => (n.id === updated_node.id ? updated_node : n));
    set({ nodes: updated, tree: buildTree(updated) });
    return updated_node;
  },

  moveNode: async (node, targetParentId) => {
    const moved = await fsMoveNode(node, targetParentId, get().nodes);
    const updated = get().nodes.map((n) => (n.id === moved.id ? moved : n));
    set({ nodes: updated, tree: buildTree(updated) });
    return moved;
  },

  deleteNode: async (node) => {
    await fsRemoveNode(node);
    const updated = get().nodes.filter((n) => n.id !== node.id);
    set({
      nodes: updated,
      tree: buildTree(updated),
      activeNodeId: get().activeNodeId === node.id ? null : get().activeNodeId,
    });
  },

  ingestAssetFile: async (file, name) => {
    const wsId = get().activeWorkspaceId!;
    const node = await ingestAsset(wsId, get().nodes, file, name ? { name } : undefined);
    const updated = [...get().nodes, node.node];
    set({ nodes: updated, tree: buildTree(updated) });
    return node;
  },

  ingestImportedText: async (parentId, name, text, asAsset) => {
    const wsId = get().activeWorkspaceId!;
    const node = asAsset
      ? await ingestTextAsset(wsId, parentId, name, text, get().nodes)
      : await ingestNote(wsId, parentId, name, text, get().nodes);
    const updated = [...get().nodes, node];
    set({ nodes: updated, tree: buildTree(updated) });
    return node;
  },

  ingestImportedBinary: async (parentId, name, bytes, mime) => {
    const wsId = get().activeWorkspaceId!;
    const node = await ingestBinaryAsset(wsId, parentId, name, bytes, mime, get().nodes);
    const updated = [...get().nodes, node];
    set({ nodes: updated, tree: buildTree(updated) });
    return node;
  },

  openNode: (id) => set({ activeNodeId: id }),
  closeNode: () => set({ activeNodeId: null }),
  setPanelOpen: (open) => set({ panelOpen: open }),
  setSearchQuery: (q) => set({ searchQuery: q }),

  patchNode: (id, patch) => {
    const updated = get().nodes.map((n) => (n.id === id ? { ...n, ...patch } : n));
    set({ nodes: updated, tree: buildTree(updated) });
  },
}));
