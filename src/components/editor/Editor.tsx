// Distraction-free live-preview markdown editor (Obsidian-style).
// Markdown formatting renders in real time as you type. No read/write toggle.
// - Prominent title field at top (renames the file in the background).
// - Asset insertion via button and drag-drop from the device.
// - Autosave every 5s + on navigation (handled by useAutosave).

"use client";

import * as React from "react";
import {
  MDXEditor,
  type MDXEditorMethods,
  headingsPlugin,
  listsPlugin,
  linkPlugin,
  tablePlugin,
  quotePlugin,
  thematicBreakPlugin,
  markdownShortcutPlugin,
  imagePlugin,
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";
import { useKbStore } from "@/lib/store";
import { useAutosave } from "@/hooks/useAutosave";
import { Button } from "@/components/ui/button";
import { Paperclip } from "lucide-react";
import { getExtension, stripExtension } from "@/lib/assets";
import { AssetPicker } from "./AssetPicker";
import { toast } from "sonner";
import type { NodeRecord } from "@/lib/types";
import { resolveAssetForEditor } from "@/lib/editorAssets";

interface EditorProps {
  node: NodeRecord;
}

export function Editor({ node }: EditorProps) {
  const { renameNode, ingestAssetFile, nodes } = useKbStore();
  const [content, setContent] = React.useState(node.textContent || "");
  const [title, setTitle] = React.useState(
    getExtension(node.name) ? stripExtension(node.name) : node.name
  );
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const editorRef = React.useRef<MDXEditorMethods>(null);
  const baseVersion = node.contentVersion;
  const lastLoadedIdRef = React.useRef<string>(node.id);

  // Node lookup map for resolving asset references in the editor.
  const nodeMap = React.useMemo(() => {
    const m = new Map<string, NodeRecord>();
    for (const n of nodes) m.set(n.id, n);
    return m;
  }, [nodes]);

  // When the node changes, load its content/title fresh.
  React.useEffect(() => {
    if (node.id !== lastLoadedIdRef.current) {
      lastLoadedIdRef.current = node.id;
      setContent(node.textContent || "");
      setTitle(
        getExtension(node.name) ? stripExtension(node.name) : node.name
      );
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

  const insertAtCursor = (text: string) => {
    const editor = editorRef.current;
    if (editor) {
      editor.focus();
      editor.insertMarkdown(text);
    } else {
      setContent((c) => c + (c && !c.endsWith("\n") ? "\n" : "") + text);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    const files = Array.from(e.dataTransfer?.files || []);
    if (!files.length) return;
    e.preventDefault();
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

  // Image preview handler resolves asset: refs to blob URLs (images) or
  // placeholder SVGs (audio/pdf/documents).
  const imagePreviewHandler = React.useCallback(
    async (src: string) => {
      return resolveAssetForEditor(src, nodeMap);
    },
    [nodeMap]
  );

  return (
    <div
      className="flex flex-col h-full"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {/* Title */}
      <div className="px-5 sm:px-8 pt-5 pb-1">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Untitled"
          className="w-full bg-transparent text-2xl sm:text-3xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground/40"
          aria-label="Document title"
        />
      </div>

      {/* Tiny inline toolbar (asset insert only) */}
      <div className="px-5 sm:px-8 pb-1 flex items-center gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setPickerOpen(true)}
          className="h-7 rounded-md text-xs text-muted-foreground hover:text-foreground px-2"
        >
          <Paperclip className="h-3.5 w-3.5" />
          <span className="ml-1">Insert</span>
        </Button>
      </div>

      {/* Live-preview editor */}
      <div className="flex-1 overflow-y-auto px-1 sm:px-4 pb-10">
        <MDXEditor
          ref={editorRef}
          markdown={content}
          onChange={(md) => setContent(md)}
          plugins={[
            headingsPlugin(),
            listsPlugin(),
            linkPlugin(),
            tablePlugin(),
            quotePlugin(),
            thematicBreakPlugin(),
            markdownShortcutPlugin(),
            imagePlugin({
              imagePreviewHandler,
              disableImageResize: false,
              allowSetImageDimensions: true,
            }),
          ]}
          placeholder=""
          contentEditableClassName="kb-editor-content"
          className="kb-editor-root"
        />
      </div>

      <AssetPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={(ref) => {
          insertAtCursor(ref);
          setPickerOpen(false);
        }}
      />
    </div>
  );
}
