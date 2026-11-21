import type { MiddlewareHandler } from "hono";

/**
 * Proforna runs on the occupant's own machine. Requests must name this machine
 * or a private home-network address, both in Host and (when a browser sends it)
 * in Origin. This turns away pages on other sites and DNS-rebinding tricks,
 * while a phone or tablet on the same Wi-Fi opening the app by IP still works.
 *
 * PROFORNA_ALLOWED_HOSTS adds names, comma separated (for example `laptop.local`).
 */
export function localGuard(
  extraHosts: string[] = readExtraHosts(),
): MiddlewareHandler {
  const extra = new Set(extraHosts.map((h) => h.toLowerCase()));
  const allowed = (hostname: string) =>
    extra.has(hostname) || isLocalHostname(hostname);

  return async (c, next) => {
    const host = hostnameOf(c.req.header("host")) ?? new URL(c.req.url).hostname;
    if (!allowed(host.toLowerCase())) {
      return c.json({ error: "This address is not allowed." }, 403);
    }
    const origin = c.req.header("origin");
    if (origin !== undefined) {
      let originHost: string | null = null;
      try {
        originHost = new URL(origin).hostname.toLowerCase();
      } catch {
        originHost = null;
      }
      if (!originHost || !allowed(stripBrackets(originHost))) {
        return c.json({ error: "Requests from other sites are not allowed." }, 403);
      }
    }
    await next();
  };
}

function readExtraHosts(): string[] {
  return (process.env.PROFORNA_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
}

function hostnameOf(hostHeader: string | undefined): string | null {
  if (!hostHeader) return null;
  try {
    return stripBrackets(new URL(`http://${hostHeader}`).hostname);
  } catch {
    return "";
  }
}

function stripBrackets(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
}

export function isLocalHostname(hostname: string): boolean {
  const h = stripBrackets(hostname.toLowerCase());
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "::1") return true;
  // IPv6 unique-local (fc00::/7) and link-local (fe80::/10).
  if (/^f[cd][0-9a-f]{2}:/.test(h) || /^fe[89ab][0-9a-f]:/.test(h)) return true;
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!v4) return false;
  const [a, b] = [Number(v4[1]), Number(v4[2])];
  if (v4.slice(1).some((part) => Number(part) > 255)) return false;
  return (
    a === 127 ||
    a === 10 ||
    (a === 192 && b === 168) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 169 && b === 254)
  );
}
