const OWN_TAB_HOSTS = [
  "linkedin.com",
  "lnkd.in",
  "facebook.com",
  "fb.com",
  "instagram.com",
  "github.com",
  "x.com",
  "twitter.com",
  "t.co",
  "tiktok.com",
];

export function siteOpensInTab(url: string) {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return OWN_TAB_HOSTS.some((name) => host === name || host.endsWith(`.${name}`));
  } catch {
    return false;
  }
}

export async function sitePresentation(url: string): Promise<"window" | "card"> {
  try {
    const response = await fetch(`/api/sites/frame?url=${encodeURIComponent(url)}`);
    if (!response.ok) return "window";
    const body = (await response.json()) as { frameable?: boolean };
    return body.frameable === false ? "card" : "window";
  } catch {
    return "window";
  }
}
