"use client";

import * as React from "react";
import { useKbStore } from "@/lib/store";
import { WorkspaceGate } from "@/components/workspace/WorkspaceGate";
import { TopBar } from "@/components/editor/TopBar";
import { FilePanel } from "@/components/files/FilePanel";
import { Editor } from "@/components/editor/Editor";
import { AssetViewer, isAssetNode } from "@/components/media/AssetViewer";
import { requestPersistentStorage } from "@/lib/idb";
import { clearBlobUrlCache } from "@/lib/fileSystem";
import { cn } from "@/lib/utils";

export default function Home() {
  const {
    workspacesLoaded,
    activeWorkspaceId,
    nodes,
    activeNodeId,
    panelOpen,
    loadWorkspaces,
  } = useKbStore();

  React.useEffect(() => {
    loadWorkspaces();
    void requestPersistentStorage();
    return () => {
      clearBlobUrlCache();
    };
  }, [loadWorkspaces]);

  // Decide what to render in the main area.
  const activeNode = React.useMemo(
    () => (activeNodeId ? nodes.find((n) => n.id === activeNodeId) : undefined),
    [activeNodeId, nodes]
  );

  if (!workspacesLoaded) {
    return <div className="h-screen bg-background" />;
  }

  if (!activeWorkspaceId) {
    return <WorkspaceGate />;
  }

  const showEditor = activeNode && !isAssetNode(activeNode);
  const showAsset = activeNode && isAssetNode(activeNode);

  return (
    <div className="h-screen flex flex-col bg-background">
      <TopBar />
      <div className="flex-1 flex overflow-hidden">
        <aside
          className={cn(
            "h-full shrink-0 border-r border-border/60 overflow-hidden transition-[width] duration-200 ease-out",
            panelOpen ? "w-[260px] sm:w-[280px]" : "w-0"
          )}
        >
          {/* Keep FilePanel mounted to preserve expand state; hidden via width. */}
          <div className="h-full w-[260px] sm:w-[280px]">
            <FilePanel />
          </div>
        </aside>
        <main className="flex-1 overflow-hidden bg-background">
          {showEditor ? (
            <Editor key={activeNode!.id} node={activeNode!} />
          ) : showAsset ? (
            <div key={activeNode!.id} className="h-full overflow-y-auto">
              <AssetViewer node={activeNode!} />
            </div>
          ) : (
            <div className="h-full" />
          )}
        </main>
      </div>
    </div>
  );
}
