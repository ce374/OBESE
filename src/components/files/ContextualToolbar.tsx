// Compact, vertically-aligned contextual toolbar that appears when a folder or
// file is held (long-pressed). For folders: Move, Rename, New folder, New note.
// For files: Move, Rename. Clicks are not hijacked so the row can still be
// opened normally.

"use client";

import * as React from "react";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { Move, FolderPlus, FilePlus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoveDialog } from "./MoveDialog";
import { useKbStore } from "@/lib/store";
import { useLongPress } from "@/hooks/useLongPress";
import { getExtension, stripExtension } from "@/lib/assets";
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
  const [dialogMode, setDialogMode] = React.useState<
    null | "folder" | "note" | "rename"
  >(null);
  const [dialogValue, setDialogValue] = React.useState("");
  const { createFolder, createNote, renameNode, openNode } = useKbStore();

  const longPress = useLongPress({
    onLongPress: () => setOpen(true),
    onClick,
  });

  const handleDialogConfirm = async () => {
    const value = dialogValue.trim();
    if (dialogMode === "folder") {
      await createFolder(node.id, value || "New Folder");
    } else if (dialogMode === "note") {
      const note = await createNote(node.id, value || "Untitled");
      openNode(note.id);
    } else if (dialogMode === "rename") {
      if (value) await renameNode(node, value);
    }
    setDialogMode(null);
    setDialogValue("");
    setOpen(false);
  };

  const startRename = () => {
    setDialogValue(
      node.type === "folder"
        ? node.name
        : getExtension(node.name)
          ? stripExtension(node.name)
          : node.name
    );
    setDialogMode("rename");
    setOpen(false);
  };

  const placeholder =
    dialogMode === "folder"
      ? "Folder name"
      : dialogMode === "note"
        ? "Note name"
        : "New name";

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
          className="w-auto p-1 rounded-md border border-border/70 shadow-sm"
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
            <ToolbarButton
              icon={<Pencil className="h-3.5 w-3.5" />}
              label="Rename"
              onClick={startRename}
            />
            {node.type === "folder" && (
              <>
                <ToolbarButton
                  icon={<FolderPlus className="h-3.5 w-3.5" />}
                  label="New folder"
                  onClick={() => {
                    setDialogValue("");
                    setDialogMode("folder");
                    setOpen(false);
                  }}
                />
                <ToolbarButton
                  icon={<FilePlus className="h-3.5 w-3.5" />}
                  label="New note"
                  onClick={() => {
                    setDialogValue("");
                    setDialogMode("note");
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

      {dialogMode && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/40"
          onClick={() => setDialogMode(null)}
        >
          <div
            className="bg-background rounded-md border border-border shadow-sm p-3 w-72"
            onClick={(e) => e.stopPropagation()}
          >
            <Input
              autoFocus
              value={dialogValue}
              onChange={(e) => setDialogValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleDialogConfirm();
                if (e.key === "Escape") setDialogMode(null);
              }}
              placeholder={placeholder}
              className="h-9 rounded-md text-sm"
            />
            <div className="flex justify-end gap-2 mt-3">
              <Button
                variant="ghost"
                size="sm"
                className="rounded-md"
                onClick={() => setDialogMode(null)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="rounded-md"
                onClick={handleDialogConfirm}
              >
                {dialogMode === "rename" ? "Rename" : "Create"}
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
