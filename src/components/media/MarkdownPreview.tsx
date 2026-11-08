// Markdown preview with embedded asset rendering.
// Resolves `asset:<id>` references to the appropriate inline renderer:
// images (sized), audio (waveform player), PDF (reader), documents (reader).

"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useKbStore } from "@/lib/store";
import { getAssetBlobUrl } from "@/lib/fileSystem";
import { AudioPlayer } from "./AudioPlayer";
import { PdfViewer } from "./PdfViewer";
import type { NodeRecord } from "@/lib/types";

interface MarkdownPreviewProps {
  content: string;
}

const ASSET_PREFIX = "asset:";

function useNodeMap() {
  const nodes = useKbStore((s) => s.nodes);
  return React.useMemo(() => {
    const m = new Map<string, NodeRecord>();
    for (const n of nodes) m.set(n.id, n);
    return m;
  }, [nodes]);
}

export function MarkdownPreview({ content }: MarkdownPreviewProps) {
  const nodeMap = useNodeMap();

  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={(url) => {
          // Allow asset: references (resolved to local blobs) and standard
          // URLs. react-markdown sanitizes unknown protocols by default which
          // would strip asset: ids.
          if (!url) return url;
          if (url.startsWith(ASSET_PREFIX)) return url;
          return url;
        }}
        components={{
          img: ({ src, alt }) => {
            const s = typeof src === "string" ? src : "";
            if (s.startsWith(ASSET_PREFIX)) {
              const id = s.slice(ASSET_PREFIX.length);
              return <AssetInline id={id} alt={alt || ""} nodeMap={nodeMap} />;
            }
            // Regular remote/data image.
            return (
              <img
                src={s}
                alt={alt || ""}
                className="my-2 rounded-lg max-w-[520px] w-full h-auto"
              />
            );
          },
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline underline-offset-2 hover:opacity-70"
            >
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

// Inline asset renderer — dispatches by asset kind.
function AssetInline({
  id,
  alt,
  nodeMap,
}: {
  id: string;
  alt: string;
  nodeMap: Map<string, NodeRecord>;
}) {
  const node = nodeMap.get(id);
  if (!node) {
    return (
      <span className="text-xs text-muted-foreground italic">
        [asset not found]
      </span>
    );
  }
  if (node.assetKind === "image") return <AssetImage id={id} alt={alt} />;
  if (node.assetKind === "audio") return <AssetAudio id={id} />;
  if (node.assetKind === "pdf") return <AssetPdf id={id} />;
  if (node.assetKind === "document") return <AssetDocument id={id} node={node} />;
  return (
    <span className="text-xs text-muted-foreground italic">
      [unsupported asset]
    </span>
  );
}

function AssetImage({ id, alt }: { id: string; alt: string }) {
  const [url, setUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    let active = true;
    getAssetBlobUrl(id).then((u) => {
      if (active) setUrl(u);
    });
    return () => {
      active = false;
    };
  }, [id]);
  if (!url) {
    return (
      <span className="inline-block h-8 w-32 bg-muted/50 rounded animate-pulse align-middle my-2" />
    );
  }
  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      className="my-2 rounded-lg max-w-[520px] w-full h-auto"
    />
  );
}

function AssetAudio({ id }: { id: string }) {
  const [url, setUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    let active = true;
    getAssetBlobUrl(id).then((u) => {
      if (active) setUrl(u);
    });
    return () => {
      active = false;
    };
  }, [id]);
  if (!url) return <span className="text-xs text-muted-foreground">…</span>;
  return <AudioPlayer src={url} />;
}

function AssetPdf({ id }: { id: string }) {
  const [url, setUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    let active = true;
    getAssetBlobUrl(id).then((u) => {
      if (active) setUrl(u);
    });
    return () => {
      active = false;
    };
  }, [id]);
  if (!url) return <span className="text-xs text-muted-foreground">…</span>;
  return <PdfViewer src={url} />;
}

// Document reader for txt/md assets stored in Assets.
function AssetDocument({ node }: { id: string; node: NodeRecord }) {
  const content = node.textContent || "";
  const isMd = (node.mime || "").includes("markdown");
  if (isMd) {
    return (
      <div className="my-2 rounded-lg border border-border/60 p-3 bg-muted/20 max-w-[640px]">
        <MarkdownPreview content={content} />
      </div>
    );
  }
  return (
    <pre className="my-2 rounded-lg border border-border/60 p-3 bg-muted/20 text-xs whitespace-pre-wrap break-words max-w-[640px] font-mono">
      {content}
    </pre>
  );
}
