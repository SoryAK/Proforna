// Tiny .ics parser — supports VEVENT blocks with SUMMARY, DESCRIPTION, LOCATION,
// DTSTART, DTEND, UID. Handles RFC5545 line folding (continuations indented by space/tab).
// Intentionally minimal: no recurrence expansion, no timezone db. Recurring series surface
// as a single occurrence at DTSTART; users can edit the auto row if they want to refine.

export type IcsEvent = {
  uid: string;
  summary: string;
  description: string | null;
  location: string | null;
  start: Date;
  end: Date | null;
};

function unfold(raw: string): string[] {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

function unescape(value: string): string {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function parseDate(value: string): Date | null {
  // Forms:
  //   20260512T143000Z          (UTC)
  //   20260512T143000           (floating local)
  //   20260512                  (date-only, all-day)
  const v = value.trim();
  if (/^\d{8}$/.test(v)) {
    const y = +v.slice(0, 4);
    const m = +v.slice(4, 6) - 1;
    const d = +v.slice(6, 8);
    return new Date(Date.UTC(y, m, d));
  }
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (z === "Z") {
    return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
  }
  return new Date(+y, +mo - 1, +d, +h, +mi, +s);
}

export function parseIcs(raw: string): IcsEvent[] {
  const lines = unfold(raw);
  const events: IcsEvent[] = [];
  let cur: Partial<IcsEvent> | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line === "BEGIN:VEVENT") { cur = {}; continue; }
    if (line === "END:VEVENT") {
      if (cur && cur.uid && cur.start && cur.summary) {
        events.push({
          uid: cur.uid,
          summary: cur.summary,
          description: cur.description ?? null,
          location: cur.location ?? null,
          start: cur.start,
          end: cur.end ?? null,
        });
      }
      cur = null;
      continue;
    }
    if (!cur) continue;

    // Split off the property name (allowing parameters before the first ":").
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const head = line.slice(0, colon);
    const value = line.slice(colon + 1);
    const name = head.split(";")[0].toUpperCase();

    switch (name) {
      case "UID": cur.uid = value; break;
      case "SUMMARY": cur.summary = unescape(value); break;
      case "DESCRIPTION": cur.description = unescape(value); break;
      case "LOCATION": cur.location = unescape(value); break;
      case "DTSTART": { const d = parseDate(value); if (d) cur.start = d; break; }
      case "DTEND": { const d = parseDate(value); if (d) cur.end = d; break; }
      // STATUS:CANCELLED handled implicitly: we don't filter here, caller may.
    }
  }
  return events;
}
