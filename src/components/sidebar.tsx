"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/lib/constants";
import {
  Home,
  Globe,
  Building2,
  Menu,
  Sun,
  Moon,
  Monitor,
  Search,
  TrendingUp,
  BarChart3,
  FolderOpen,
  BookOpen,
  Brain,
  Shield,
  Megaphone,
  Network,
  Map,
  ChevronDown,
  LogOut,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { NotificationBell } from "@/components/notification-bell";

const iconMap: Record<string, React.ElementType> = {
  Home,
  Building2,
  Search,
  TrendingUp,
  BarChart3,
  BookOpen,
  FolderOpen,
  Brain,
  Shield,
  Megaphone,
  Network,
  Map,
  Globe,
};

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const [jobsOpen, setJobsOpen] = useState(() => pathname.startsWith("/current-position"));

  const { data: positions } = useQuery<{ id: string; company: string; role: string; isActive: boolean }[]>({
    queryKey: ["positions"],
    queryFn: () => fetch("/api/current-position").then((r) => r.json()),
    staleTime: 60_000,
  });
  const activeJobs = positions?.filter((p) => p.isActive) ?? [];

  return (
    <nav className="flex-1 space-y-1 p-3 overflow-y-auto">
      {NAV_ITEMS.map((item) => {
        const Icon = iconMap[item.icon];
        const isActive =
          item.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(item.href);

        // Jobs item gets accordion treatment
        if (item.href === "/current-position") {
          return (
            <div key={item.href}>
              <div className="flex items-center">
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "flex flex-1 items-center gap-3 rounded-lg rounded-r-none px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-orange-100 text-orange-700 border-l-[3px] border-orange-500 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-400"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                  )}
                >
                  {Icon && <Icon className="h-4 w-4" />}
                  {item.label}
                </Link>
                {activeJobs.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setJobsOpen(!jobsOpen)}
                    className={cn(
                      "rounded-lg rounded-l-none px-2 py-2 transition-colors",
                      isActive
                        ? "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300"
                        : "text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
                    )}
                  >
                    <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", jobsOpen ? "rotate-0" : "-rotate-90")} />
                  </button>
                )}
              </div>
              {jobsOpen && activeJobs.length > 0 && (
                <div className="ml-7 mt-0.5 space-y-0.5 border-l pl-3">
                  {activeJobs.map((job) => (
                    <Link
                      key={job.id}
                      href="/current-position"
                      onClick={onNavigate}
                      className="block rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800 dark:hover:text-gray-200 transition-colors truncate"
                      title={`${job.role} at ${job.company}`}
                    >
                      <span className="font-medium text-foreground">{job.role}</span>
                      <span className="text-muted-foreground"> · {job.company}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-orange-100 text-orange-700 border-l-[3px] border-orange-500 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-400"
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

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const cycle = () => {
    if (theme === "light") setTheme("dark");
    else if (theme === "dark") setTheme("system");
    else setTheme("light");
  };

  if (!mounted) {
    return <Button variant="ghost" size="icon"><Sun className="h-4 w-4" /></Button>;
  }

  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  return (
    <Button variant="ghost" size="icon" onClick={cycle} title={`Theme: ${theme}`}>
      <Icon className="h-4 w-4" />
    </Button>
  );
}

/** Desktop sidebar — hidden below md */
export function Sidebar() {
  return (
    <aside className="hidden md:flex h-full w-56 flex-col border-r bg-white dark:bg-gray-950">
      <div className="flex h-16 items-center justify-between border-b px-4">
        <Link href="/dashboard" className="flex items-center gap-2.5 font-semibold text-lg">
          <Image src="/logo-icon.png" alt="Resumsify" width={32} height={32} className="h-8 w-8" />
          <span>Resumsify</span>
        </Link>
        <button
          onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
          className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-muted transition-colors"
          title="Search (Ctrl+K)"
        >
          <Search className="h-3 w-3" />
          <kbd className="text-[10px]">Ctrl+K</kbd>
        </button>
      </div>
      <NavLinks />
      <div className="border-t p-3 space-y-2">
        <div className="flex items-center gap-2">
          <NotificationBell />
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => signOut({ callbackUrl: "/login" })}
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-500">
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
    <header className="flex md:hidden h-16 items-center border-b bg-white dark:bg-gray-950 px-4 gap-3">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          render={<Button variant="ghost" size="icon" />}
        >
          <Menu className="h-5 w-5" />
          <span className="sr-only">Open menu</span>
        </SheetTrigger>
        <SheetContent side="left" className="w-56 p-0">
          <div className="flex h-16 items-center border-b px-4">
            <SheetTitle className="flex items-center gap-2.5 font-semibold text-lg">
              <Image src="/logo-icon.png" alt="Resumsify" width={32} height={32} className="h-8 w-8" />
              Resumsify
            </SheetTitle>
          </div>
          <NavLinks onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <Link href="/dashboard" className="flex items-center gap-2.5 font-semibold text-lg">
        <Image src="/logo-icon.png" alt="Resumsify" width={32} height={32} className="h-8 w-8" />
        <span>Resumsify</span>
      </Link>
      <div className="ml-auto flex items-center gap-1">
        <NotificationBell />
        <ThemeToggle />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => signOut({ callbackUrl: "/login" })}
          title="Sign out"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
