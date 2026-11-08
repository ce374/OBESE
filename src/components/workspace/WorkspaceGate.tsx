// First-launch and workspace selection screen.
// On first launch (no workspaces) shows only a workspace-name input.

"use client";

import * as React from "react";
import { useKbStore } from "@/lib/store";
import { importWorkspaceZip } from "@/lib/zip";
import { exportWorkspaceZip } from "@/lib/zip";
import { getWorkspaceNodes } from "@/lib/fileSystem";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FolderPlus,
  Download,
  Upload,
  Pencil,
  Trash2,
  ChevronRight,
} from "lucide-react";
import { ConfirmDialog } from "./ConfirmDialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function WorkspaceGate() {
  const {
    workspaces,
    workspacesLoaded,
    loadWorkspaces,
    createWorkspace,
    renameWorkspace,
    deleteWorkspace,
    selectWorkspace,
  } = useKbStore();

  const [name, setName] = React.useState("");
  const [renamingId, setRenamingId] = React.useState<string | null>(null);
  const [renameValue, setRenameValue] = React.useState("");
  const [deleteId, setDeleteId] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [importTarget, setImportTarget] = React.useState<string | null>(null);
  const [exporting, setExporting] = React.useState<string | null>(null);

  React.useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      const ws = await createWorkspace(trimmed);
      setName("");
      await selectWorkspace(ws.id);
    } catch (e) {
      toast.error("Could not create workspace.");
      console.error(e);
    } finally {
      setCreating(false);
    }
  };

  const handleExport = async (id: string, wsName: string) => {
    setExporting(id);
    try {
      const ws = workspaces.find((w) => w.id === id);
      if (!ws) return;
      const blob = await exportWorkspaceZip(ws);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${ws.name}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("Workspace exported.");
    } catch (e) {
      toast.error("Export failed.");
      console.error(e);
    } finally {
      setExporting(null);
    }
  };

  const handleImportClick = (targetId: string | null) => {
    setImportTarget(targetId);
    fileInputRef.current?.click();
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const targetWs = importTarget
        ? workspaces.find((w) => w.id === importTarget) || null
        : null;
      useKbStore.getState().setBatchMode(true);
      const { workspace, importedCount } = await importWorkspaceZip(
        file,
        targetWs,
        async (name) => {
          const ws = await createWorkspace(name);
          // Select the new workspace immediately so store actions (createFolder,
          // ingest) target it rather than the previously active workspace.
          await selectWorkspace(ws.id);
          return ws;
        },
        async (parentId, name, text, asAsset) => {
          return useKbStore.getState().ingestImportedText(parentId, name, text, asAsset);
        },
        async (parentId, name, bytes, mime) => {
          return useKbStore.getState().ingestImportedBinary(parentId, name, bytes, mime);
        },
        async (parentId, name) => {
          return useKbStore.getState().createFolder(parentId, name);
        },
        async () => {
          const wsId = useKbStore.getState().activeWorkspaceId;
          if (!wsId) return [];
          return await getWorkspaceNodes(wsId);
        }
      );
      useKbStore.getState().setBatchMode(false);
      // If a new workspace was created during import, refresh list & select it.
      await loadWorkspaces();
      if (!targetWs) {
        await selectWorkspace(workspace.id);
      } else {
        await useKbStore.getState().refreshNodes();
      }
      toast.success(`Imported ${importedCount} item${importedCount === 1 ? "" : "s"}.`);
    } catch (err) {
      useKbStore.getState().setBatchMode(false);
      toast.error("Import failed.");
      console.error(err);
    } finally {
      setImportTarget(null);
    }
  };

  const handleRename = async () => {
    if (!renamingId) return;
    const trimmed = renameValue.trim();
    if (!trimmed) {
      setRenamingId(null);
      return;
    }
    await renameWorkspace(renamingId, trimmed);
    setRenamingId(null);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await deleteWorkspace(deleteId);
    setDeleteId(null);
    toast.success("Workspace deleted.");
  };

  const isFirstLaunch = workspacesLoaded && workspaces.length === 0;

  // Hidden file input for ZIP import.
  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept=".zip,application/zip"
      className="hidden"
      onChange={handleImportFile}
    />
  );

  if (isFirstLaunch) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center px-6">
        <div className="absolute top-3 right-3">
          <ThemeToggle />
        </div>
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
              }}
              placeholder="Workspace name"
              className="h-11 rounded-md text-[15px]"
              disabled={creating}
            />
            <Button
              onClick={handleCreate}
              disabled={!name.trim() || creating}
              className="h-11 rounded-md px-5"
            >
              <FolderPlus className="h-4 w-4" />
              <span className="ml-1.5">Create</span>
            </Button>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              onClick={() => handleImportClick(null)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors rounded-md px-2 py-1"
            >
              Import ZIP
            </button>
          </div>
        </div>
        {fileInput}
      </div>
    );
  }

  const deletingWs = workspaces.find((w) => w.id === deleteId);

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-6 py-10">
      <div className="absolute top-3 right-3">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 mb-5">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
            }}
            placeholder="Workspace name"
            className="h-10 rounded-md text-sm"
            disabled={creating}
          />
          <Button
            onClick={handleCreate}
            disabled={!name.trim() || creating}
            size="sm"
            className="h-10 rounded-md"
          >
            <FolderPlus className="h-4 w-4" />
          </Button>
        </div>

        <div className="rounded-md border border-border/70 divide-y divide-border/60 overflow-hidden bg-card">
          {workspaces.map((ws) => (
            <div
              key={ws.id}
              className="flex items-center group hover:bg-muted/40 transition-colors"
            >
              {renamingId === ws.id ? (
                <Input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={handleRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRename();
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                  className="h-9 rounded-none border-0 focus-visible:ring-0 text-sm flex-1"
                />
              ) : (
                <button
                  onClick={() => selectWorkspace(ws.id)}
                  className="flex-1 text-left px-4 py-3 text-sm truncate"
                >
                  {ws.name}
                </button>
              )}
              <div className="flex items-center pr-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      aria-label="Workspace actions"
                    >
                      <ChevronRight className="h-4 w-4 rotate-90" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="rounded-md">
                    <DropdownMenuItem
                      onClick={() => {
                        setRenamingId(ws.id);
                        setRenameValue(ws.name);
                      }}
                      className="rounded-md"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleImportClick(ws.id)}
                      className="rounded-md"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      Import into
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleExport(ws.id, ws.name)}
                      disabled={exporting === ws.id}
                      className="rounded-md"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Export
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setDeleteId(ws.id)}
                      className="rounded-md text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={() => handleImportClick(null)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors rounded-md px-2 py-1"
          >
            Import ZIP
          </button>
        </div>
      </div>
      {fileInput}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
        title="Delete workspace"
        description={
          deletingWs
            ? `Delete "${deletingWs.name}" and all its folders, files, and assets? This cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        onConfirm={handleDelete}
      />
    </div>
  );
}
