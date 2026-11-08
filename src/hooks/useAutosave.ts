// Autosave hook with conflict protection.
//
// Strategy:
// - The editor is keyed by node id, so each note gets a fresh hook instance.
// - A local version counter is seeded from the node's persisted
//   contentVersion on mount.
// - Every edit increments the local version.
// - A debounced save (5s after the last edit) captures the version at schedule
//   time and writes only if it is still >= the persisted version; older saves
//   are skipped because saveNoteContent compares versions.
// - On unmount / visibility-hidden, a force-save writes immediately.
// - A beforeunload listener attempts a best-effort save.

"use client";

import { useCallback, useEffect, useRef } from "react";
import { forceSaveNoteContent, saveNoteContent } from "@/lib/fileSystem";

interface UseAutosaveArgs {
  nodeId: string;
  content: string;
  baseVersion: number; // the node's contentVersion when content was loaded
  enabled?: boolean;
}

export function useAutosave({
  nodeId,
  content,
  baseVersion,
  enabled = true,
}: UseAutosaveArgs) {
  const versionRef = useRef(baseVersion);
  const lastSavedContentRef = useRef<string>(content);
  const contentRef = useRef(content);
  const nodeIdRef = useRef(nodeId);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);

  // Keep latest content/node id available to event-handler closures.
  useEffect(() => {
    contentRef.current = content;
    nodeIdRef.current = nodeId;
  }, [content, nodeId]);

  // On mount (keyed instance), seed the version tracker.
  useEffect(() => {
    versionRef.current = baseVersion;
    lastSavedContentRef.current = content;
    dirtyRef.current = false;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, [nodeId, baseVersion]);

  // Track edits and schedule a debounced save (5s).
  useEffect(() => {
    if (!enabled) return;
    if (content === lastSavedContentRef.current) return;
    dirtyRef.current = true;
    versionRef.current += 1;
    const capturedVersion = versionRef.current;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      const id = nodeIdRef.current;
      if (!id) return;
      const ok = await saveNoteContent(id, contentRef.current, capturedVersion);
      if (ok) {
        lastSavedContentRef.current = contentRef.current;
        dirtyRef.current = false;
      }
    }, 5000);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [content, enabled]);

  // Force save on unmount / visibility-hidden.
  const forceSave = useCallback(async () => {
    const id = nodeIdRef.current;
    if (!id) return;
    if (!dirtyRef.current && contentRef.current === lastSavedContentRef.current) {
      return;
    }
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    await forceSaveNoteContent(id, contentRef.current);
    lastSavedContentRef.current = contentRef.current;
    dirtyRef.current = false;
  }, []);

  // beforeunload: best-effort save.
  useEffect(() => {
    const handler = () => {
      const id = nodeIdRef.current;
      if (!id) return;
      if (contentRef.current === lastSavedContentRef.current) return;
      void forceSaveNoteContent(id, contentRef.current);
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // Save when the tab is hidden (crash recovery).
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === "hidden") {
        void forceSave();
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [forceSave]);

  // Force save on unmount.
  useEffect(() => {
    return () => {
      void forceSave();
    };
  }, [forceSave]);

  return { forceSave };
}
