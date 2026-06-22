"use client";

/**
 * Code block renderer for AI chat assistant messages.
 *
 * Shipped in ADR-0046 Phase D.1: copy button + Shiki-highlighted body +
 * language label. Domain actions (Send to Worklog / Add to Job Notes /
 * Save as Bullet) land in Phase D.3.
 *
 * Highlighter loading strategy: Shiki is dynamic-imported on first mount
 * so the chat panel's initial chunk stays light. The first code block in
 * a session pays a one-time ~280KB cost; subsequent blocks reuse the
 * cached singleton. While the highlighter loads, we render a plain
 * `<pre><code>` fallback styled to match the highlighted body so there
 * is no visible jump.
 */

import { Check, Copy } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";

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

export function AIChatCodeBlock({ code, language }: AIChatCodeBlockProps) {
  const { resolvedTheme } = useTheme();
  const [html, setHtml] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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

  return (
    <div className="group relative my-2 overflow-hidden rounded-md border bg-muted/40 text-xs">
      <div className="flex items-center justify-between border-b bg-muted/60 px-2 py-1">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {lang === "plaintext" ? "text" : lang}
        </span>
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
    </div>
  );
}
