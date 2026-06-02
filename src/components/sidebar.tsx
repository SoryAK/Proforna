"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { NAV_SECTIONS } from "@/lib/constants";
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
  Boxes,
  NotebookPen,
  Plug,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LogOut,
  User,
  Users,
  Settings,
} from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";

import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PortalSettingsPanel } from "@/components/portal-settings-panel";
import { NotificationBell } from "@/components/notification-bell";
import { QuickLogTrigger } from "@/components/quick-log-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const iconMap: Record<string, React.ElementType> = {
  Home,
  Building2,
  Users,
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
  Boxes,
  NotebookPen,
  Globe,
  Plug,
};

function NavLinks({ onNavigate, collapsed }: { onNavigate?: () => void; collapsed?: boolean }) {
  const pathname = usePathname();
  const [jobsOpen, setJobsOpen] = useState(() => pathname.startsWith("/current-position") || pathname.startsWith("/experience"));

  const { data: workHistory } = useQuery<{ id: string; company: string; title: string | null; endDate: string | null; type: string }[]>({
    queryKey: ["work-history"],
    queryFn: () => fetch("/api/work-history").then((r) => r.json()),
    staleTime: 60_000,
  });
  const activeJobs = workHistory?.filter((p) => !p.endDate && p.type === "job") ?? [];

  const isItemActive = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);

  const activeClass = "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-100";
  const inactiveClass = "text-muted-foreground hover:bg-accent hover:text-accent-foreground";

  const renderItem = (item: { label: string; href: string; icon: string }) => {
    const Icon = iconMap[item.icon];
    const isActive = isItemActive(item.href);
    const linkClass = cn(
      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-base font-medium transition-colors",
      collapsed && "justify-center px-0",
      isActive ? activeClass : inactiveClass
    );

    if (item.href === "/current-position") {
      if (collapsed) {
        return (
          <Tooltip key={item.href}>
            <TooltipTrigger render={<Link href={item.href} onClick={onNavigate} className={linkClass} />}>
              {Icon && <Icon className="h-5 w-5 shrink-0" />}
            </TooltipTrigger>
            <TooltipContent side="right">{item.label}</TooltipContent>
          </Tooltip>
        );
      }
      return (
        <div key={item.href}>
          <div className="flex items-center gap-1">
            <Link
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex flex-1 items-center gap-3 rounded-lg px-3 py-2.5 text-base font-medium transition-colors",
                isActive ? activeClass : inactiveClass
              )}
            >
              {Icon && <Icon className="h-5 w-5 shrink-0" />}
              {item.label}
            </Link>
            {activeJobs.length > 0 && (
              <button
                type="button"
                onClick={() => setJobsOpen(!jobsOpen)}
                className={cn(
                  "rounded-lg px-2 py-2.5 transition-colors",
                  isActive
                    ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-100"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <ChevronDown className={cn("h-4 w-4 transition-transform", jobsOpen ? "rotate-0" : "-rotate-90")} />
              </button>
            )}
          </div>
          {jobsOpen && activeJobs.length > 0 && (
            <div className="ml-7 mt-0.5 space-y-0.5 border-l pl-3">
              {activeJobs.map((job) => (
                <Link
                  key={job.id}
                  href={`/experience/${job.id}`}
                  onClick={onNavigate}
                  className="block rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors truncate"
                >
                  <span className="font-medium text-foreground">{job.title || job.company}</span>
                  <span className="text-muted-foreground"> · {job.company}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      );
    }

    if (collapsed) {
      return (
        <Tooltip key={item.href}>
          <TooltipTrigger render={<Link href={item.href} onClick={onNavigate} className={linkClass} />}>
            {Icon && <Icon className="h-5 w-5 shrink-0" />}
          </TooltipTrigger>
          <TooltipContent side="right">{item.label}</TooltipContent>
        </Tooltip>
      );
    }

    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onNavigate}
        className={linkClass}
      >
        {Icon && <Icon className="h-5 w-5 shrink-0" />}
        {item.label}
      </Link>
    );
  };

  return (
    <TooltipProvider>
      <nav className="flex-1 p-3 overflow-y-auto space-y-0">
        {NAV_SECTIONS.map((section, sectionIdx) => {
          const sectionHasActive = section.items.some((item) => isItemActive(item.href));
          return (
            <div key={section.label ?? "main"} className={sectionIdx > 0 ? "mt-1" : ""}>
              {sectionIdx > 0 && (
                <div className="flex items-center gap-2 px-1 mb-1 mt-2">
                  {!collapsed && section.label && (
                    <span className={cn(
                      "text-[10px] uppercase tracking-wider font-semibold shrink-0",
                      sectionHasActive ? "text-primary" : "text-muted-foreground"
                    )}>
                      {section.label}
                    </span>
                  )}
                  <div className="flex-1 border-t" />
                </div>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => renderItem(item))}
              </div>
            </div>
          );
        })}
      </nav>
    </TooltipProvider>
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
    return <Button variant="ghost" size="icon"><Sun className="h-5 w-5" /></Button>;
  }

  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  return (
    <Button variant="ghost" size="icon" onClick={cycle} title={`Theme: ${theme}`}>
      <Icon className="h-5 w-5" />
    </Button>
  );
}

/** Desktop sidebar — hidden below md */
export function Sidebar() {
  const { data: session } = useSession();
  const { data: profile } = useQuery<{ avatarUrl?: string | null; fullName?: string | null; headline?: string | null }>({
    queryKey: ["profile-avatar"],
    queryFn: () => fetch("/api/profile").then((r) => r.json()),
    staleTime: 5 * 60_000,
  });

  // Prefer the app-uploaded avatar, fall back to OAuth provider photo, then initials
  const avatarSrc = profile?.avatarUrl ?? session?.user?.image ?? undefined;
  const displayName = profile?.fullName ?? session?.user?.name ?? null;
  const headline = profile?.headline ?? null;

  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("sidebar-collapsed") === "true";
  });

  const [settingsOpen, setSettingsOpen] = useState(false);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar-collapsed", String(next));
      return next;
    });
  };

  return (
    <aside className={cn(
      "hidden md:flex h-full flex-col border-r bg-white dark:bg-gray-950 transition-all duration-200",
      collapsed ? "w-18" : "w-72"
    )}>
      {/* User identity card — card frame only when expanded */}
      {collapsed ? (
        <div className="flex justify-center pt-3 pb-3">
          <div className="relative">
            <Link href="/profile" title={displayName ?? "Profile"} className="shrink-0">
              {avatarSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarSrc} alt={displayName ?? "User"} className="h-10 w-10 rounded-full object-cover ring-2 ring-primary/30" />
              ) : (
                <div className="h-10 w-10 rounded-full bg-primary/10 ring-2 ring-primary/30 flex items-center justify-center">
                  <User className="h-5 w-5 text-primary" />
                </div>
              )}
            </Link>
            <button
              onClick={toggle}
              title="Expand sidebar"
              className="absolute -bottom-1 -right-1 flex items-center justify-center h-5 w-5 rounded-full border bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shadow-sm"
            >
              <ChevronRight className="h-3 w-3" />
            </button>
            <button
              onClick={() => setSettingsOpen(true)}
              title="Portal Settings"
              className="absolute -top-1 -right-1 flex items-center justify-center h-5 w-5 rounded-full border bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shadow-sm"
            >
              <Settings className="h-3 w-3" />
            </button>
          </div>
        </div>
      ) : (
        <div className="px-3 pt-3 pb-3">
          <div className="border rounded-xl flex items-center gap-3 p-3">
            <Link href="/profile" className="shrink-0">
              {avatarSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarSrc} alt={displayName ?? "User"} className="h-12 w-12 rounded-full object-cover ring-2 ring-primary/30" />
              ) : (
                <div className="h-12 w-12 rounded-full bg-primary/10 ring-2 ring-primary/30 flex items-center justify-center">
                  <User className="h-6 w-6 text-primary" />
                </div>
              )}
            </Link>
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold truncate">{displayName ?? "You"}</p>
            </div>
            <button
              onClick={() => setSettingsOpen(true)}
              title="Portal Settings"
              className="flex items-center justify-center h-6 w-6 rounded-full border bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
            >
              <Settings className="h-3 w-3" />
            </button>
            <button
              onClick={toggle}
              title="Collapse sidebar"
              className="flex items-center justify-center h-6 w-6 rounded-full border bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
            >
              <ChevronLeft className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      <NavLinks collapsed={collapsed} />

      {/* Footer */}
      <div className={cn("border-t p-3 space-y-2", collapsed && "p-2 flex flex-col items-center space-y-1")}>
        <div className={cn("flex items-center gap-2", collapsed && "flex-col gap-1")}>
          <NotificationBell />
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => signOut({ callbackUrl: "/login" })}
            title="Sign out"
          >
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
        {!collapsed && (
            <p className="text-xs text-muted-foreground">
            Career Tracker v1.0
          </p>
        )}
      </div>

      {/* Portal Settings Dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="w-[90vw] max-w-6xl sm:max-w-6xl h-[85vh] p-0 overflow-hidden flex flex-col gap-0">
          <DialogHeader className="px-6 py-4 border-b shrink-0">
            <DialogTitle>Portal Settings</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden">
            <PortalSettingsPanel />
          </div>
        </DialogContent>
      </Dialog>
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
        <SheetContent side="left" className="w-72 p-0">
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
      <div className="ml-auto flex items-center gap-1.5">
        <QuickLogTrigger />
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
