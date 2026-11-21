import type { ChangeOperation } from "./governance";
import type { WorkMapPublishSection, WorkMapSnapshot } from "./work-map";

/**
 * Access to the published page, one person at a time: which parts of the page
 * their link opens, for how long, and the Activity kept on it.
 */

export const ACCESS_SECTION_LABEL: Record<WorkMapPublishSection, string> = {
  profile: "Profile",
  history: "Career history",
  map: "Map",
  milestones: "Milestones",
  media: "Media",
  evidence: "Evidence",
  skills: "Skills",
  contact: "Contact",
};

/** How long a link lasts. `null` keeps it until the occupant revokes it. */
export const ACCESS_LENGTHS = [7, 30, 90, null] as const;
export type AccessLength = (typeof ACCESS_LENGTHS)[number];
export const ACCESS_DEFAULT_DAYS = 30;
export const ACCESS_MESSAGE_MAX = 2000;
/** Links ending within this many days are flagged as ending soon. */
export const ACCESS_SOON_DAYS = 7;

/**
 * "Until I revoke it" is stored as a far-future expiry, because both stores
 * require one; it is never shown as a date.
 */
export const ACCESS_NO_END = "9999-12-31T23:59:59.999Z";

export function accessExpiry(days: AccessLength, now: Date): string {
  return days === null ? ACCESS_NO_END : new Date(now.getTime() + days * 86_400_000).toISOString();
}

export function isOpenEnded(expiresAt: string): boolean {
  return expiresAt >= ACCESS_NO_END;
}

export type AccessState = "active" | "ending" | "expired" | "revoked";

export function accessState(
  grant: { expiresAt: string; revokedAt: string | null },
  now: Date,
): AccessState {
  if (grant.revokedAt) return "revoked";
  const at = now.toISOString();
  if (grant.expiresAt <= at) return "expired";
  if (isOpenEnded(grant.expiresAt)) return "active";
  return new Date(grant.expiresAt).getTime() - now.getTime() <= ACCESS_SOON_DAYS * 86_400_000
    ? "ending"
    : "active";
}

/** The sections a link opens: its own choice, kept within what the page publishes. */
export function effectiveSections(
  chosen: readonly WorkMapPublishSection[] | null,
  page: readonly WorkMapPublishSection[],
): WorkMapPublishSection[] {
  return chosen ? page.filter((section) => chosen.includes(section)) : [...page];
}

export type AccessChange = {
  /** `null` opens everything the page publishes, now and after later publishes. */
  sections: WorkMapPublishSection[] | null;
  days: AccessLength;
  message: string;
};

export type AccessChangeError = "sections-required" | "sections-invalid" | "length-invalid" | "message-too-long";

/** Reads what the occupant chose for someone's link. */
export function prepareAccessChange(
  input: unknown,
  page: readonly WorkMapPublishSection[],
): { ok: true; value: AccessChange } | { ok: false; error: AccessChangeError } {
  const record = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  let sections: WorkMapPublishSection[] | null = null;
  if (record.sections !== undefined && record.sections !== null) {
    if (!Array.isArray(record.sections)) return { ok: false, error: "sections-invalid" };
    const chosen = [...new Set(record.sections.map(String))];
    if (chosen.some((section) => !page.includes(section as WorkMapPublishSection))) {
      return { ok: false, error: "sections-invalid" };
    }
    if (chosen.length === 0) return { ok: false, error: "sections-required" };
    // Choosing every section the page has means the whole page.
    sections = chosen.length === page.length ? null : (chosen as WorkMapPublishSection[]);
  }
  const rawDays = record.days === undefined ? ACCESS_DEFAULT_DAYS : record.days;
  const days = rawDays === null ? null : Number(rawDays);
  if (!ACCESS_LENGTHS.includes(days as AccessLength)) return { ok: false, error: "length-invalid" };
  const message = typeof record.message === "string" ? record.message.trim() : "";
  if (message.length > ACCESS_MESSAGE_MAX) return { ok: false, error: "message-too-long" };
  return { ok: true, value: { sections, days: days as AccessLength, message } };
}

/** The page as one link sees it: the sections it doesn't open are emptied. */
export function limitProjection<T extends WorkMapSnapshot | Omit<WorkMapSnapshot, "occupantId">>(
  projection: T,
  sections: readonly WorkMapPublishSection[] | null,
): T {
  if (!sections) return projection;
  const open = new Set(effectiveSections(sections, projection.sections));
  return {
    ...projection,
    sections: projection.sections.filter((section) => open.has(section)),
    profile: open.has("profile")
      ? projection.profile
      : {
          ...projection.profile,
          headline: "",
          bio: "",
          city: "",
          links: { linkedin: "", github: "", portfolio: "" },
        },
    roles: open.has("history")
      ? projection.roles.map((role) => ({
          ...role,
          locations: open.has("map") ? role.locations : [],
          media: open.has("media") ? role.media : [],
          linkedEvidence: open.has("evidence") ? role.linkedEvidence : [],
          milestones: open.has("milestones") ? role.milestones : [],
          events: open.has("milestones") ? role.events : [],
        }))
      : [],
    skills: open.has("skills") ? projection.skills : [],
  };
}

export type AccessActivityKind =
  | "asked"
  | "approved"
  | "declined"
  | "shared"
  | "changed"
  | "revoked"
  | "restored"
  | "opened"
  | "drafted";

export type AccessActivity = {
  id: string;
  kind: AccessActivityKind;
  /** What the link opened and until when, at the time. */
  sections: WorkMapPublishSection[] | null;
  expiresAt: string | null;
  message: string;
  occurredAt: string;
};

function sectionList(sections: readonly WorkMapPublishSection[] | null): string {
  return sections ? sections.map((section) => ACCESS_SECTION_LABEL[section]).join(", ") : "Whole page";
}

function until(expiresAt: string | null): string {
  if (!expiresAt) return "";
  if (isOpenEnded(expiresAt)) return "until you revoke it";
  return `until ${new Date(expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

/** One line for an Activity entry, from the person's side of it. */
export function describeActivity(entry: AccessActivity, firstName: string): string {
  const scope = [sectionList(entry.sections), until(entry.expiresAt)].filter(Boolean).join(" · ");
  switch (entry.kind) {
    case "asked":
      return `${firstName} asked to see your page`;
    case "approved":
      return `You approved · ${scope}`;
    case "declined":
      return "You declined";
    case "shared":
      return `You shared your page · ${scope}`;
    case "changed":
      return `You changed access · ${scope}`;
    case "revoked":
      return "You revoked access";
    case "restored":
      return `You gave access again · ${scope}`;
    case "opened":
      return `${firstName} opened the page`;
    case "drafted":
      return "Reply drafted in Gmail";
  }
}

export function isOpenActivity(entry: Pick<AccessActivity, "kind">): boolean {
  return entry.kind === "opened";
}

/** The email that carries someone's link, for a Gmail draft the occupant sends. */
export function accessEmailDraft(input: {
  fromName: string;
  toName: string;
  link: string;
  sections: readonly WorkMapPublishSection[] | null;
  expiresAt: string;
  message: string;
}): { subject: string; body: string } {
  const first = input.toName.trim().split(/\s+/)[0] || "there";
  const scope = input.sections ? ` It shows ${sectionList(input.sections).toLowerCase()}.` : "";
  const ends = isOpenEnded(input.expiresAt)
    ? ""
    : ` The link works ${until(input.expiresAt)}.`;
  return {
    subject: `${input.fromName} shared their career page with you`,
    body: [
      `Hi ${first},`,
      "",
      ...(input.message ? [input.message, ""] : []),
      `Here is a private link to my career page:${scope}${ends}`,
      "",
      input.link,
      "",
      input.fromName,
    ].join("\n"),
  };
}

export function planAccessChange(input: {
  grantId: string;
  slug: string;
  sections: WorkMapPublishSection[] | null;
  expiresAt: string;
}): ChangeOperation {
  return {
    action: "supersede",
    entityType: "projection-access-grant",
    entityId: input.grantId,
    values: { slug: input.slug, sections: input.sections, expiresAt: input.expiresAt },
  };
}

export function planAccessRemove(input: { grantId: string; slug: string }): ChangeOperation {
  return {
    action: "remove",
    entityType: "projection-access-grant",
    entityId: input.grantId,
    values: { slug: input.slug },
  };
}
