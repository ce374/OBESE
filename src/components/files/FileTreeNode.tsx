// Recursive file tree node.

"use client";

import * as React from "react";
import {
  ChevronRight,
  Folder,
  FolderOpen,
  FileText,
  File,
} from "lucide-react";
import type { TreeNode } from "@/lib/types";
import { useKbStore } from "@/lib/store";
import { ContextualToolbar } from "./ContextualToolbar";
import { ConfirmDialog } from "@/components/workspace/ConfirmDialog";
import { Input } from "@/components/ui/input";
import { getExtension, stripExtension } from "@/lib/assets";
import { cn } from "@/lib/utils";

interface FileTreeNodeProps {
  node: TreeNode;
  depth: number;
  expanded: Set<string>;
  toggleExpand: (id: string) => void;
}

export function FileTreeNode({
  node,
  depth,
  expanded,
  toggleExpand,
}: FileTreeNodeProps) {
  const { activeNodeId, openNode, renameNode, deleteNode } = useKbStore();
  const [renaming, setRenaming] = React.useState(false);
  const [renameValue, setRenameValue] = React.useState("");
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  const isFolder = node.type === "folder";
  const isOpen = expanded.has(node.id);
  const isActive = activeNodeId === node.id;

  const startRename = () => {
    setRenameValue(
      node.type === "folder"
        ? node.name
        : getExtension(node.name)
          ? stripExtension(node.name)
          : node.name
    );
    setRenaming(true);
  };

  const handleRename = async () => {
    if (!renaming) return;
    const v = renameValue.trim();
    if (v) {
      await renameNode(node, v);
    }
    setRenaming(false);
  };

  const handleDelete = async () => {
    await deleteNode(node);
    setDeleteOpen(false);
  };

  const icon = isFolder ? (
    isOpen ? (
      <FolderOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
    ) : (
      <Folder className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
    )
  ) : node.assetKind === "text" ? (
    <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
  ) : (
    <File className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
  );

  const handleClick = () => {
    if (renaming) return;
    if (isFolder) {
      toggleExpand(node.id);
    } else {
      openNode(node.id);
    }
  };

  const indent = depth * 12 + 4;

  return (
    <div>
      <ContextualToolbar node={node} onClick={handleClick}>
        {renaming ? (
          <div
            className="flex items-center py-1 pr-2 select-none"
            style={{ paddingLeft: indent }}
          >
            <div className="w-4 shrink-0" />
            <Input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={handleRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRename();
                if (e.key === "Escape") setRenaming(false);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              className="h-6 rounded text-xs px-1.5 py-0"
            />
          </div>
        ) : (
          <div
            className={cn(
              "group flex items-center gap-1 py-[5px] pr-1.5 text-[13px] cursor-pointer select-none rounded-md transition-colors",
              isActive
                ? "bg-muted text-foreground"
                : "text-foreground/85 hover:bg-muted/50"
            )}
            style={{ paddingLeft: indent }}
            title={node.path}
          >
            {isFolder ? (
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpand(node.id);
                }}
                className="w-4 h-4 shrink-0 flex items-center justify-center text-muted-foreground"
                aria-label="Toggle folder"
              >
                <ChevronRight
                  className={cn(
                    "h-3 w-3 transition-transform",
                    isOpen && "rotate-90"
                  )}
                />
              </button>
            ) : (
              <div className="w-4 shrink-0" />
            )}
            {icon}
            <span className="truncate flex-1">{node.name}</span>
            <div className="flex items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  startRename();
                }}
                className="px-1 py-0.5 text-[10px] text-muted-foreground hover:text-foreground rounded"
                aria-label="Rename"
                title="Rename"
              >
                Rename
              </button>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteOpen(true);
                }}
                className="px-1 py-0.5 text-[10px] text-muted-foreground hover:text-destructive rounded"
                aria-label="Delete"
                title="Delete"
              >
                Delete
              </button>
            </div>
          </div>
        )}
      </ContextualToolbar>

      {isFolder && isOpen && (
        <div>
          {node.children.map((child) => (
            <FileTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              toggleExpand={toggleExpand}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete ${isFolder ? "folder" : "file"}`}
        description={
          isFolder
            ? `Delete "${node.name}" and everything inside it? This cannot be undone.`
            : `Delete "${node.name}"? This cannot be undone.`
        }
        confirmLabel="Delete"
        onConfirm={handleDelete}
      />
    </div>
  );
}
