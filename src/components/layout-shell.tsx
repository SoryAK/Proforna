"use client";

import { usePathname } from "next/navigation";
import { Sidebar, MobileHeader, AppHeader, SidebarProvider } from "@/components/sidebar";
import { CommandPalette } from "@/components/command-palette";
import { AIChat } from "@/components/ai-chat";
import { QuickLogDialog } from "@/components/quick-log-dialog";

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPortal = pathname.startsWith("/portal/") || pathname === "/portal" || pathname.startsWith("/r/");

  if (isPortal) {
    return <>{children}</>;
  }

  return (
    <SidebarProvider>
    <div className="flex flex-col h-screen overflow-hidden bg-white dark:bg-gray-950">
      <AppHeader />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <MobileHeader />
          <main className="flex-1 overflow-y-auto scrollbar-thin">
            <div className="mx-auto p-4 sm:p-6">{children}</div>
          </main>
        </div>
        <AIChat />
      </div>
      <CommandPalette />
      <QuickLogDialog />
    </div>
    </SidebarProvider>
  );
}
