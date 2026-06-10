/**
 * Web Share API capability predicate (Grill Me share onramp, ADR-0022 addendum).
 *
 * `canShareFiles()` returns true only when the current browser supports
 * `navigator.share({ files })`. It guards the "Share to…" menu item so we
 * can fall back gracefully on browsers without Web Share Level 2 (Firefox
 * desktop, older Edge/Safari, any non-secure context, SSR).
 *
 * Implementation notes:
 *  - SSR-safe: `typeof navigator` check before any property access.
 *  - Probes `navigator.canShare({ files: [<empty File>] })` because
 *    Firefox 132+ exposes `navigator.share` for text/url payloads but
 *    `canShare({ files })` returns false there.
 *  - `canShare()` can throw on permission failures (e.g. inside an
 *    insecure iframe). Treat any throw as "not supported" — never let the
 *    predicate itself bubble.
 *
 * Pure module, no React dependencies. Tested via mocked `globalThis.navigator`.
 */

export function canShareFiles(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & {
    share?: (data: ShareData) => Promise<void>;
    canShare?: (data: ShareData) => boolean;
  };
  if (typeof nav.share !== "function") return false;
  if (typeof nav.canShare !== "function") return false;
  try {
    // An empty placeholder File is enough — we only need canShare to tell
    // us whether file payloads are supported in principle.
    const probe = new File([""], "probe.md", { type: "text/markdown" });
    return nav.canShare({ files: [probe] });
  } catch {
    return false;
  }
}
