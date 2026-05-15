"use client";

import { createPortal } from "react-dom";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

type IrAnchoredPopoverProps = {
  open: boolean;
  x: number;
  y: number;
  onClose: () => void;
  canClose?: boolean;
  children: ReactNode;
  panelClassName?: string;
  panelStyle?: CSSProperties;
  backdropZIndex?: number;
  panelZIndex?: number;
};

export default function IrAnchoredPopover({
  open,
  x,
  y,
  onClose,
  canClose = true,
  children,
  panelClassName,
  panelStyle,
  backdropZIndex = 10000,
  panelZIndex = 10001,
}: IrAnchoredPopoverProps) {
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <>
      <div
        onClick={() => {
          if (canClose) onClose();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          if (canClose) onClose();
        }}
        style={{ position: "fixed", inset: 0, zIndex: backdropZIndex, background: "transparent" }}
      />
      <div
        className={cn("fixed", panelClassName)}
        style={{ left: x, top: y, zIndex: panelZIndex, ...panelStyle }}
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}
