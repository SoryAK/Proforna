export const LINKED_PAGE_TEXT_LIMIT = 100_000;

export type LinkedPage = {
  title: string;
  meta: Record<string, string>;
  text: string;
};

export function readLinkedPage(html: string): LinkedPage {
  const title = decodeEntities(
    /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "",
  )
    .replace(/\s+/g, " ")
    .trim();
  const meta: Record<string, string> = {};
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attributes = readAttributes(tag);
    const key = (attributes.property ?? attributes.name ?? "").toLowerCase();
    const content = attributes.content;
    if (!key || content === undefined || key in meta) continue;
    meta[key] = decodeEntities(content).trim();
  }
  const text = decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<head\b[\s\S]*?<\/head>/gi, " ")
      .replace(/<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, LINKED_PAGE_TEXT_LIMIT);
  return { title, meta, text };
}

function readAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  for (const match of tag.matchAll(pattern)) {
    attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return attributes;
}

function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, body: string) => {
    if (body[0] === "#") {
      const code =
        body[1] === "x" || body[1] === "X"
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : entity;
    }
    return named[body.toLowerCase()] ?? entity;
  });
}

export function isPublicAddress(address: string): boolean {
  const v4 = parseIpv4(address);
  if (v4) return isPublicIpv4(v4);
  const v6 = parseIpv6(address);
  if (!v6) return false;
  if (v6.every((group) => group === 0)) return false;
  if (v6.slice(0, 7).every((group) => group === 0) && v6[7] === 1) return false;
  if (v6.slice(0, 5).every((group) => group === 0) && v6[5] === 0xffff) {
    return isPublicIpv4(embeddedIpv4(v6));
  }
  if (v6[0] === 0x64 && v6[1] === 0xff9b && v6.slice(2, 6).every((g) => g === 0)) {
    return isPublicIpv4(embeddedIpv4(v6));
  }
  if ((v6[0] & 0xfe00) === 0xfc00) return false;
  if ((v6[0] & 0xffc0) === 0xfe80) return false;
  if ((v6[0] & 0xff00) === 0xff00) return false;
  if (v6[0] === 0x2001 && v6[1] === 0x0db8) return false;
  return true;
}

function isPublicIpv4([a, b, c]: number[]): boolean {
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

function embeddedIpv4(groups: number[]): number[] {
  return [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff];
}

function parseIpv4(value: string): number[] | null {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)) return null;
  const parts = value.split(".").map(Number);
  return parts.every((part) => part <= 255) ? parts : null;
}

function parseIpv6(value: string): number[] | null {
  let address = value.replace(/^\[|\]$/g, "").split("%")[0] ?? "";
  if (!address.includes(":")) return null;
  const tail = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(address);
  if (tail) {
    const v4 = parseIpv4(tail[1]);
    if (!v4) return null;
    address = `${address.slice(0, -tail[1].length)}${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
  }
  const halves = address.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...rest];
  if (!groups.every((group) => /^[0-9a-f]{1,4}$/i.test(group))) return null;
  return groups.map((group) => Number.parseInt(group, 16));
}
