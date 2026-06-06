"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * Wrap a page in <FullBleedShell> when its content should run edge-to-edge —
 * past LayoutShell's default `mx-auto p-4 sm:p-6` wrapper. Toggles
 * `data-fullbleed=""` on the closest <main> ancestor; globals.css strips the
 * inner padded div's spacing while the attribute is present.
 *
 * The shell renders a `h-full` container so children can use `h-full` /
 * `flex-1 min-h-0` confidently (replaces ad-hoc `h-[calc(100vh-4rem)]` math).
 */
export function FullBleedShell({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const main = el.closest("main");
    if (!main) return;
    main.setAttribute("data-fullbleed", "");
    return () => {
      main.removeAttribute("data-fullbleed");
    };
  }, []);

  return (
    <div ref={ref} className="h-full">
      {children}
    </div>
  );
}
