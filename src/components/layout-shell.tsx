"use client";

import { usePathname } from "next/navigation";
import { Sidebar, MobileHeader, AppHeader, SidebarProvider } from "@/components/sidebar";
import { CommandPalette } from "@/components/command-palette";
import { AIChat } from "@/components/ai-chat";
import { AIChatProvider } from "@/components/ai-chat-provider";
import { QuickLogDialog } from "@/components/quick-log-dialog";
import { WorklogDndProvider } from "@/components/worklog/worklog-dnd-provider";

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPortal = pathname.startsWith("/portal/") || pathname === "/portal" || pathname.startsWith("/r/");

  if (isPortal) {
    return <>{children}</>;
  }

  // ADR-0013: when the worklog section nav override is active, the global
  // <Sidebar> renders <WorklogNavSidebar> with its drag-droppable folder tree.
  // Both the sidebar and the page need to share one DndContext so that
  // dragging a note from the page's list onto a folder in the sidebar works.
  // Wrap the entire shell (sidebar + main) in <WorklogDndProvider> only on
  // /worklog routes; the page no longer mounts its own.
  const isWorklog = pathname.startsWith("/worklog");

  const shellBody = (
    <div className="flex flex-1 overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <MobileHeader />
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="layout-shell-content mx-auto p-4 sm:p-6">{children}</div>
        </main>
      </div>
      <AIChat />
    </div>
  );

  return (
    <SidebarProvider>
      <AIChatProvider>
        <div className="flex flex-col h-screen overflow-hidden bg-white dark:bg-gray-950">
          <AppHeader />
          {isWorklog ? <WorklogDndProvider>{shellBody}</WorklogDndProvider> : shellBody}
          <CommandPalette />
          <QuickLogDialog />
        </div>
      </AIChatProvider>
    </SidebarProvider>
  );
}
