// Integrated PDF document reader using pdf.js.

"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PdfViewerProps {
  src: string; // object URL
}

export function PdfViewer({ src }: PdfViewerProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const pdfDocRef = React.useRef<unknown>(null);
  const [totalPages, setTotalPages] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [scale, setScale] = React.useState(1.2);
  const [docReady, setDocReady] = React.useState(false);

  // Load the PDF document lazily (client-only).
  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setDocReady(false);
    setError(null);
    (async () => {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        // Configure worker. Try bundled module worker; fall back to CDN.
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc && !pdfjsLib.GlobalWorkerOptions.workerPort) {
          try {
            const worker = new Worker(
              new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url),
              { type: "module" }
            );
            pdfjsLib.GlobalWorkerOptions.workerPort = worker;
          } catch {
            pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
          }
        }
        const loadingTask = pdfjsLib.getDocument({
          url: src,
          // Disable range requests for blob URLs.
          disableRange: true,
        });
        const doc = await loadingTask.promise;
        if (cancelled) return;
        pdfDocRef.current = doc;
        setTotalPages(doc.numPages);
        setPage(1);
        setLoading(false);
        setDocReady(true);
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setError("Could not open PDF.");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      // Cleanup doc.
      const doc = pdfDocRef.current as { destroy?: () => Promise<void> } | null;
      if (doc && typeof doc.destroy === "function") {
        void doc.destroy().catch(() => undefined);
      }
      pdfDocRef.current = null;
    };
  }, [src]);

  // Render the current page. Re-runs when the document becomes ready, the page
  // changes, or the scale changes.
  React.useEffect(() => {
    if (!docReady) return;
    let cancelled = false;
    (async () => {
      const doc = pdfDocRef.current as {
        getPage?: (n: number) => Promise<unknown>;
      } | null;
      const canvas = canvasRef.current;
      if (!doc || !canvas || !doc.getPage) return;
      try {
        const pdfPage = (await doc.getPage(page)) as {
          getViewport: (opts: { scale: number }) => {
            width: number;
            height: number;
          };
          render: (opts: {
            canvasContext: CanvasRenderingContext2D;
            viewport: { width: number; height: number };
          }) => { promise: Promise<void> };
        };
        if (cancelled) return;
        const viewport = pdfPage.getViewport({ scale });
        const dpr = window.devicePixelRatio || 1;
        canvas.width = viewport.width * dpr;
        canvas.height = viewport.height * dpr;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.scale(dpr, dpr);
        const renderTask = pdfPage.render({
          canvasContext: ctx,
          viewport,
        });
        await renderTask.promise;
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [page, scale, docReady]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-xs text-muted-foreground">
        Loading document…
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-center justify-center py-12 text-xs text-muted-foreground">
        {error}
      </div>
    );
  }

  return (
    <div className="my-2 inline-flex flex-col items-center">
      <div
        ref={containerRef}
        className="max-w-full overflow-auto rounded-lg border border-border/60 bg-muted/20"
        style={{ maxHeight: "70vh" }}
      >
        <canvas ref={canvasRef} className="block" />
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
          className="p-1 rounded hover:bg-muted disabled:opacity-30"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <span className="tabular-nums">
          {page} / {totalPages}
        </span>
        <button
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages}
          className="p-1 rounded hover:bg-muted disabled:opacity-30"
          aria-label="Next page"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
        <span className="mx-1 opacity-40">·</span>
        <button
          onClick={() => setScale((s) => Math.max(0.6, s - 0.2))}
          className="px-1.5 rounded hover:bg-muted"
        >
          −
        </button>
        <button
          onClick={() => setScale((s) => Math.min(3, s + 0.2))}
          className="px-1.5 rounded hover:bg-muted"
        >
          +
        </button>
      </div>
    </div>
  );
}
