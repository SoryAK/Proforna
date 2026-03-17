"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/lib/constants";
import {
  LayoutDashboard,
  Briefcase,
  CalendarDays,
  Users,
  Zap,
  FileText,
  Target,
  Inbox,
  Globe,
  Building2,
  Menu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";

const iconMap: Record<string, React.ElementType> = {
  LayoutDashboard,
  Building2,
  Briefcase,
  CalendarDays,
  Users,
  Zap,
  FileText,
  Target,
  Inbox,
  Globe,
};

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 space-y-1 p-3">
      {NAV_ITEMS.map((item) => {
        const Icon = iconMap[item.icon];
        const isActive =
          item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            )}
          >
            {Icon && <Icon className="h-4 w-4" />}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Desktop sidebar — hidden below md */
export function Sidebar() {
  return (
    <aside className="hidden md:flex h-full w-64 flex-col border-r bg-white dark:bg-gray-950">
      <div className="flex h-14 items-center border-b px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold text-lg">
          <Briefcase className="h-5 w-5 text-blue-600" />
          <span>Resumsify</span>
        </Link>
      </div>
      <NavLinks />
      <div className="border-t p-3">
        <p className="text-xs text-gray-400 text-center">
          Career Tracker v1.0
        </p>
      </div>
    </aside>
  );
}

/** Mobile top-bar with sheet — visible below md */
export function MobileHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="flex md:hidden h-14 items-center border-b bg-white dark:bg-gray-950 px-4 gap-3">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          render={<Button variant="ghost" size="icon" />}
        >
          <Menu className="h-5 w-5" />
          <span className="sr-only">Open menu</span>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <div className="flex h-14 items-center border-b px-4">
            <SheetTitle className="flex items-center gap-2 font-semibold text-lg">
              <Briefcase className="h-5 w-5 text-blue-600" />
              Resumsify
            </SheetTitle>
          </div>
          <NavLinks onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <Link href="/" className="flex items-center gap-2 font-semibold text-lg">
        <Briefcase className="h-5 w-5 text-blue-600" />
        <span>Resumsify</span>
      </Link>
    </header>
  );
}
