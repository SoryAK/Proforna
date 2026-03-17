"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Briefcase,
  CalendarDays,
  Users,
  Zap,
  FileText,
  Target,
  TrendingUp,
  Mail,
  Inbox,
  Globe,
  Building2,
  History,
  Search,
  ArrowRight,
  BarChart3,
  FolderOpen,
  Clock,
  ArrowDownUp,
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

const NAV_PAGES = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Current Role", href: "/current-position", icon: Building2 },
  { label: "Experience", href: "/experience", icon: History },
  { label: "Applications", href: "/applications", icon: Briefcase },
  { label: "Contacts", href: "/contacts", icon: Users },
  { label: "Skills", href: "/skills", icon: Zap },
  { label: "Resumes", href: "/resumes", icon: FileText },
  { label: "Goals", href: "/goals", icon: Target },
  { label: "Career Model", href: "/career-model", icon: TrendingUp },
  { label: "Analytics", href: "/analytics", icon: BarChart3 },
  { label: "Documents", href: "/documents", icon: FolderOpen },
  { label: "Activity", href: "/activity", icon: Clock },
  { label: "Import / Export", href: "/import-export", icon: ArrowDownUp },
  { label: "Email", href: "/email", icon: Mail },
  { label: "Submissions", href: "/submissions", icon: Inbox },
  { label: "Portal Settings", href: "/portal-settings", icon: Globe },
  { label: "Interviews", href: "/interviews", icon: CalendarDays },
];

interface SearchResults {
  applications: { id: string; company: string; role: string }[];
  contacts: { id: string; name: string; company: string | null }[];
  goals: { id: string; title: string }[];
  skills: { id: string; name: string; category: string }[];
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  // Keyboard shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
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
    <CommandDialog open={open} onOpenChange={setOpen}>
      <Command>
        <CommandInput placeholder="Search pages, applications, contacts, goals..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>

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
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
