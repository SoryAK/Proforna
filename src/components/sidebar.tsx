"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, createContext, useContext } from "react";
import { useTheme } from "next-themes";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
  Images,
} from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";

import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PortalSettingsPanel } from "@/components/portal-settings-panel";
import { NotificationBell } from "@/components/notification-bell";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { WorklogNavSidebar } from "@/components/worklog/worklog-nav-sidebar";
import { STORAGE_KEYS, migrateLegacyKey } from "@/lib/storage-keys";

// ---------------------------------------------------------------------------
// Sidebar collapsed state — shared between AppHeader (hamburger) and Sidebar
// ---------------------------------------------------------------------------
interface SidebarCtx { collapsed: boolean; toggle: () => void; }
const SidebarContext = createContext<SidebarCtx | null>(null);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    migrateLegacyKey(STORAGE_KEYS.sidebar.collapsed);
    return localStorage.getItem(STORAGE_KEYS.sidebar.collapsed) === "true";
  });
  const toggle = () => setCollapsed((prev) => {
    const next = !prev;
    localStorage.setItem(STORAGE_KEYS.sidebar.collapsed, String(next));
    return next;
  });
  return <SidebarContext.Provider value={{ collapsed, toggle }}>{children}</SidebarContext.Provider>;
}

function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used within SidebarProvider");
  return ctx;
}

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
  Images,
};

function NavLinks({ onNavigate, collapsed }: { onNavigate?: () => void; collapsed?: boolean }) {
  const pathname = usePathname();
  const [jobsOpen, setJobsOpen] = useState(() => pathname.startsWith("/work-map") || pathname.startsWith("/experience"));

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

    if (item.href === "/work-map") {
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
  const { collapsed } = useSidebar();
  const pathname = usePathname();

  // ADR-0013: routes can override the sidebar's contents with their own
  // section-scoped nav. Collapsed sidebar always falls back to the default
  // top-level icon nav (escape hatch to other top-level routes).
  //
  // `showGlobalNav` lets the user explicitly opt out of the feature nav
  // *without* collapsing the rail. The back chevron in WorklogNavSidebar
  // sets it to true; clicking any link in the global rail (including the
  // Worklog entry itself) flips it back to false; navigating away from
  // /worklog clears it. Persisted to localStorage so a reload at the same
  // /worklog URL keeps the global nav visible.
  const isWorklog = pathname.startsWith("/worklog");
  const [showGlobalNav, setShowGlobalNav] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    migrateLegacyKey(STORAGE_KEYS.sidebar.worklogShowGlobal);
    return window.localStorage.getItem(STORAGE_KEYS.sidebar.worklogShowGlobal) === "true";
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (showGlobalNav) {
      window.localStorage.setItem(STORAGE_KEYS.sidebar.worklogShowGlobal, "true");
    } else {
      window.localStorage.removeItem(STORAGE_KEYS.sidebar.worklogShowGlobal);
    }
  }, [showGlobalNav]);
  // Pathname leaving /worklog/* resets the override — the flag only carries
  // meaning while the user is still on a worklog route.
  useEffect(() => {
    if (!isWorklog && showGlobalNav) setShowGlobalNav(false);
  }, [isWorklog, showGlobalNav]);

  const useWorklogOverride = isWorklog && !collapsed && !showGlobalNav;

  return (
    <aside className={cn(
      "hidden md:flex h-full flex-col bg-white dark:bg-gray-950 transition-all duration-200 shadow-[1px_0_0_0_rgb(0_0_0/0.06),4px_0_16px_0_rgb(0_0_0/0.04)] dark:shadow-[1px_0_0_0_rgb(255_255_255/0.05),4px_0_24px_0_rgb(0_0_0/0.4)]",
      collapsed ? "w-16" : "w-72"
    )}>
      {useWorklogOverride ? (
        <WorklogNavSidebar onShowGlobal={() => setShowGlobalNav(true)} />
      ) : (
        <NavLinks
          collapsed={collapsed}
          onNavigate={() => setShowGlobalNav(false)}
        />
      )}

    </aside>
  );
}

/** Theme switcher as a dropdown item */
function ThemeDropdownItem() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const next = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  const label = theme === "dark" ? "Dark mode" : theme === "light" ? "Light mode" : "System theme";

  return (
    <DropdownMenuItem onClick={() => setTheme(next)} className="cursor-pointer">
      {mounted ? <Icon className="h-4 w-4 mr-2" /> : <Sun className="h-4 w-4 mr-2" />}
      {mounted ? label : "Theme"}
    </DropdownMenuItem>
  );
}

/** Flat nav map: href → label */
const NAV_LABEL_MAP: Record<string, string> = NAV_SECTIONS.flatMap((s) => s.items).reduce(
  (acc, item) => ({ ...acc, [item.href]: item.label }),
  {} as Record<string, string>
);

/** Desktop top header bar — visible on md+ */
export function AppHeader() {
  const { collapsed, toggle } = useSidebar();
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const qc = useQueryClient();
  const { data: profile } = useQuery<{ avatarUrl?: string | null; fullName?: string | null; headline?: string | null }>({
    queryKey: ["profile-avatar"],
    queryFn: () => fetch("/api/profile").then((r) => r.json()),
    staleTime: 5 * 60_000,
  });

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [initialSection, setInitialSection] = useState<"profile" | "integrations">("profile");

  // Deep-link + OAuth callback flag handling.
  // Owns ?settings=<section> (auto-open dialog on the right tab) and
  // ?notion=connected | ?notion=error=... (toast + invalidate, then strip flags).
  useEffect(() => {
    const settingsFlag = searchParams.get("settings");
    const notionFlag = searchParams.get("notion");
    if (!settingsFlag && !notionFlag) return;

    if (settingsFlag === "integrations") {
      setInitialSection("integrations");
      setSettingsOpen(true);
    }

    if (notionFlag === "connected") {
      toast.success("Notion workspace connected");
      qc.invalidateQueries({ queryKey: ["integrations"] });
    } else if (notionFlag && notionFlag.startsWith("error=")) {
      const reason = decodeURIComponent(notionFlag.slice("error=".length)).slice(0, 80);
      toast.error(`Notion connection failed: ${reason}`);
    }

    // Strip flags so refreshes don't re-fire toasts or re-open the dialog.
    router.replace(pathname);
  }, [searchParams, router, pathname, qc]);

  const avatarSrc = profile?.avatarUrl ?? session?.user?.image ?? undefined;
  const displayName = profile?.fullName ?? session?.user?.name ?? null;
  const headline = profile?.headline ?? null;

  // Route-aware page label for the header centre slot.
  // Falls back to the longest matching prefix in NAV_LABEL_MAP so deep routes
  // like /worklog/notes/<id> still surface "Worklog".
  const pageLabel: string | null = (() => {
    if (NAV_LABEL_MAP[pathname]) return NAV_LABEL_MAP[pathname];
    const prefix = Object.keys(NAV_LABEL_MAP)
      .filter((href) => href !== "/" && pathname.startsWith(href + "/"))
      .sort((a, b) => b.length - a.length)[0];
    return prefix ? NAV_LABEL_MAP[prefix] : null;
  })();

  return (
    <>
      <header className="hidden md:flex h-16 shrink-0 items-center justify-between bg-white/70 dark:bg-gray-950/70 backdrop-blur-md shadow-[0_1px_0_0_rgb(0_0_0/0.06),0_2px_12px_0_rgb(0_0_0/0.04)] dark:shadow-[0_1px_0_0_rgb(255_255_255/0.05),0_2px_20px_0_rgb(0_0_0/0.5)] z-30 px-4">
        {/* Left: Hamburger + Logo + Name */}
        <div className="flex items-center gap-2">
          <button
            onClick={toggle}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
            <Image src="/logo-icon.png" alt="Resumsify" width={28} height={28} className="h-7 w-7" />
            <span className="font-bold text-xl">Resumsify</span>
          </Link>
        </div>

        {/* Centre: page label (md+) + search pill (lg+) */}
        <div className="flex items-center gap-3 min-w-0">
          {pageLabel && (
            <span className="text-sm font-medium text-foreground/80 truncate">{pageLabel}</span>
          )}
          <button
            onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, metaKey: true, bubbles: true }))}
            className="hidden lg:flex items-center gap-2 h-9 w-64 xl:w-80 rounded-lg border border-border/60 bg-muted/40 hover:bg-muted/70 px-3 text-sm text-muted-foreground transition-colors"
          >
            <Search className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1 text-left">Search…</span>
            <kbd className="hidden xl:inline-flex items-center gap-0.5 rounded border border-border/60 bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              <span>⌘</span><span>K</span>
            </kbd>
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <NotificationBell />
          <DropdownMenu>
            <DropdownMenuTrigger
              className="flex items-center justify-center h-8 w-8 rounded-full outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 hover:ring-2 hover:ring-primary/40 transition-all duration-150"
            >
              {avatarSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarSrc} alt={displayName ?? "User"} className="h-8 w-8 rounded-full object-cover ring-1 ring-primary/30" />
              ) : (
                <div className="h-8 w-8 rounded-full bg-primary/10 ring-1 ring-primary/30 flex items-center justify-center">
                  <User className="h-4 w-4 text-primary" />
                </div>
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {/* Mini user card */}
              <DropdownMenuGroup>
                <div className="flex items-center gap-3 px-3 py-2.5">
                  {avatarSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarSrc} alt={displayName ?? "User"} className="h-9 w-9 rounded-full object-cover shrink-0 ring-2 ring-primary/20" />
                  ) : (
                    <div className="h-9 w-9 rounded-full bg-primary/10 ring-2 ring-primary/20 flex items-center justify-center shrink-0">
                      <User className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-tight truncate">{displayName ?? "You"}</p>
                    {headline && (
                      <p className="text-xs text-muted-foreground leading-tight truncate">{headline}</p>
                    )}
                  </div>
                </div>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem render={<Link href="/profile" />}>
                  <User className="h-4 w-4 mr-2" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setInitialSection("profile"); setSettingsOpen(true); }}>
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </DropdownMenuItem>
                <ThemeDropdownItem />
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/login" })} className="text-destructive focus:text-destructive">
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Settings Dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="w-[90vw] max-w-6xl sm:max-w-6xl h-[85vh] p-0 overflow-hidden flex flex-col gap-0">
          <DialogHeader className="px-6 py-4 border-b shrink-0">
            <DialogTitle>Settings</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden">
            <PortalSettingsPanel initialSection={initialSection} />
          </div>
        </DialogContent>
      </Dialog>
    </>
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
