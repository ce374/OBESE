// Distraction-free markdown editor with Read/Write toggle.
// Defaults to Read (rendered preview). Switch to Write to edit the source.
// - Prominent title field at top (renames the file in the background).
// - Asset insertion via button and drag-drop from the device.
// - Autosave every 5s + on navigation (handled by useAutosave).

"use client";

import * as React from "react";
import { useKbStore } from "@/lib/store";
import { useAutosave } from "@/hooks/useAutosave";
import { MarkdownPreview } from "@/components/media/MarkdownPreview";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Eye, Pencil, Paperclip } from "lucide-react";
import { getExtension, stripExtension } from "@/lib/assets";
import { AssetPicker } from "./AssetPicker";
import { toast } from "sonner";
import type { NodeRecord } from "@/lib/types";
import { cn } from "@/lib/utils";

interface EditorProps {
  node: NodeRecord;
}

export function Editor({ node }: EditorProps) {
  const { renameNode, ingestAssetFile } = useKbStore();
  const [content, setContent] = React.useState(node.textContent || "");
  const [title, setTitle] = React.useState(
    getExtension(node.name) ? stripExtension(node.name) : node.name
  );
  const [view, setView] = React.useState<"read" | "write">("read");
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const pendingInsertRef = React.useRef<string | null>(null);
  const baseVersion = node.contentVersion;
  const lastLoadedIdRef = React.useRef<string>(node.id);

  // When the node changes, load its content/title fresh and reset to Read.
  React.useEffect(() => {
    if (node.id !== lastLoadedIdRef.current) {
      lastLoadedIdRef.current = node.id;
      setContent(node.textContent || "");
      setTitle(
        getExtension(node.name) ? stripExtension(node.name) : node.name
      );
      setView("read");
    }
  }, [node.id, node.textContent, node.name]);

  // Autosave: debounced 5s writes + force-save on unmount/navigation.
  useAutosave({
    nodeId: node.id,
    content,
    baseVersion,
  });

  // Rename when title changes (debounced).
  React.useEffect(() => {
    if (node.id !== lastLoadedIdRef.current) return;
    const desired = title.trim();
    if (!desired) return;
    const currentDisplay = getExtension(node.name)
      ? stripExtension(node.name)
      : node.name;
    if (desired === currentDisplay) return;
    const t = setTimeout(() => {
      renameNode(node, desired).catch((e) => {
        console.error(e);
      });
    }, 600);
    return () => clearTimeout(t);
  }, [title, node.id, node.name, renameNode]);

  const insertAtCursor = React.useCallback(
    (text: string) => {
      const ta = textareaRef.current;
      if (!ta) {
        setContent((c) => c + (c && !c.endsWith("\n") ? "\n" : "") + text);
        return;
      }
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const before = content.slice(0, start);
      const after = content.slice(end);
      const prefix = before && !before.endsWith("\n") ? "\n" : "";
      const next = before + prefix + text + after;
      setContent(next);
      requestAnimationFrame(() => {
        ta.focus();
        const pos = (before + prefix + text).length;
        ta.setSelectionRange(pos, pos);
      });
    },
    [content]
  );

  // After switching to Write, flush any pending asset insert.
  React.useEffect(() => {
    if (view === "write" && pendingInsertRef.current) {
      const ref = pendingInsertRef.current;
      pendingInsertRef.current = null;
      const id = requestAnimationFrame(() => insertAtCursor(ref));
      return () => cancelAnimationFrame(id);
    }
  }, [view, insertAtCursor]);

  const handlePick = (ref: string) => {
    if (view !== "write") {
      pendingInsertRef.current = ref;
      setView("write");
    } else {
      insertAtCursor(ref);
    }
    setPickerOpen(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    const files = Array.from(e.dataTransfer?.files || []);
    if (!files.length) return;
    e.preventDefault();
    // Ensure we're in write mode so the textarea is available.
    if (view !== "write") {
      setView("write");
    }
    for (const file of files) {
      try {
        const { markdownRef } = await ingestAssetFile(file);
        insertAtCursor(markdownRef);
      } catch (err) {
        console.error(err);
        toast.error(`Could not import ${file.name}.`);
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer?.types?.includes("Files")) {
      e.preventDefault();
    }
  };

  return (
    <div
      className="flex flex-col h-full"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {/* Title */}
      <div className="px-5 sm:px-8 pt-5 pb-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Untitled"
          className="w-full bg-transparent text-2xl sm:text-3xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground/40"
          aria-label="Document title"
        />
      </div>

      {/* Tiny inline toolbar (asset insert + view toggle) */}
      <div className="px-5 sm:px-8 pb-2 flex items-center gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setPickerOpen(true)}
          className="h-7 rounded-md text-xs text-muted-foreground hover:text-foreground px-2"
        >
          <Paperclip className="h-3.5 w-3.5" />
          <span className="ml-1">Insert</span>
        </Button>
        <div className="ml-auto flex items-center gap-1 rounded-md bg-muted/60 p-0.5">
          <button
            onClick={() => setView("read")}
            className={cn(
              "h-6 px-2 rounded-md text-xs flex items-center gap-1 transition-colors",
              view === "read"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Eye className="h-3 w-3" />
            Read
          </button>
          <button
            onClick={() => setView("write")}
            className={cn(
              "h-6 px-2 rounded-md text-xs flex items-center gap-1 transition-colors",
              view === "write"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Pencil className="h-3 w-3" />
            Write
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {view === "write" ? (
          <Textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder=""
            className="w-full h-full resize-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent text-[15px] leading-7 text-foreground/90 font-normal px-5 sm:px-8 py-4 min-h-[60vh] rounded-none"
            style={{
              fontFamily:
                "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
            }}
            spellCheck
          />
        ) : (
          <div className="px-5 sm:px-8 py-4 max-w-3xl">
            <MarkdownPreview content={content} />
          </div>
        )}
      </div>

      <AssetPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={handlePick}
      />
    </div>
  );
}
