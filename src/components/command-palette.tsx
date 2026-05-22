"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Home,
  Briefcase,
  Users,
  Zap,
  Target,
  TrendingUp,
  Globe,
  Building2,
  Search,
  ArrowRight,
  BarChart3,
  BookOpen,
  FolderOpen,
  Boxes,
  Cog,
  NotebookPen,
  Images,
  PlusCircle,
} from "lucide-react";
import {
  CommandDialog,
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import { QuickCaptureDialog } from "@/components/worklog/quick-capture-dialog";

const NAV_PAGES = [
  { label: "Home", href: "/", icon: Home },
  { label: "Jobs", href: "/current-position", icon: Building2 },
  { label: "Job Search", href: "/job-search", icon: Search },
  { label: "Career Analytics", href: "/career-growth", icon: TrendingUp },
  { label: "Personal Inventory", href: "/inventory", icon: Boxes },
  { label: "Job Assets", href: "/job-assets", icon: Cog },
  { label: "Master Gallery", href: "/master-gallery", icon: Images },
  { label: "Worklog", href: "/worklog", icon: NotebookPen },
  { label: "Insights", href: "/insights", icon: BarChart3 },
  { label: "Research", href: "/research", icon: BookOpen },
  { label: "Documents", href: "/docs", icon: FolderOpen },
  { label: "Portal Settings", href: "/portal-settings", icon: Globe },
];

interface SearchResults {
  applications: { id: string; company: string; role: string }[];
  contacts: { id: string; name: string; company: string | null }[];
  goals: { id: string; title: string }[];
  skills: { id: string; name: string; category: string }[];
  worklogs: {
    id: string;
    title: string;
    date: string;
    tags: string | null;
    isNotable: boolean;
    content: string | null;
  }[];
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [quickCaptureOpen, setQuickCaptureOpen] = useState(false);
  const router = useRouter();

  // Keyboard shortcuts
  //  - Cmd/Ctrl+K → toggle the global command palette.
  //  - We deliberately don't add a second global hotkey for QuickCapture: the
  //    obvious choices (Cmd+Shift+N / Cmd+N) are claimed by the browser
  //    (new incognito / new window) and preventDefault doesn't fight that
  //    reliably. QuickCapture is exposed via Cmd+K → "New worklog".
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && !e.shiftKey && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  // Fetch searchable entities when palette is open
  const { data } = useQuery<SearchResults>({
    queryKey: ["command-palette-search"],
    queryFn: () => fetch("/api/search").then((r) => r.json()),
    enabled: open,
    staleTime: 10_000,
  });

  const navigate = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router]
  );

  return (
    <>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <Command>
          <CommandInput placeholder="Search pages, applications, contacts, goals, worklogs..." />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>

            {/* Quick actions */}
            <CommandGroup heading="Actions">
              <CommandItem
                value="new worklog quick capture note"
                onSelect={() => {
                  setOpen(false);
                  setQuickCaptureOpen(true);
                }}
              >
                <PlusCircle className="mr-2 h-4 w-4 text-muted-foreground" />
                New worklog
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />

            {/* Pages */}
            <CommandGroup heading="Pages">
            {NAV_PAGES.map((page) => {
              const Icon = page.icon;
              return (
                <CommandItem
                  key={page.href}
                  onSelect={() => navigate(page.href)}
                >
                  <Icon className="mr-2 h-4 w-4 text-muted-foreground" />
                  {page.label}
                </CommandItem>
              );
            })}
          </CommandGroup>

          {/* Applications */}
          {data?.applications && data.applications.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Applications">
                {data.applications.map((app) => (
                  <CommandItem
                    key={app.id}
                    onSelect={() => navigate("/applications")}
                  >
                    <Briefcase className="mr-2 h-4 w-4 text-muted-foreground" />
                    {app.company} — {app.role}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {/* Contacts */}
          {data?.contacts && data.contacts.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Contacts">
                {data.contacts.map((c) => (
                  <CommandItem
                    key={c.id}
                    onSelect={() => navigate("/contacts")}
                  >
                    <Users className="mr-2 h-4 w-4 text-muted-foreground" />
                    {c.name}
                    {c.company && (
                      <span className="ml-1 text-muted-foreground">
                        at {c.company}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {/* Goals */}
          {data?.goals && data.goals.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Goals">
                {data.goals.map((g) => (
                  <CommandItem
                    key={g.id}
                    onSelect={() => navigate("/goals")}
                  >
                    <Target className="mr-2 h-4 w-4 text-muted-foreground" />
                    {g.title}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {/* Skills */}
          {data?.skills && data.skills.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Skills">
                {data.skills.map((s) => (
                  <CommandItem
                    key={s.id}
                    onSelect={() => navigate("/skills")}
                  >
                    <Zap className="mr-2 h-4 w-4 text-muted-foreground" />
                    {s.name}
                    <span className="ml-1 text-muted-foreground capitalize">
                      ({s.category})
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {/* Worklogs — PRIVATE, owner-only. */}
          {data?.worklogs && data.worklogs.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Worklogs">
                {data.worklogs.map((w) => {
                  const date = new Date(w.date);
                  const dateLabel = date.toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "2-digit",
                  });
                  return (
                    <CommandItem
                      key={w.id}
                      // value is what cmdk fuzzy-matches against — include title + tags + content snippet
                      value={`worklog ${w.title} ${w.tags ?? ""} ${(w.content ?? "").slice(0, 200)}`}
                      onSelect={() => navigate(`/worklog?focus=${w.id}`)}
                    >
                      <NotebookPen className="mr-2 h-4 w-4 text-muted-foreground" />
                      <span className="truncate">{w.title}</span>
                      {w.isNotable && (
                        <span className="ml-1 text-yellow-500" title="Notable">★</span>
                      )}
                      <span className="ml-auto pl-2 text-xs text-muted-foreground shrink-0">
                        {dateLabel}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
    <QuickCaptureDialog open={quickCaptureOpen} onOpenChange={setQuickCaptureOpen} />
    </>
  );
}
