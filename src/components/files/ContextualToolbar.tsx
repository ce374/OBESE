// Compact, vertically-aligned contextual toolbar that appears when a folder or
// file is held (long-pressed). For folders: Move, New folder, New note. For
// files: Move. Clicks are not hijacked so the row can still be opened normally.

"use client";

import * as React from "react";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { Move, FolderPlus, FilePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoveDialog } from "./MoveDialog";
import { useKbStore } from "@/lib/store";
import { useLongPress } from "@/hooks/useLongPress";
import type { NodeRecord } from "@/lib/types";

interface ContextualToolbarProps {
  node: NodeRecord;
  children: React.ReactNode;
  onClick?: () => void;
}

export function ContextualToolbar({
  node,
  children,
  onClick,
}: ContextualToolbarProps) {
  const [open, setOpen] = React.useState(false);
  const [moveOpen, setMoveOpen] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState<null | "folder" | "note">(
    null
  );
  const [createName, setCreateName] = React.useState("");
  const { createFolder, createNote, openNode } = useKbStore();

  const longPress = useLongPress({
    onLongPress: () => setOpen(true),
    onClick,
  });

  const handleCreate = async () => {
    const name = createName.trim();
    if (createOpen === "folder") {
      await createFolder(node.id, name || "New Folder");
    } else if (createOpen === "note") {
      const note = await createNote(node.id, name || "Untitled");
      openNode(note.id);
    }
    setCreateOpen(null);
    setCreateName("");
    setOpen(false);
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <div {...longPress} className="contents">
            {children}
          </div>
        </PopoverAnchor>
        <PopoverContent
          side="right"
          align="start"
          sideOffset={6}
          className="w-auto p-1 rounded-lg border border-border/70 shadow-sm"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="flex flex-col gap-0.5">
            <ToolbarButton
              icon={<Move className="h-3.5 w-3.5" />}
              label="Move"
              onClick={() => {
                setMoveOpen(true);
                setOpen(false);
              }}
            />
            {node.type === "folder" && (
              <>
                <ToolbarButton
                  icon={<FolderPlus className="h-3.5 w-3.5" />}
                  label="New folder"
                  onClick={() => {
                    setCreateOpen("folder");
                    setCreateName("");
                    setOpen(false);
                  }}
                />
                <ToolbarButton
                  icon={<FilePlus className="h-3.5 w-3.5" />}
                  label="New note"
                  onClick={() => {
                    setCreateOpen("note");
                    setCreateName("");
                    setOpen(false);
                  }}
                />
              </>
            )}
          </div>
        </PopoverContent>
      </Popover>

      <MoveDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        nodeId={node.id}
        nodeName={node.name}
        isFolder={node.type === "folder"}
      />

      {createOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/40"
          onClick={() => setCreateOpen(null)}
        >
          <div
            className="bg-background rounded-xl border border-border shadow-sm p-3 w-72"
            onClick={(e) => e.stopPropagation()}
          >
            <Input
              autoFocus
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
                if (e.key === "Escape") setCreateOpen(null);
              }}
              placeholder={
                createOpen === "folder" ? "Folder name" : "Note name"
              }
              className="h-9 rounded-lg text-sm"
            />
            <div className="flex justify-end gap-2 mt-3">
              <Button
                variant="ghost"
                size="sm"
                className="rounded-lg"
                onClick={() => setCreateOpen(null)}
              >
                Cancel
              </Button>
              <Button size="sm" className="rounded-lg" onClick={handleCreate}>
                Create
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ToolbarButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-md hover:bg-muted transition-colors text-foreground/90 whitespace-nowrap"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
