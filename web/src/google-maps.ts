const loads = new Map<string, Promise<void>>();

export function loadGoogleMaps(apiKey: string): Promise<void> {
  const google = (window as { google?: { maps?: unknown } }).google;
  if (google?.maps) return Promise.resolve();
  const existing = loads.get(apiKey);
  if (existing) return existing;
  const pending = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.dataset.profornaMaps = apiKey;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("maps-load-failed"));
    document.head.appendChild(script);
  });
  loads.set(apiKey, pending);
  pending.catch(() => loads.delete(apiKey));
  return pending;
}
