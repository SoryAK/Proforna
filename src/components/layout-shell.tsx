"use client";

import { usePathname } from "next/navigation";
import { Sidebar, MobileHeader, AppHeader } from "@/components/sidebar";
import { CommandPalette } from "@/components/command-palette";
import { AIChat } from "@/components/ai-chat";
import { QuickLogDialog } from "@/components/quick-log-dialog";

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPortal = pathname.startsWith("/portal") || pathname.startsWith("/r/");

  if (isPortal) {
    return <>{children}</>;
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-gray-50 dark:bg-gray-900">
      <AppHeader />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <MobileHeader />
          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto p-4 sm:p-6">{children}</div>
          </main>
        </div>
        <AIChat />
      </div>
      <CommandPalette />
      <QuickLogDialog />
    </div>
  );
}
