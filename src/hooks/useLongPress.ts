// Long-press / hold detection for touch and pointer devices.
// A short press calls onClick; a held press calls onLongPress. Presses that
// start on child elements that stop pointer-event propagation (e.g. the
// chevron toggle) are ignored so they don't double-trigger onClick.

"use client";

import { useCallback, useRef } from "react";

interface LongPressOptions {
  onLongPress: () => void;
  onClick?: () => void;
  delay?: number; // ms
  moveThreshold?: number; // px
}

export function useLongPress({
  onLongPress,
  onClick,
  delay = 480,
  moveThreshold = 8,
}: LongPressOptions) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggered = useRef(false);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const longPressed = useRef(false);
  const started = useRef(false);

  const clear = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const start = useCallback(
    (e: React.PointerEvent) => {
      triggered.current = false;
      longPressed.current = false;
      started.current = true;
      startPos.current = { x: e.clientX, y: e.clientY };
      clear();
      timer.current = setTimeout(() => {
        triggered.current = true;
        longPressed.current = true;
        onLongPress();
      }, delay);
    },
    [onLongPress, delay, clear]
  );

  const move = useCallback(
    (e: React.PointerEvent) => {
      if (!startPos.current) return;
      const dx = e.clientX - startPos.current.x;
      const dy = e.clientY - startPos.current.y;
      if (Math.abs(dx) > moveThreshold || Math.abs(dy) > moveThreshold) {
        clear();
        startPos.current = null;
        started.current = false;
      }
    },
    [moveThreshold, clear]
  );

  const end = useCallback(
    (e: React.PointerEvent) => {
      const didStart = started.current;
      clear();
      startPos.current = null;
      started.current = false;
      if (longPressed.current) {
        // Prevent the click that follows a long press.
        longPressed.current = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (triggered.current) return;
      // Only treat as a click if the press actually started on this element
      // (not stopped by a child). This prevents double-triggering when a child
      // button also handles the click.
      if (didStart && onClick) {
        onClick();
      }
    },
    [onClick, clear]
  );

  const cancel = useCallback(() => {
    clear();
    startPos.current = null;
    started.current = false;
    longPressed.current = false;
  }, [clear]);

  return {
    onPointerDown: start,
    onPointerMove: move,
    onPointerUp: end,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onContextMenu: (e: React.MouseEvent) => {
      // Allow right-click to trigger long press on desktop too.
      e.preventDefault();
      onLongPress();
    },
  };
}
