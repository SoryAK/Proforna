"use client";

import { useCallback, useEffect, useState, type MouseEvent as ReactMouseEvent } from "react";

const STORAGE_KEY = "resumsify-ai-width";
const DEFAULT_WIDTH = 400;
const MIN_WIDTH = 280;
const MAX_WIDTH = 1200;

export interface UseAiChatResizeResult {
  panelWidth: number;
  isDragging: boolean;
  startResizing: (e: ReactMouseEvent) => void;
}

/**
 * Owns the AI chat side panel's resize state: width (px), drag flag, and
 * the mousedown handler that arms the global mousemove/mouseup listeners.
 *
 * Width is hydrated from `localStorage["resumsify-ai-width"]` on mount and
 * persisted on every mouseup. Clamped to [280, 1200] during drag.
 *
 * Extracted from ai-chat.tsx in the Phase 2 god-file refactor; behavior is
 * preserved bit-for-bit including the chatty `[isDragging, panelWidth]`
 * effect dependency (re-binds handlers on every width change to keep the
 * mouseup closure's `panelWidth` reference fresh for persistence).
 */
export function useAiChatResize(): UseAiChatResizeResult {
  const [panelWidth, setPanelWidth] = useState(DEFAULT_WIDTH);
  const [isDragging, setIsDragging] = useState(false);

  // Hydrate from localStorage once on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedWidth = localStorage.getItem(STORAGE_KEY);
      if (savedWidth) setPanelWidth(Number(savedWidth));
    }
  }, []);

  const startResizing = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      let newWidth = document.documentElement.clientWidth - e.clientX;
      if (newWidth < MIN_WIDTH) newWidth = MIN_WIDTH;
      if (newWidth > MAX_WIDTH) newWidth = MAX_WIDTH;
      setPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      localStorage.setItem(STORAGE_KEY, panelWidth.toString());
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [isDragging, panelWidth]);

  return { panelWidth, isDragging, startResizing };
}
