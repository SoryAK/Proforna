const KEY = "proforna.previewPlacement";

export type PreviewPlacement = "ask" | "here" | "window";

export function readPreviewPlacement(): PreviewPlacement {
  try {
    const value = localStorage.getItem(KEY);
    if (value === "here" || value === "window") return value;
  } catch {
    /* ignore private mode */
  }
  return "ask";
}

export function writePreviewPlacement(value: PreviewPlacement) {
  try {
    if (value === "ask") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, value);
  } catch {
    /* ignore quota / private mode */
  }
}

export function isPreviewWindow(): boolean {
  return window.location.hash.replace(/^#\/?/, "").split("?")[0] === "preview";
}

export function previewWindowUrl(): string {
  const url = new URL(window.location.href);
  url.hash = "/preview";
  return url.toString();
}

export const PREVIEW_REFRESH = "proforna-work-map-preview";

export function notifyPreviewRefresh() {
  const channel = new BroadcastChannel(PREVIEW_REFRESH);
  channel.postMessage({ type: "refresh" });
  channel.close();
}
