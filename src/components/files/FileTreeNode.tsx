// Recursive file tree node.
// The row is clean (chevron + icon + name). All actions (move, rename, delete,
// create inside) are accessed by holding the row to open the contextual toolbar.

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
  const { activeNodeId, openNode } = useKbStore();

  const isFolder = node.type === "folder";
  const isOpen = expanded.has(node.id);
  const isActive = activeNodeId === node.id;

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
        </div>
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
    </div>
  );
}
