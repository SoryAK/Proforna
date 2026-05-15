"use client";

/**
 * Stub for QuickLogDialog / QuickLogTrigger.
 *
 * The original implementation was lost (likely an OneDrive sync casualty —
 * file was referenced in committed sidebar.tsx / layout-shell.tsx but the
 * source was never committed to git and is no longer on disk). These stubs
 * preserve the call sites so the app builds; rebuild with real behavior
 * when ready.
 */

import type { ButtonHTMLAttributes } from "react";

export function QuickLogDialog() {
  return null;
}

export function QuickLogTrigger(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = "", children, ...rest } = props;
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-md border border-border bg-background hover:bg-muted transition-colors ${className}`}
      title="Quick log (stub)"
    >
      {children ?? "Quick Log"}
    </button>
  );
}
