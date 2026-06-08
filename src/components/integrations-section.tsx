"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Calendar,
  Github,
  RefreshCw,
  Trash2,
  Plus,
  CheckCircle2,
  AlertCircle,
  Loader2,
  NotebookText,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type Connection = {
  id: string;
  provider: "ics" | "github" | "notion" | string;
  label: string | null;
  config: Record<string, unknown>;
  enabled: boolean;
  lastSyncedAt: string | null;
  lastSyncStatus: string | null;
  lastSyncCount: number;
  createdAt: string;
};

async function fetchConnections(): Promise<Connection[]> {
  const res = await fetch("/api/integrations");
  if (!res.ok) throw new Error("Failed to load integrations");
  return res.json();
}

/**
 * Integrations section rendered inside the unified Settings dialog.
 * Hosts ICS, GitHub, and Notion connections.
 *
 * URL-flag side-effects (`?notion=connected | ?notion=error=...`) are owned
 * by the caller (sidebar) so they survive whether the dialog is mounted or not.
 */
export function IntegrationsSection() {
  const qc = useQueryClient();
  const { data: connections = [], isLoading } = useQuery({
    queryKey: ["integrations"],
    queryFn: fetchConnections,
  });

  const [icsUrl, setIcsUrl] = useState("");
  const [icsLabel, setIcsLabel] = useState("");
  const [ghUser, setGhUser] = useState("");
  const [ghLabel, setGhLabel] = useState("");

  const addMut = useMutation({
    mutationFn: async (body: { provider: string; label?: string; config: Record<string, unknown> }) => {
      const res = await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to add");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["integrations"] });
      toast.success("Connection added — click Sync now to pull events");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const syncMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/integrations/${id}/sync`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Sync failed");
      return json;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["integrations"] });
      qc.invalidateQueries({ queryKey: ["work-logs"] });
      toast.success(`Synced ${data.touched ?? 0} item${data.touched === 1 ? "" : "s"} into your worklog`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const res = await fetch("/api/integrations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, enabled }),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["integrations"] }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/integrations?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to remove");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["integrations"] });
      toast.success("Connection removed");
    },
  });

  const handleAddIcs = () => {
    const url = icsUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      toast.error("Enter a valid http(s) ICS URL");
      return;
    }
    addMut.mutate({ provider: "ics", label: icsLabel.trim() || undefined, config: { url } });
    setIcsUrl("");
    setIcsLabel("");
  };

  const handleAddGh = () => {
    const username = ghUser.trim();
    if (!/^[a-z0-9-]{1,39}$/i.test(username)) {
      toast.error("Enter a valid GitHub username");
      return;
    }
    addMut.mutate({ provider: "github", label: ghLabel.trim() || undefined, config: { username } });
    setGhUser("");
    setGhLabel("");
  };

  return (
    <>
      <div>
        <h2 className="text-base font-semibold">Integrations</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Pull calendar events, GitHub activity, and Notion pages into your worklog as auto-entries you can edit, ignore, or promote.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* ICS */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" /> Calendar (.ics URL)
            </CardTitle>
            <CardDescription>
              Paste a public/private .ics subscription URL from Google, Outlook, Apple, Notion, etc. We pull the last 90 days each refresh.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="ics-url">ICS URL</Label>
              <Input id="ics-url" placeholder="https://calendar.google.com/calendar/ical/.../basic.ics" value={icsUrl} onChange={(e) => setIcsUrl(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ics-label">Label (optional)</Label>
              <Input id="ics-label" placeholder="Work calendar" value={icsLabel} onChange={(e) => setIcsLabel(e.target.value)} />
            </div>
            <Button onClick={handleAddIcs} disabled={addMut.isPending} className="w-full">
              <Plus className="w-4 h-4 mr-2" /> Add calendar
            </Button>
          </CardContent>
        </Card>

        {/* GitHub */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Github className="w-5 h-5" /> GitHub (public)
            </CardTitle>
            <CardDescription>
              Track your public commits, PRs, issues and releases — no token needed. Private repos require OAuth (coming later).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="gh-user">GitHub username</Label>
              <Input id="gh-user" placeholder="octocat" value={ghUser} onChange={(e) => setGhUser(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="gh-label">Label (optional)</Label>
              <Input id="gh-label" placeholder="Personal GitHub" value={ghLabel} onChange={(e) => setGhLabel(e.target.value)} />
            </div>
            <Button onClick={handleAddGh} disabled={addMut.isPending} className="w-full">
              <Plus className="w-4 h-4 mr-2" /> Add GitHub
            </Button>
          </CardContent>
        </Card>

        {/* Notion (Sprint 6A — OAuth connect only; import lands in 6B) */}
        {process.env.NEXT_PUBLIC_NOTION_OAUTH_ENABLED === "1" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <NotebookText className="w-5 h-5" /> Notion
              </CardTitle>
              <CardDescription>
                Connect a Notion workspace so you can import individual pages into your worklog. We only request read access — the
                workspace owner picks which pages we can see.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                You&rsquo;ll be redirected to Notion to authorize. Complete the connection in this same browser window.
              </p>
              <Button render={<a href="/api/integrations/notion/oauth/start" />} className="w-full">
                <Plus className="w-4 h-4 mr-2" /> Connect Notion
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Connected sources</CardTitle>
          <CardDescription>Sync runs on demand. Re-syncing the same source updates existing entries in place.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          ) : connections.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No connections yet. Add a calendar or GitHub username above to start auto-logging.
            </p>
          ) : (
            <div className="space-y-3">
              {connections.map((c) => {
                const isIcs = c.provider === "ics";
                const isNotion = c.provider === "notion";
                const Icon = isIcs ? Calendar : isNotion ? NotebookText : Github;
                const detail = isIcs
                  ? String((c.config as { url?: string }).url ?? "")
                  : isNotion
                  ? String((c.config as { workspaceName?: string }).workspaceName ?? "Notion workspace")
                  : `@${String((c.config as { username?: string }).username ?? "")}`;
                const statusOk = c.lastSyncStatus === "ok";
                return (
                  <div key={c.id} className="border rounded-lg p-4 flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <Icon className="w-5 h-5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <div className="font-medium flex items-center gap-2">
                          {c.label || (isIcs ? "Calendar" : isNotion ? "Notion" : "GitHub")}
                          <Badge variant="outline" className="text-xs uppercase">{c.provider}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{detail}</div>
                        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          {isNotion ? (
                            <span>Page import — coming in next release</span>
                          ) : c.lastSyncedAt ? (
                            <>
                              {statusOk ? (
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <AlertCircle className="w-3 h-3 text-amber-600" />
                              )}
                              <span>
                                Last sync {formatDistanceToNow(new Date(c.lastSyncedAt), { addSuffix: true })}
                                {statusOk ? ` · ${c.lastSyncCount} items` : ` · ${c.lastSyncStatus}`}
                              </span>
                            </>
                          ) : (
                            <span>Never synced</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex items-center gap-2 mr-2">
                        <Switch
                          checked={c.enabled}
                          onCheckedChange={(enabled) => toggleMut.mutate({ id: c.id, enabled })}
                        />
                        <span className="text-xs text-muted-foreground">{c.enabled ? "On" : "Off"}</span>
                      </div>
                      {!isNotion && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!c.enabled || (syncMut.isPending && syncMut.variables === c.id)}
                          onClick={() => syncMut.mutate(c.id)}
                        >
                          {syncMut.isPending && syncMut.variables === c.id ? (
                            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                          ) : (
                            <RefreshCw className="w-4 h-4 mr-1" />
                          )}
                          Sync now
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (confirm(`Remove this ${c.provider} connection? Logged entries will stay.`)) {
                            deleteMut.mutate(c.id);
                          }
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
