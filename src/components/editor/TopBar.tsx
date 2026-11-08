// Very small, unobtrusive top control bar.
// Left: panel toggle. Right: minimal workspace menu (switch / rename / delete /
// export / import).

"use client";

import * as React from "react";
import { useKbStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import {
  PanelLeft,
  MoreHorizontal,
  Pencil,
  Trash2,
  Download,
  Upload,
  ArrowLeft,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/workspace/ConfirmDialog";
import { importWorkspaceZip, exportWorkspaceZip } from "@/lib/zip";
import { getWorkspaceNodes } from "@/lib/fileSystem";
import { ThemeToggle } from "@/components/theme-toggle";
import { toast } from "sonner";

export function TopBar() {
  const {
    panelOpen,
    setPanelOpen,
    workspaces,
    activeWorkspaceId,
    selectWorkspace,
    leaveWorkspace,
    renameWorkspace,
    deleteWorkspace,
    refreshNodes,
    createWorkspace,
    ingestImportedText,
    ingestImportedBinary,
    createFolder,
    loadWorkspaces,
  } = useKbStore();

  const [renameOpen, setRenameOpen] = React.useState(false);
  const [renameValue, setRenameValue] = React.useState("");
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [importMode, setImportMode] = React.useState<"new" | "into">("new");

  const activeWs = workspaces.find((w) => w.id === activeWorkspaceId);

  const handleImportClick = (mode: "new" | "into") => {
    setImportMode(mode);
    fileInputRef.current?.click();
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const targetWs =
        importMode === "into" ? activeWs || null : null;
      const { workspace, importedCount } = await importWorkspaceZip(
        file,
        targetWs,
        async (name) => {
          const ws = await createWorkspace(name);
          // Select the new workspace so store actions target it.
          await selectWorkspace(ws.id);
          return ws;
        },
        async (parentId, name, text, asAsset) =>
          ingestImportedText(parentId, name, text, asAsset),
        async (parentId, name, bytes, mime) =>
          ingestImportedBinary(parentId, name, bytes, mime),
        async (parentId, name) => createFolder(parentId, name),
        async () => {
          const wsId = useKbStore.getState().activeWorkspaceId;
          if (!wsId) return [];
          return await getWorkspaceNodes(wsId);
        }
      );
      await loadWorkspaces();
      if (importMode === "new") {
        await selectWorkspace(workspace.id);
      } else {
        await refreshNodes();
      }
      toast.success(`Imported ${importedCount} item${importedCount === 1 ? "" : "s"}.`);
    } catch (err) {
      console.error(err);
      toast.error("Import failed.");
    }
  };

  const handleExport = async () => {
    if (!activeWs) return;
    try {
      const blob = await exportWorkspaceZip(activeWs);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${activeWs.name}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("Workspace exported.");
    } catch (e) {
      console.error(e);
      toast.error("Export failed.");
    }
  };

  const handleRename = async () => {
    if (!activeWs) return;
    const v = renameValue.trim();
    if (v) await renameWorkspace(activeWs.id, v);
    setRenameOpen(false);
  };

  const handleDelete = async () => {
    if (!activeWs) return;
    await deleteWorkspace(activeWs.id);
    setDeleteOpen(false);
  };

  return (
    <header className="h-11 shrink-0 border-b border-border/60 bg-background flex items-center px-2 sm:px-3 gap-1">
      <button
        onClick={() => setPanelOpen(!panelOpen)}
        className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        aria-label={panelOpen ? "Hide panel" : "Show panel"}
        title={panelOpen ? "Hide panel" : "Show panel"}
      >
        <PanelLeft className="h-4 w-4" />
      </button>

      <div className="flex-1" />

      <ThemeToggle />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="h-8 px-2 flex items-center gap-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors text-xs"
            aria-label="Workspace menu"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="rounded-md w-56">
          <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
            Workspaces
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {workspaces.map((ws) => (
            <DropdownMenuItem
              key={ws.id}
              onClick={() => selectWorkspace(ws.id)}
              className="rounded-md text-sm cursor-pointer justify-between gap-2"
            >
              <span className="truncate">{ws.name}</span>
              {ws.id === activeWorkspaceId && (
                <span className="text-[10px] text-muted-foreground">current</span>
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              if (!activeWs) return;
              setRenameValue(activeWs.name);
              setRenameOpen(true);
            }}
            className="rounded-md text-sm"
            disabled={!activeWs}
          >
            <Pencil className="h-3.5 w-3.5" />
            Rename workspace
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => handleImportClick("into")}
            className="rounded-md text-sm"
            disabled={!activeWs}
          >
            <Upload className="h-3.5 w-3.5" />
            Import into workspace
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => handleImportClick("new")}
            className="rounded-md text-sm"
          >
            <Upload className="h-3.5 w-3.5" />
            Import as new workspace
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={handleExport}
            className="rounded-md text-sm"
            disabled={!activeWs}
          >
            <Download className="h-3.5 w-3.5" />
            Export workspace
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setDeleteOpen(true)}
            className="rounded-md text-sm text-destructive focus:text-destructive"
            disabled={!activeWs}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete workspace
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => leaveWorkspace()}
            className="rounded-md text-sm"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Switch workspace
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <input
        ref={fileInputRef}
        type="file"
        accept=".zip,application/zip"
        className="hidden"
        onChange={handleImportFile}
      />

      {/* Rename workspace inline dialog */}
      {renameOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/40"
          onClick={() => setRenameOpen(false)}
        >
          <div
            className="bg-background rounded-md border border-border shadow-sm p-3 w-72"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRename();
                if (e.key === "Escape") setRenameOpen(false);
              }}
              placeholder="Workspace name"
              className="h-9 rounded-md text-sm w-full border border-border px-3"
            />
            <div className="flex justify-end gap-2 mt-3">
              <Button
                variant="ghost"
                size="sm"
                className="rounded-md"
                onClick={() => setRenameOpen(false)}
              >
                Cancel
              </Button>
              <Button size="sm" className="rounded-md" onClick={handleRename}>
                Rename
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete workspace"
        description={
          activeWs
            ? `Delete "${activeWs.name}" and all its folders, files, and assets? This cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        onConfirm={handleDelete}
      />
    </header>
  );
}
