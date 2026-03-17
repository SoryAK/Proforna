"use client";

import { usePathname } from "next/navigation";
import { Sidebar, MobileHeader } from "@/components/sidebar";
import { CommandPalette } from "@/components/command-palette";

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPortal = pathname.startsWith("/portal");

  if (isPortal) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen flex-col md:flex-row overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <MobileHeader />
        <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
          <div className="mx-auto p-4 sm:p-6">{children}</div>
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}
