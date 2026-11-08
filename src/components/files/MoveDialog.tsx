// Searchable folder selector / move dialog.
// Used to move files and folders to any destination. The interface prevents
// moving a folder into itself or its descendants.

"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useKbStore } from "@/lib/store";
import { isDescendant } from "@/lib/fileSystem";
import type { NodeRecord } from "@/lib/types";
import { Folder, FolderTree, Check } from "lucide-react";

interface MoveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodeId: string | null;
  nodeName: string;
  isFolder: boolean;
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

export function MoveDialog({
  open,
  onOpenChange,
  nodeId,
  nodeName,
  isFolder,
}: MoveDialogProps) {
  const { nodes, moveNode } = useKbStore();
  const [query, setQuery] = React.useState("");
  const [selected, setSelected] = React.useState<string | null>(null);
  const [moving, setMoving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(null);
    }
  }, [open, nodeId]);

  const handleMove = async () => {
    if (!nodeId) return;
    setMoving(true);
    try {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;
      await moveNode(node, selected === "__root__" ? null : selected);
      onOpenChange(false);
    } catch (e) {
      console.error(e);
    } finally {
      setMoving(false);
    }
  };

  // Build the destination list directly from the current nodes so it's always
  // fresh. Excludes the moved node and (for folders) its descendants.
  const folders = React.useMemo(() => {
    if (!open) return [];
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const q = query.trim().toLowerCase();
    const candidates = nodes.filter(
      (n) =>
        n.type === "folder" &&
        n.id !== nodeId &&
        (!isFolder || !isDescendant(nodes, nodeId!, n.id))
    );
    const scored = candidates
      .map((f) => {
        const path = buildPath(f, byId);
        const nameL = f.name.toLowerCase();
        const pathL = path.toLowerCase();
        let score: number;
        if (!q) score = 0;
        else if (nameL === q) score = 100;
        else if (nameL.startsWith(q)) score = 80;
        else if (nameL.includes(q)) score = 60;
        else if (pathL.includes(q)) score = 40;
        else score = -1;
        return { f, path, score };
      })
      .filter((x) => x.score >= 0)
      .sort((a, b) => b.score - a.score || a.path.length - b.path.length);
    const list = [
      { id: "__root__", name: "Workspace root", path: "" },
      ...scored.map((x) => ({ id: x.f.id, name: x.f.name, path: x.path })),
    ];
    return list;
  }, [open, nodes, query, nodeId, isFolder]);

  const invalidTarget = React.useMemo(() => {
    if (!nodeId || !selected || selected === "__root__") return false;
    if (!isFolder) return false;
    return isDescendant(nodes, nodeId, selected);
  }, [nodeId, selected, isFolder, nodes]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-xl max-w-sm sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm font-medium">
            Move {isFolder ? "folder" : "file"} — {nodeName}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search folders"
              className="h-9 rounded-lg text-sm"
            />
          </div>
          <ScrollArea className="h-64 rounded-lg border border-border/60">
            <div className="py-1">
              {folders.length === 0 && (
                <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                  No folders found.
                </div>
              )}
              {folders.map((f) => {
                const isInvalid =
                  isFolder &&
                  f.id !== "__root__" &&
                  nodeId &&
                  isDescendant(nodes, nodeId, f.id);
                const isSelected = selected === f.id;
                return (
                  <button
                    key={f.id}
                    onClick={() => !isInvalid && setSelected(f.id)}
                    disabled={isInvalid}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                      isSelected
                        ? "bg-muted"
                        : isInvalid
                          ? "opacity-40 cursor-not-allowed"
                          : "hover:bg-muted/60"
                    }`}
                  >
                    {f.id === "__root__" ? (
                      <FolderTree className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="flex-1 truncate">
                      {f.id === "__root__" ? (
                        <span className="font-medium">Workspace root</span>
                      ) : (
                        <>
                          <span className="font-medium">{f.name}</span>
                          {f.path && (
                            <span className="text-muted-foreground ml-1.5 text-xs">
                              {f.path}
                            </span>
                          )}
                        </>
                      )}
                    </span>
                    {isSelected && <Check className="h-3.5 w-3.5 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </ScrollArea>
          {invalidTarget && (
            <p className="text-xs text-destructive">
              Cannot move a folder into itself or one of its descendants.
            </p>
          )}
        </div>
        <DialogFooter className="flex-row gap-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="rounded-lg"
          >
            Cancel
          </Button>
          <Button
            onClick={handleMove}
            disabled={selected === null || invalidTarget || moving}
            className="rounded-lg ml-auto"
          >
            Move here
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
