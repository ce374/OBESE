// File management panel: search + create actions + recursive tree.

"use client";

import * as React from "react";
import { useKbStore } from "@/lib/store";
import { searchIndex } from "@/lib/search";
import { FileTreeNode } from "./FileTreeNode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FolderPlus, FilePlus, Search } from "lucide-react";
import type { SearchResult } from "@/lib/types";
import { toast } from "sonner";

export function FilePanel() {
  const {
    tree,
    nodes,
    searchQuery,
    setSearchQuery,
    createFolder,
    createNote,
    openNode,
    activeWorkspaceId,
  } = useKbStore();

  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [searching, setSearching] = React.useState(false);

  // Keep the search index in sync with the nodes.
  React.useEffect(() => {
    searchIndex.rebuild(nodes);
    if (searchQuery.trim()) {
      setResults(searchIndex.search(searchQuery));
    } else {
      setResults([]);
    }
  }, [nodes, searchQuery]);

  const toggleExpand = React.useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleCreateFolder = async () => {
    try {
      const folder = await createFolder(null, "New Folder");
      setExpanded((prev) => new Set(prev).add(folder.id));
    } catch (e) {
      toast.error("Could not create folder.");
      console.error(e);
    }
  };

  const handleCreateNote = async () => {
    try {
      const note = await createNote(null, "Untitled");
      openNode(note.id);
    } catch (e) {
      toast.error("Could not create note.");
      console.error(e);
    }
  };

  const isSearching = searchQuery.trim().length > 0;

  return (
    <div className="flex h-full flex-col">
      {/* Search */}
      <div className="px-3 pt-3 pb-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search"
            className="h-8 rounded-lg pl-8 text-[13px]"
          />
        </div>
      </div>

      {/* Create actions */}
      <div className="px-3 pb-2 flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          onClick={handleCreateFolder}
          className="h-7 rounded-lg text-xs flex-1"
        >
          <FolderPlus className="h-3.5 w-3.5" />
          <span className="ml-1">Folder</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleCreateNote}
          className="h-7 rounded-lg text-xs flex-1"
        >
          <FilePlus className="h-3.5 w-3.5" />
          <span className="ml-1">Note</span>
        </Button>
      </div>

      <div className="h-px bg-border/60 mx-3" />

      {/* Tree or search results */}
      <ScrollArea className="flex-1" type="auto">
        <div className="px-2 py-2 min-h-full">
          {isSearching ? (
            <SearchResults
              results={results}
              searching={searching}
              onOpen={(id) => {
                openNode(id);
                setSearchQuery("");
              }}
            />
          ) : tree.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-muted-foreground">
              Empty workspace.
            </div>
          ) : (
            <div className="space-y-0.5">
              {tree.map((node) => (
                <FileTreeNode
                  key={node.id}
                  node={node}
                  depth={0}
                  expanded={expanded}
                  toggleExpand={toggleExpand}
                />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function SearchResults({
  results,
  searching,
  onOpen,
}: {
  results: SearchResult[];
  searching: boolean;
  onOpen: (id: string) => void;
}) {
  if (searching) {
    return (
      <div className="px-3 py-8 text-center text-xs text-muted-foreground">
        Searching…
      </div>
    );
  }
  if (results.length === 0) {
    return (
      <div className="px-3 py-8 text-center text-xs text-muted-foreground">
        No matches.
      </div>
    );
  }
  return (
    <div className="space-y-0.5">
      {results.map((r) => (
        <button
          key={r.nodeId}
          onClick={() => onOpen(r.nodeId)}
          className="w-full text-left px-2 py-1.5 rounded-md hover:bg-muted/60 transition-colors"
        >
          <div className="text-[13px] truncate font-medium">{r.name}</div>
          {r.path && (
            <div className="text-[11px] text-muted-foreground truncate">
              {r.path}
            </div>
          )}
          {r.snippet && (
            <div className="text-[11px] text-muted-foreground/80 truncate mt-0.5">
              {r.snippet}
            </div>
          )}
        </button>
      ))}
    </div>
  );
}
