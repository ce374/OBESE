// Standalone asset viewer shown when an asset (image/audio/pdf/document) is
// opened from the file tree.

"use client";

import * as React from "react";
import { useKbStore } from "@/lib/store";
import { getAssetBlobUrl } from "@/lib/fileSystem";
import { AudioPlayer } from "./AudioPlayer";
import { PdfViewer } from "./PdfViewer";
import { MarkdownPreview } from "./MarkdownPreview";
import type { NodeRecord } from "@/lib/types";

interface AssetViewerProps {
  node: NodeRecord;
}

export function AssetViewer({ node }: AssetViewerProps) {
  if (node.assetKind === "image") return <ImageView node={node} />;
  if (node.assetKind === "audio") return <AudioView node={node} />;
  if (node.assetKind === "pdf") return <PdfView node={node} />;
  if (node.assetKind === "document") return <DocumentView node={node} />;
  return null;
}

function ImageView({ node }: { node: NodeRecord }) {
  const [url, setUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    let active = true;
    getAssetBlobUrl(node.id).then((u) => active && setUrl(u));
    return () => {
      active = false;
    };
  }, [node.id]);
  if (!url)
    return (
      <div className="flex items-center justify-center py-20 text-xs text-muted-foreground">
        Loading…
      </div>
    );
  return (
    <div className="flex items-center justify-center py-8 px-4">
      <img
        src={url}
        alt={node.name}
        className="max-w-full max-h-[80vh] rounded-md object-contain"
      />
    </div>
  );
}

function AudioView({ node }: { node: NodeRecord }) {
  const [url, setUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    let active = true;
    getAssetBlobUrl(node.id).then((u) => active && setUrl(u));
    return () => {
      active = false;
    };
  }, [node.id]);
  if (!url)
    return (
      <div className="flex items-center justify-center py-20 text-xs text-muted-foreground">
        Loading…
      </div>
    );
  return (
    <div className="flex flex-col items-center py-12 px-4 gap-3">
      <h2 className="text-base font-medium">{node.name}</h2>
      <AudioPlayer src={url} label={node.name} />
    </div>
  );
}

function PdfView({ node }: { node: NodeRecord }) {
  const [url, setUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    let active = true;
    getAssetBlobUrl(node.id).then((u) => active && setUrl(u));
    return () => {
      active = false;
    };
  }, [node.id]);
  if (!url)
    return (
      <div className="flex items-center justify-center py-20 text-xs text-muted-foreground">
        Loading…
      </div>
    );
  return (
    <div className="py-4 px-4">
      <PdfViewer src={url} />
    </div>
  );
}

function DocumentView({ node }: { node: NodeRecord }) {
  const content = node.textContent || "";
  const isMd = (node.mime || "").includes("markdown");
  return (
    <div className="py-6 px-6 sm:px-10 max-w-3xl mx-auto">
      <h2 className="text-base font-medium mb-3">{node.name}</h2>
      {isMd ? (
        <MarkdownPreview content={content} />
      ) : (
        <pre className="text-sm whitespace-pre-wrap break-words font-mono text-foreground/90">
          {content}
        </pre>
      )}
    </div>
  );
}

// Helper to determine if a node should open in the asset viewer vs editor.
export function isAssetNode(node: NodeRecord | undefined): boolean {
  if (!node) return false;
  return node.assetKind !== "text" && node.assetKind !== null;
}
