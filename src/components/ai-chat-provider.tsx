"use client";

import { createContext, useCallback, useContext, useState } from "react";

// ---------------------------------------------------------------------------
// AI Chat open-state context
// ---------------------------------------------------------------------------
// Mirrors the SidebarProvider pattern in `sidebar.tsx`. Lets the AppHeader
// (and MobileHeader) own the AI chat trigger button while the actual
// <AIChat /> panel remains the consumer — replacing the floating fab that
// used to live inside <AIChat /> itself.

interface AIChatCtx {
  open: boolean;
  setOpen: (next: boolean) => void;
  toggle: () => void;
}

const AIChatContext = createContext<AIChatCtx | null>(null);

export function AIChatProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((prev) => !prev), []);
  return (
    <AIChatContext.Provider value={{ open, setOpen, toggle }}>
      {children}
    </AIChatContext.Provider>
  );
}

export function useAIChat() {
  const ctx = useContext(AIChatContext);
  if (!ctx) throw new Error("useAIChat must be used within AIChatProvider");
  return ctx;
}
