/**
 * useCanShare — true only on touch-pointer devices that support the
 * Web Share API. SSR-safe (returns false on first render, upgrades on
 * mount).
 *
 * Why `(pointer: coarse)` instead of UA sniffing or just
 * `navigator.share`:
 *   • `navigator.share` exists on desktop Chrome/Edge but routes through
 *     an awkward "Pick a device" QR flow that isn't worth surfacing.
 *   • `(pointer: coarse)` = touch as the primary input → iOS Safari,
 *     Android Chrome, iPadOS Safari — the device class where Web Share
 *     actually feels native. Excludes desktop Chrome even on touch
 *     monitors (primary pointer there is still the mouse).
 *   • No UA strings to maintain.
 *
 * Does not reactively re-evaluate on pointer-type change (rare in
 * practice; would require a `matchMedia.addEventListener("change")`
 * subscription that's not worth the bytes for this use case).
 */

"use client";

import { useEffect, useState } from "react";

export function useCanShare(): boolean {
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (typeof navigator === "undefined") return;
    if (typeof navigator.share !== "function") return;
    if (!window.matchMedia("(pointer: coarse)").matches) return;
    setCanShare(true);
  }, []);

  return canShare;
}
