"use client";

import { Suspense, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { format } from "date-fns";
import {
  Mail,
  RefreshCw,
  Trash2,
  Search,
  ChevronDown,
  ChevronUp,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

// ─── types ─────────────────────────────────────────────────────

interface EmailAccount {
  id: string;
  provider: string;
  email: string;
  tokenExpiry: string | null;
  createdAt: string;
  _count: { emails: number };
}

interface EmailMsg {
  id: string;
  accountId: string;
  messageId: string;
  subject: string | null;
  sender: string;
  recipient: string | null;
  date: string;
  snippet: string | null;
  body: string | null;
  isRead: boolean;
  labels: string | null;
  account: { provider: string; email: string };
}

export default function EmailPage() {
  return (
    <Suspense fallback={<EmailFallback />}>
      <EmailContent />
    </Suspense>
  );
}

function EmailFallback() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}

function EmailContent() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const limit = 50;

  // Show toast on OAuth redirect
  useEffect(() => {
    const connected = searchParams.get("connected");
    const error = searchParams.get("error");
    if (connected) {
      toast.success(
        `${connected === "google" ? "Gmail" : "Outlook"} account connected!`
      );
    }
    if (error) {
      toast.error(`OAuth error: ${error}`);
    }
  }, [searchParams]);

  // ── accounts query ───────────────────────────────────────────

  const { data: accounts = [], isLoading: loadingAccounts } = useQuery<
    EmailAccount[]
  >({
    queryKey: ["email-accounts"],
    queryFn: () => fetch("/api/email-accounts").then((r) => r.json()),
  });

  const disconnectMut = useMutation({
    mutationFn: (id: string) =>
      fetch("/api/email-accounts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      toast.success("Account disconnected");
    },
  });

  // ── sync mutation ────────────────────────────────────────────

  const syncMut = useMutation({
    mutationFn: (accountId: string) =>
      fetch("/api/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      }).then((r) => r.json()),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      queryClient.invalidateQueries({ queryKey: ["email-accounts"] });
      toast.success(`Synced ${data.synced ?? 0} new emails`);
    },
    onError: () => toast.error("Sync failed"),
  });

  // ── emails query ─────────────────────────────────────────────

  const emailsQuery = useQuery<{
    emails: EmailMsg[];
    total: number;
    page: number;
    limit: number;
  }>({
    queryKey: ["emails", selectedAccountId, search, page],
    queryFn: () => {
      const params = new URLSearchParams();
      if (selectedAccountId) params.set("accountId", selectedAccountId);
      if (search) params.set("q", search);
      params.set("page", String(page));
      params.set("limit", String(limit));
      return fetch(`/api/emails?${params}`).then((r) => r.json());
    },
  });

  const emails = emailsQuery.data?.emails ?? [];
  const totalEmails = emailsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalEmails / limit));

  // ── provider label ───────────────────────────────────────────

  function providerLabel(provider: string) {
    return provider === "google" ? "Gmail" : "Outlook";
  }

  function providerColor(provider: string) {
    return provider === "google"
      ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
      : "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300";
  }

  // ─── render ──────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Email</h1>
          <p className="text-sm text-muted-foreground">
            Connect your accounts and view synced emails
          </p>
        </div>
      </div>

      {/* ── Connected Accounts ──────────────────────────────── */}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-lg">Connected Accounts</CardTitle>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                (window.location.href = "/api/auth/google")
              }
            >
              <Plus className="mr-1 h-4 w-4" />
              Gmail
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                (window.location.href = "/api/auth/microsoft")
              }
            >
              <Plus className="mr-1 h-4 w-4" />
              Outlook
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loadingAccounts ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No accounts connected. Click "Gmail" or "Outlook" above to get
              started.
            </p>
          ) : (
            <div className="space-y-2">
              {accounts.map((acct) => (
                <div
                  key={acct.id}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div className="flex items-center gap-3">
                    <Badge className={providerColor(acct.provider)}>
                      {providerLabel(acct.provider)}
                    </Badge>
                    <span className="text-sm font-medium">{acct.email}</span>
                    <span className="text-xs text-muted-foreground">
                      {acct._count.emails} emails
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={syncMut.isPending}
                      onClick={() => syncMut.mutate(acct.id)}
                    >
                      <RefreshCw
                        className={`mr-1 h-3.5 w-3.5 ${
                          syncMut.isPending ? "animate-spin" : ""
                        }`}
                      />
                      Sync
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => disconnectMut.mutate(acct.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Email Inbox ─────────────────────────────────────── */}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Inbox</CardTitle>
          <div className="flex flex-col gap-2 pt-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search emails..."
                className="pl-8"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={selectedAccountId === null ? "default" : "outline"}
                onClick={() => {
                  setSelectedAccountId(null);
                  setPage(1);
                }}
              >
                All
              </Button>
              {accounts.map((a) => (
                <Button
                  key={a.id}
                  size="sm"
                  variant={
                    selectedAccountId === a.id ? "default" : "outline"
                  }
                  onClick={() => {
                    setSelectedAccountId(a.id);
                    setPage(1);
                  }}
                >
                  {providerLabel(a.provider)}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {emailsQuery.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : emails.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Mail className="mb-2 h-10 w-10" />
              <p className="text-sm">
                {accounts.length === 0
                  ? "Connect an account to see emails"
                  : 'No emails yet. Click "Sync" on an account above.'}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {emails.map((em) => {
                const isExpanded = expandedId === em.id;
                return (
                  <div key={em.id}>
                    <button
                      onClick={() =>
                        setExpandedId(isExpanded ? null : em.id)
                      }
                      className={`flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-muted/50 ${
                        !em.isRead ? "font-semibold" : ""
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="secondary"
                            className={`shrink-0 text-[10px] ${providerColor(
                              em.account.provider
                            )}`}
                          >
                            {providerLabel(em.account.provider)}
                          </Badge>
                          <span className="truncate text-sm">
                            {em.sender}
                          </span>
                          <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                            {format(new Date(em.date), "MMM d, yyyy h:mm a")}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-sm">
                          {em.subject || "(no subject)"}
                        </p>
                        {!isExpanded && em.snippet && (
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {em.snippet}
                          </p>
                        )}
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                    </button>

                    {isExpanded && (
                      <div className="mb-2 ml-3 mr-3 rounded-md border bg-muted/30 p-4">
                        <div className="mb-2 space-y-1 text-xs text-muted-foreground">
                          <p>
                            <strong>From:</strong> {em.sender}
                          </p>
                          {em.recipient && (
                            <p>
                              <strong>To:</strong> {em.recipient}
                            </p>
                          )}
                          <p>
                            <strong>Date:</strong>{" "}
                            {format(
                              new Date(em.date),
                              "MMMM d, yyyy 'at' h:mm a"
                            )}
                          </p>
                          {em.labels && (
                            <p>
                              <strong>Labels:</strong> {em.labels}
                            </p>
                          )}
                        </div>
                        <Separator className="my-2" />
                        <div className="max-h-80 overflow-y-auto whitespace-pre-wrap text-sm">
                          {em.body || em.snippet || "(no content)"}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4">
                  <p className="text-xs text-muted-foreground">
                    Page {page} of {totalPages} ({totalEmails} emails)
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
