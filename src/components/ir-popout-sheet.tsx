"use client";

/**
 * Stub for IrPopoutSheet.
 *
 * The original implementation was lost (likely an OneDrive sync casualty —
 * file was referenced in committed resume-immersive-map.tsx and job-map.tsx
 * but the source was never committed to git and is no longer on disk).
 * This stub renders a minimal slide-in side sheet so the app builds and the
 * call sites remain functional. Rebuild with the original styling when ready.
 */

import { X } from "lucide-react";
import type { ReactNode } from "react";

export interface IrPopoutSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: ReactNode;
  badge?: ReactNode;
  side?: "left" | "right";
  zIndexClassName?: string;
  maxWidthClassName?: string;
  bodyClassName?: string;
  children?: ReactNode;
}

export default function IrPopoutSheet({
  open,
  onClose,
  title,
  icon,
  badge,
  side = "right",
  zIndexClassName = "z-[1100]",
  maxWidthClassName = "max-w-sm",
  bodyClassName = "max-h-[70vh] overflow-y-auto px-3 py-3",
  children,
}: IrPopoutSheetProps) {
  if (!open) return null;
  const sideClass =
    side === "left"
      ? `left-0 border-r ${open ? "translate-x-0" : "-translate-x-full"}`
      : `right-0 border-l ${open ? "translate-x-0" : "translate-x-full"}`;
  return (
    <div
      className={`fixed top-1/2 -translate-y-1/2 ${sideClass} ${zIndexClassName} w-[92vw] ${maxWidthClassName} bg-background/95 backdrop-blur-md border-border rounded-lg shadow-2xl transition-transform duration-200`}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        {icon}
        <p className="text-sm font-semibold flex-1 truncate">{title}</p>
        {badge}
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded hover:bg-muted transition-colors"
          title="Close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className={bodyClassName}>{children}</div>
    </div>
  );
}
