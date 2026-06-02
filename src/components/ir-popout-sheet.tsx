"use client";

import { useEffect, useState } from "react";
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
  // Keep mounted for 250 ms after close so the exit animation can play.
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      // Defer so the browser paints the hidden state before animating in.
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    } else {
      setVisible(false);
      const t = setTimeout(() => setMounted(false), 250);
      return () => clearTimeout(t);
    }
  }, [open]);

  if (!mounted) return null;

  const isLeft = side === "left";
  const translateIn = "translate-x-0";
  const translateOut = isLeft ? "-translate-x-full" : "translate-x-full";
  const edgeClass = isLeft
    ? "left-0 rounded-r-xl border-r"
    : "right-0 rounded-l-xl border-l";

  return (
    <div
      className={[
        "fixed top-1/2 -translate-y-1/2",
        edgeClass,
        zIndexClassName,
        "w-[92vw]",
        maxWidthClassName,
        "bg-background/95 backdrop-blur-md border-border shadow-2xl",
        "transition-transform duration-200 ease-in-out",
        visible ? translateIn : translateOut,
      ].join(" ")}
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
