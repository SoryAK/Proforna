"use client";

/**
 * Code block renderer for AI chat assistant messages.
 *
 * Shipped in ADR-0046 Phase D.1: copy button + Shiki-highlighted body +
 * language label. Phase D.3 adds the three domain actions:
 *
 *   - Send to Worklog   → in-page prepend into the active worklog editor
 *                          when registered (note kind only), else POST
 *                          /api/ai/actions/send-to-worklog to create one
 *   - Add to Job Notes  → POST /api/ai/actions/add-to-job-notes
 *   - Save as Bullet    → POST /api/ai/actions/save-as-bullet
 *
 * Target resolution follows the precedence rules in `ai-chat-action-target`:
 * page ambient > thread mentions back-to-front > picker. ADR-0046 follow-up
 * B taught `send-to-worklog` to first probe the editor-registry for a live
 * note-kind handle and call `handle.prepend(code)` instead of creating a
 * new WorkLog. The legacy create-new POST remains as the fallthrough when
 * no editor is mounted (dashboard, procedure kind, registry timeout).
 *
 * Highlighter loading strategy: Shiki is dynamic-imported on first mount
 * so the chat panel's initial chunk stays light. The first code block in
 * a session pays a one-time ~280KB cost; subsequent blocks reuse the
 * cached singleton. While the highlighter loads, we render a plain
 * `<pre><code>` fallback styled to match the highlighted body so there
 * is no visible jump.
 */

import {
  Check,
  Copy,
  ListPlus,
  Loader2,
  Send,
  StickyNote,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AIChatActionPicker } from "@/components/ai-chat-action-picker";
import { Button } from "@/components/ui/button";
import type {
  ActionType,
  AmbientEntityRef,
  PageContext,
  ThreadContext,
} from "@/lib/ai-chat-action-target";
import { resolveActionTarget } from "@/lib/ai-chat-action-target";
import { waitForEditor } from "@/lib/worklog/editor-registry";

/**
 * Common languages we expect to see in AI output. Keep this list short —
 * Shiki preloads every language listed here. Adding more languages is a
 * size trade-off, so only extend when a real use-case lands.
 */
const SUPPORTED_LANGS = [
  "ts",
  "tsx",
  "js",
  "jsx",
  "json",
  "bash",
  "shell",
  "md",
  "markdown",
  "python",
  "sql",
  "diff",
  "yaml",
  "html",
  "css",
] as const;

type ShikiHighlighter = {
  codeToHtml: (
    code: string,
    options: { lang: string; theme: string }
  ) => string;
};

/**
 * Build the toast message for a given action + outcome. Target label is
 * threaded in by the caller — for `send-to-worklog` that's either the
 * active-worklog label (ADR-0046 follow-up B in-page prepend path) or
 * undefined when the create-new fallthrough fired.
 */
function buildMessage(
  action: ActionType,
  ok: boolean,
  targetLabel?: string,
): string {
  if (ok) {
    switch (action) {
      case "send-to-worklog":
        return targetLabel ? `Sent to "${targetLabel}"` : "Sent to a new worklog";
      case "add-to-job-notes":
        return targetLabel ? `Added to ${targetLabel} notes` : "Added to job notes";
      case "save-as-bullet":
        return targetLabel ? `Saved as bullet on ${targetLabel}` : "Saved as bullet";
    }
  }
  switch (action) {
    case "send-to-worklog":
      return targetLabel
        ? `Failed to send to "${targetLabel}"`
        : "Failed to send to worklog";
    case "add-to-job-notes":
      return targetLabel
        ? `Failed to add to ${targetLabel} notes`
        : "Failed to add to job notes";
    case "save-as-bullet":
      return targetLabel
        ? `Failed to save as bullet on ${targetLabel}`
        : "Failed to save as bullet";
  }
}

/**
 * Map an HTTP status from one of the /api/ai/actions/* routes to a short
 * human-readable description. Used as the toast `description` field when
 * the server didn't return a usable `{ error }` JSON body.
 */
function statusFallbackMessage(status: number): string | null {
  if (status === 401) return "Sign-in expired";
  if (status === 404) return "Target not found";
  if (status >= 500) return "Server error \u2014 try again";
  return null;
}

// Module-singleton: every AIChatCodeBlock mount shares the same highlighter
// promise. First caller pays the ~280KB shiki cost; the rest get it free.
let highlighterPromise: Promise<ShikiHighlighter> | null = null;

async function getHighlighter(): Promise<ShikiHighlighter> {
  if (!highlighterPromise) {
    highlighterPromise = (async () => {
      const { createHighlighter } = await import("shiki");
      return createHighlighter({
        themes: ["github-dark", "github-light"],
        langs: SUPPORTED_LANGS as unknown as string[],
      });
    })();
  }
  return highlighterPromise;
}

export interface AIChatCodeBlockProps {
  /** Raw code text (no language fence). */
  code: string;
  /** Language tag from the fenced block; falls back to plaintext. */
  language?: string;
  /**
   * Optional action context. When BOTH `threadContext` and `pageContext`
   * are present, the three domain action buttons render alongside Copy.
   * Markdown rendered outside the chat panel (preview, history, etc.)
   * omits them and the toolbar collapses to just Copy.
   */
  threadContext?: ThreadContext;
  pageContext?: PageContext;
}

/**
 * Normalize the fenced-block language tag onto a Shiki-known language id.
 * Anything unknown falls through to `plaintext` so Shiki doesn't throw on
 * unrecognized langs like `mermaid` or `text`.
 */
function normalizeLanguage(raw: string | undefined): string {
  if (!raw) return "plaintext";
  const lower = raw.trim().toLowerCase();
  if (lower === "shell" || lower === "sh") return "bash";
  if (lower === "markdown") return "md";
  return (SUPPORTED_LANGS as readonly string[]).includes(lower)
    ? lower
    : "plaintext";
}

export function AIChatCodeBlock({
  code,
  language,
  threadContext,
  pageContext,
}: AIChatCodeBlockProps) {
  const { resolvedTheme } = useTheme();
  const [html, setHtml] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Per-action transient UI state. `pending` shows a spinner on the active
  // button. Success / failure are surfaced via sonner toasts (see
  // `buildMessage`) so the in-button feedback stays minimal.
  const [pendingAction, setPendingAction] = useState<ActionType | null>(null);

  // Picker state — when the resolver returns `needs-picker`, we stash the
  // entity type + the action that opened the picker so we can route the
  // resulting POST correctly once the user picks.
  const [pickerState, setPickerState] = useState<{
    entityType: "job" | "worklog";
    action: ActionType;
  } | null>(null);

  const actionsEnabled = Boolean(threadContext && pageContext);

  const lang = useMemo(() => normalizeLanguage(language), [language]);
  const theme = resolvedTheme === "dark" ? "github-dark" : "github-light";

  // Highlight on mount / when theme or lang changes. We swallow errors so a
  // bad highlight never crashes the message render — the plain pre fallback
  // covers it.
  useEffect(() => {
    let cancelled = false;
    getHighlighter()
      .then((hl) => {
        if (cancelled) return;
        try {
          const rendered = hl.codeToHtml(code, { lang, theme });
          setHtml(rendered);
        } catch {
          setHtml(null);
        }
      })
      .catch(() => {
        if (!cancelled) setHtml(null);
      });
    return () => {
      cancelled = true;
    };
  }, [code, lang, theme]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // navigator.clipboard can throw on permissions-denied; ignore silently.
    }
  };

  // Post the action payload to the matching route and surface success /
  // failure via sonner. `targetLabel` (when present) is interpolated into
  // the toast text so the user sees which entity was affected.
  const postAction = async (
    action: ActionType,
    body: { content: string; jobId?: string },
    targetLabel?: string,
  ) => {
    setPendingAction(action);
    try {
      const res = await fetch(`/api/ai/actions/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        // Try to extract a server-provided message. Routes use { error }
        // JSON envelopes on failure but we tolerate raw text too.
        let serverMsg: string | undefined;
        try {
          const parsed = (await res.json()) as { error?: string; message?: string };
          serverMsg = parsed?.error || parsed?.message;
        } catch {
          // Body wasn't JSON; the status-aware fallback covers it.
        }
        const description = serverMsg ?? statusFallbackMessage(res.status) ?? undefined;
        toast.error(buildMessage(action, false, targetLabel), { description });
        console.error(`[ai-chat] action ${action} failed`, res.status);
        return;
      }
      toast.success(buildMessage(action, true, targetLabel));
    } catch (err) {
      toast.error(buildMessage(action, false, targetLabel), {
        description: err instanceof Error ? err.message : "Network error",
      });
      console.error(`[ai-chat] action ${action} threw`, err);
    } finally {
      setPendingAction(null);
    }
  };

  const handleAction = async (action: ActionType) => {
    if (!threadContext || !pageContext) return;
    if (pendingAction) return;

    // ADR-0046 follow-up B — `send-to-worklog` now tries an in-page
    // prepend before falling back to the create-new server action.
    //
    // Order of operations:
    //   1. If pageContext.activeWorklog is present (ambient or URL-derived),
    //      wait up to 500ms for an editor handle to appear in the registry.
    //   2. If a note-kind handle resolves, call handle.prepend(code) — that
    //      inserts at the top and flushes a save tagged with
    //      versionSource: "ai-prepend" so WorkLogVersion.source is
    //      populated. Toast on success; fall through on throw.
    //   3. Otherwise (no active worklog, timeout, procedure kind, or
    //      handle.prepend threw) fall through to the legacy POST that
    //      creates a brand-new WorkLog. Toast wording is reused.
    if (action === "send-to-worklog") {
      const activeId = pageContext.activeWorklog?.id ?? null;
      const activeLabel = pageContext.activeWorklog?.label ?? null;
      if (activeId) {
        setPendingAction(action);
        try {
          const handle = await waitForEditor(activeId);
          if (handle && handle.kind === "note") {
            await handle.prepend(code);
            toast.success(buildMessage(action, true, activeLabel ?? undefined));
            return;
          }
        } catch (err) {
          // Don't surface twice — log and fall through to create-new.
          console.error("[ai-chat] in-page prepend failed", err);
        } finally {
          setPendingAction(null);
        }
      }
      await postAction(action, { content: code });
      return;
    }

    const resolution = resolveActionTarget(
      action,
      threadContext,
      pageContext,
    );
    if (resolution.kind === "resolved") {
      await postAction(
        action,
        { content: code, jobId: resolution.target.id },
        resolution.target.label,
      );
    } else {
      setPickerState({ entityType: resolution.entityType, action });
    }
  };

  // Picker confirm — `entityType` is "job" in v1 (worklog actions never
  // open the picker because send-to-worklog always creates new).
  const handlePicked = async (picked: AmbientEntityRef) => {
    const action = pickerState?.action;
    setPickerState(null);
    if (!action) return;
    await postAction(
      action,
      { content: code, jobId: picked.id },
      picked.label,
    );
  };

  return (
    <div className="group relative my-2 overflow-hidden rounded-md border bg-muted/40 text-xs">
      <div className="flex items-center justify-between gap-2 border-b bg-muted/60 px-2 py-1">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {lang === "plaintext" ? "text" : lang}
        </span>
        <div className="flex items-center gap-0.5">
          {actionsEnabled ? (
            <>
              <ActionButton
                action="send-to-worklog"
                icon={Send}
                label="Worklog"
                tooltip="Send to a new worklog"
                pending={pendingAction === "send-to-worklog"}
                disabled={pendingAction !== null}
                onClick={() => handleAction("send-to-worklog")}
              />
              <ActionButton
                action="add-to-job-notes"
                icon={StickyNote}
                label="Notes"
                tooltip="Add to job notes"
                pending={pendingAction === "add-to-job-notes"}
                disabled={pendingAction !== null}
                onClick={() => handleAction("add-to-job-notes")}
              />
              <ActionButton
                action="save-as-bullet"
                icon={ListPlus}
                label="Bullet"
                tooltip="Save as resume bullet"
                pending={pendingAction === "save-as-bullet"}
                disabled={pendingAction !== null}
                onClick={() => handleAction("save-as-bullet")}
              />
              <div className="mx-0.5 h-4 w-px bg-border" aria-hidden />
            </>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-2 text-[10px]"
            onClick={handleCopy}
            aria-label={copied ? "Copied" : "Copy code"}
          >
            {copied ? (
              <>
                <Check className="h-3 w-3" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                Copy
              </>
            )}
          </Button>
        </div>
      </div>
      {html ? (
        <div
          // Shiki's output is a static <pre><code> tree we control via the
          // highlighter input — safe to dangerously render.
          className="shiki-host overflow-x-auto"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className="overflow-x-auto px-3 py-2 font-mono text-[11px] leading-relaxed">
          <code>{code}</code>
        </pre>
      )}
      {pickerState ? (
        <AIChatActionPicker
          open
          entityType={pickerState.entityType}
          onPick={handlePicked}
          onCancel={() => setPickerState(null)}
        />
      ) : null}
    </div>
  );
}

// ── Action button helper ─────────────────────────────────────────────────

interface ActionButtonProps {
  action: ActionType;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  tooltip: string;
  pending: boolean;
  disabled: boolean;
  onClick: () => void;
}

function ActionButton({
  icon: Icon,
  label,
  tooltip,
  pending,
  disabled,
  onClick,
}: ActionButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-6 gap-1 px-2 text-[10px]"
      onClick={onClick}
      disabled={disabled}
      aria-label={tooltip}
      title={tooltip}
    >
      {pending ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Icon className="h-3 w-3" />
      )}
      <span className="hidden sm:inline">{label}</span>
    </Button>
  );
}
