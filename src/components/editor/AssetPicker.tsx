// Asset picker — choose an existing asset to insert, or import a new one.

"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useKbStore } from "@/lib/store";
import { Image as ImageIcon, FileText, Music, File, Upload } from "lucide-react";
import type { NodeRecord } from "@/lib/types";
import { stripExtension } from "@/lib/assets";
import { toast } from "sonner";

interface AssetPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (markdownRef: string) => void;
}

export function AssetPicker({
  open,
  onOpenChange,
  onPick,
}: AssetPickerProps) {
  const { nodes, ingestAssetFile } = useKbStore();
  const [query, setQuery] = React.useState("");
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const assets = React.useMemo(() => {
    return nodes
      .filter(
        (n) =>
          n.type === "file" &&
          n.assetKind &&
          n.assetKind !== "text" &&
          n.assetKind !== null
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [nodes]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return assets;
    return assets.filter((a) => a.name.toLowerCase().includes(q));
  }, [assets, query]);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    for (const file of files) {
      try {
        const { markdownRef } = await ingestAssetFile(file);
        onPick(markdownRef);
      } catch (err) {
        console.error(err);
        toast.error(`Could not import ${file.name}.`);
      }
    }
  };

  const iconFor = (kind: NodeRecord["assetKind"]) => {
    switch (kind) {
      case "image":
        return <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />;
      case "audio":
        return <Music className="h-3.5 w-3.5 text-muted-foreground" />;
      case "pdf":
        return <File className="h-3.5 w-3.5 text-muted-foreground" />;
      case "document":
        return <FileText className="h-3.5 w-3.5 text-muted-foreground" />;
      default:
        return <File className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-xl max-w-sm sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm font-medium">Insert asset</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search assets"
              className="h-9 rounded-lg text-sm flex-1"
            />
            <Button
              variant="outline"
              size="sm"
              className="h-9 rounded-lg"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5" />
              <span className="ml-1">Import</span>
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/gif,image/webp,audio/*,.flac,.opus,.webm,.mp3,.m4a,application/pdf,.txt,.md"
              className="hidden"
              onChange={handleImport}
            />
          </div>
          <ScrollArea className="h-72 rounded-lg border border-border/60">
            <div className="py-1">
              {filtered.length === 0 && (
                <div className="px-3 py-8 text-center text-xs text-muted-foreground">
                  {assets.length === 0 ? "No assets yet." : "No matches."}
                </div>
              )}
              {filtered.map((a) => (
                <button
                  key={a.id}
                  onClick={() =>
                    onPick(`![${stripExtension(a.name)}](asset:${a.id})`)
                  }
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/60 transition-colors"
                >
                  {iconFor(a.assetKind)}
                  <span className="flex-1 truncate">{a.name}</span>
                  <span className="text-[10px] text-muted-foreground capitalize">
                    {a.assetKind || ""}
                  </span>
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
