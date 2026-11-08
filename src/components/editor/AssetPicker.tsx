// Asset picker — choose an existing asset to insert, or import a new one.
// Renders a responsive grid of compressed image previews (and icons for
// non-image assets) with contained filenames.

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
import { getAssetThumbnailUrl } from "@/lib/fileSystem";
import {
  Image as ImageIcon,
  FileText,
  Music,
  File,
  Upload,
} from "lucide-react";
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-md max-w-lg">
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
              className="h-9 rounded-md text-sm flex-1"
            />
            <Button
              variant="outline"
              size="sm"
              className="h-9 rounded-md"
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
          <ScrollArea className="h-[60vh] rounded-md border border-border/60">
            {filtered.length === 0 ? (
              <div className="px-3 py-10 text-center text-xs text-muted-foreground">
                {assets.length === 0 ? "No assets yet." : "No matches."}
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 p-2">
                {filtered.map((a) => (
                  <AssetCard key={a.id} asset={a} onPick={onPick} />
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AssetCard({
  asset,
  onPick,
}: {
  asset: NodeRecord;
  onPick: (ref: string) => void;
}) {
  const kind = asset.assetKind;
  return (
    <button
      onClick={() => onPick(`![${stripExtension(asset.name)}](asset:${asset.id})`)}
      className="group flex flex-col overflow-hidden rounded-md border border-border/60 hover:border-border hover:bg-muted/40 transition-colors text-left"
      title={asset.name}
    >
      <div className="aspect-square w-full bg-muted/30 flex items-center justify-center overflow-hidden">
        {kind === "image" ? (
          <Thumbnail nodeId={asset.id} />
        ) : (
          <div className="flex flex-col items-center gap-1 text-muted-foreground">
            <KindIcon kind={kind} />
            <span className="text-[10px] uppercase tracking-wide">
              {kind || "file"}
            </span>
          </div>
        )}
      </div>
      <div className="px-1.5 py-1 border-t border-border/40">
        <div className="text-[11px] leading-tight truncate text-foreground/80">
          {asset.name}
        </div>
      </div>
    </button>
  );
}

function Thumbnail({ nodeId }: { nodeId: string }) {
  const [url, setUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    let active = true;
    getAssetThumbnailUrl(nodeId).then((u) => {
      if (active) setUrl(u);
    });
    return () => {
      active = false;
    };
  }, [nodeId]);
  if (!url) {
    return <div className="h-full w-full animate-pulse bg-muted/50" />;
  }
  return <img src={url} alt="" className="h-full w-full object-cover" />;
}

function KindIcon({ kind }: { kind: NodeRecord["assetKind"] }) {
  switch (kind) {
    case "image":
      return <ImageIcon className="h-5 w-5" />;
    case "audio":
      return <Music className="h-5 w-5" />;
    case "pdf":
      return <File className="h-5 w-5" />;
    case "document":
      return <FileText className="h-5 w-5" />;
    default:
      return <File className="h-5 w-5" />;
  }
}
