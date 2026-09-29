import type { ApplicationStage, OpportunityKind } from "./career-management";

/** Providers Proforna can connect. Gmail is the first; add another id here later. */
export const MAILBOX_PROVIDERS = ["gmail"] as const;

export type MailboxProviderId = (typeof MAILBOX_PROVIDERS)[number];

/**
 * Gmail search that narrows a scan. Classification in `planJobMail` still
 * decides what is job mail.
 */
export const JOB_MAIL_SEARCH =
  'newer_than:2y ("thank you for applying" OR "thanks for applying" OR "application received" OR "your application" OR interview OR "phone screen" OR onsite OR "on-site" OR recruiter OR "came across your" OR "offer letter" OR "job offer" OR "pleased to offer" OR "excited to offer")';

export type MailboxConnectionError = "provider-unsupported" | "label-required";

export type InboundMail = {
  providerMessageId: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  body: string;
  receivedAt: string;
};

export type JobMailCategory =
  | "application"
  | "interview"
  | "recruiter-outreach"
  | "offer";

export type JobMailPlan = {
  category: JobMailCategory;
  providerMessageId: string;
  contact: {
    name: string;
    email: string;
    organization: string;
    role: string;
    notes: string;
  } | null;
  messageBody: string;
  opportunity: {
    kind: OpportunityKind;
    title: string;
    organization: string;
    sourceUrl: string;
    location: string;
    fitSummary: string;
  };
  application: {
    stage: ApplicationStage;
    nextStep: string;
  } | null;
  interview: { kind: string; scheduledAt: string; notes: string } | null;
  offer: { summary: string; decisionDueAt: string | null } | null;
};

const OFFER =
  /\b(offer letter|job offer|offer of employment|extend(?:ing)? an offer|pleased to offer|excited to offer|formal offer)\b/i;
const INTERVIEW_STRONG =
  /\b(interview invitation|interview confirmation|your interview|phone screen|technical screen|on-?site interview|schedule(?:d)? (?:an |your )?interview|invite you to interview|like to interview|interview you for)\b/i;
const APPLICATION =
  /\b(thank you for applying|thanks for applying|application received|we received your application|your application (?:to|for|has been)|application for the)\b/i;
const INTERVIEW = /\binterviews?\b|\bphone screen\b|\bonsite\b|\bon-site\b/i;
const OUTREACH =
  /\b(recruiter|talent acquisition|came across your|open role|would you be interested|reaching out about|job opportunity|opportunity at)\b/i;

const SUBJECT_LEAD =
  /^(?:thank you for applying(?: to)?|thanks for applying(?: to)?|application received:?|your application (?:to|for)|interview invitation:?|interview confirmation:?|interview:?|phone screen:?|offer:?|offer letter:?|job offer:?|we(?:'re| are) (?:pleased|excited) to (?:extend an )?offer you(?: the)?|pleased to offer you(?: the)?|came across your (?:profile|background)(?:\s+[—–-]\s*|\s+for\s+)?)\s*/i;

export function prepareMailboxConnection(input: {
  provider: unknown;
  label: unknown;
}):
  | { ok: true; value: { provider: MailboxProviderId; label: string } }
  | { ok: false; error: MailboxConnectionError } {
  if (
    typeof input.provider !== "string" ||
    !MAILBOX_PROVIDERS.includes(input.provider as MailboxProviderId)
  ) {
    return { ok: false, error: "provider-unsupported" };
  }
  const label = typeof input.label === "string" ? input.label.trim() : "";
  if (!label) return { ok: false, error: "label-required" };
  return {
    ok: true,
    value: { provider: input.provider as MailboxProviderId, label: label.slice(0, 120) },
  };
}

export function parseMailFrom(value: string): { name: string; email: string } {
  const trimmed = value.replace(/\s+/g, " ").trim();
  const angled = trimmed.match(/^(.*?)<\s*([^<>\s]+@[^<>\s]+)\s*>$/);
  if (angled) {
    const email = angled[2].trim();
    const name = angled[1].replace(/"/g, "").trim().replace(/,$/, "").trim();
    return { name: name || email, email };
  }
  if (/^[^\s@]+@[^\s@]+$/.test(trimmed)) return { name: trimmed, email: trimmed };
  return { name: trimmed, email: "" };
}

export function pursuitsMatch(
  left: { kind: string; title: string; organization: string },
  right: { kind: string; title: string; organization: string },
): boolean {
  return (
    normalize(left.kind) === normalize(right.kind) &&
    normalize(left.title) === normalize(right.title) &&
    normalize(left.organization) === normalize(right.organization)
  );
}

export function scheduledAtFromMail(
  text: string,
  receivedAt: string,
): string {
  const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/);
  if (iso) {
    const time = iso[2] ?? "15:00";
    const date = new Date(`${iso[1]}T${time}:00Z`);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  const named = text.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:,?\s+(20\d{2}))?/i,
  );
  if (named) {
    const month = monthIndex(named[1]);
    const day = Number(named[2]);
    const year = named[3] ? Number(named[3]) : yearFrom(receivedAt);
    const date = new Date(Date.UTC(year, month, day, 15, 0, 0));
    if (!Number.isNaN(date.getTime()) && date.getUTCDate() === day) {
      return date.toISOString();
    }
  }
  return receivedAt;
}

export function planJobMail(mail: InboundMail): JobMailPlan | null {
  const providerMessageId = mail.providerMessageId.trim();
  if (!providerMessageId) return null;
  const subject = mail.subject.replace(/\s+/g, " ").trim();
  const body = mail.body.trim();
  const text = `${subject}\n${body}`;
  const category = classify(text);
  if (!category) return null;
  const receivedAt = mail.receivedAt.trim();
  const role = roleFromSubject(subject);
  const fromEmail = mail.fromEmail.trim();
  const fromName = mail.fromName.trim() || fromEmail;
  const organization =
    role?.organization ||
    organizationFromEmail(fromEmail) ||
    fromName ||
    "Unknown organization";
  const roleTitle = role?.title || subject || categoryLabel(category);
  const fitSummary = clipLine(
    body ? `${subject}. ${body}` : subject || categoryLabel(category),
    280,
  );
  const sourceUrl = `https://mail.google.com/mail/#all/${encodeURIComponent(providerMessageId)}`;
  const contact = fromEmail
    ? {
        name: fromName || fromEmail,
        email: fromEmail,
        organization,
        role: category === "recruiter-outreach" ? "Recruiter" : "",
        notes: clipLine(subject, 240),
      }
    : null;
  const messageBody = clipRaw(body ? `${subject}\n\n${body}` : subject, 4000);
  if (category === "recruiter-outreach") {
    const title = role
      ? `${contact?.name || "Someone"} reached out about ${role.title}`
      : roleTitle;
    return {
      category,
      providerMessageId,
      contact,
      messageBody,
      opportunity: {
        kind: "connection",
        title: clipLine(title, 180),
        organization,
        sourceUrl,
        location: "",
        fitSummary,
      },
      application: null,
      interview: null,
      offer: null,
    };
  }
  const application = applicationFor(category);
  const when = scheduledAtFromMail(text, receivedAt);
  return {
    category,
    providerMessageId,
    contact,
    messageBody,
    opportunity: {
      kind: "role",
      title: clipLine(roleTitle, 180),
      organization: clipLine(organization, 180),
      sourceUrl,
      location: "",
      fitSummary,
    },
    application,
    interview:
      category === "interview"
        ? {
            kind: interviewKind(text),
            scheduledAt: when || receivedAt,
            notes: clipLine(subject, 240),
          }
        : null,
    offer:
      category === "offer"
        ? {
            summary: clipRaw(body ? `${subject}. ${body}` : subject, 500),
            decisionDueAt: decisionDue(text, receivedAt),
          }
        : null,
  };
}

function classify(text: string): JobMailCategory | null {
  if (OFFER.test(text)) return "offer";
  if (INTERVIEW_STRONG.test(text)) return "interview";
  if (APPLICATION.test(text)) return "application";
  if (INTERVIEW.test(text)) return "interview";
  if (OUTREACH.test(text)) return "recruiter-outreach";
  return null;
}

function applicationFor(category: JobMailCategory): JobMailPlan["application"] {
  if (category === "application") {
    return { stage: "submitted", nextStep: "Confirm this application" };
  }
  if (category === "interview") {
    return { stage: "interview", nextStep: "Prepare for the interview" };
  }
  if (category === "offer") {
    return { stage: "offer", nextStep: "Review the offer" };
  }
  return null;
}

function roleFromSubject(
  subject: string,
): { title: string; organization: string } | null {
  let text = subject.replace(/^(?:re|fw|fwd)\s*:\s*/i, "").trim();
  text = text.replace(SUBJECT_LEAD, "").trim();
  text = text.replace(/\s+role(?=\s+(?:at|@)\s+)/i, "");
  const at = text.match(/^(.+?)\s+(?:at|@)\s+(.+)$/);
  if (!at) return null;
  const title = at[1].replace(/[.,;:]+$/, "").trim();
  const organization = at[2].replace(/[.,;:]+$/, "").trim();
  if (title.length < 2 || organization.length < 2) return null;
  if (title.length > 180 || organization.length > 180) return null;
  return { title, organization };
}

function organizationFromEmail(email: string): string {
  const domain = email.split("@")[1]?.trim().toLowerCase() ?? "";
  if (!domain) return "";
  const skipped = new Set([
    "mail",
    "email",
    "careers",
    "jobs",
    "recruiting",
    "hire",
    "talent",
  ]);
  const personal = new Set([
    "gmail",
    "googlemail",
    "yahoo",
    "outlook",
    "hotmail",
    "icloud",
    "me",
    "live",
  ]);
  const labels = domain.split(".").filter((label) => label && !skipped.has(label));
  const name = labels[0] ?? "";
  if (!name || personal.has(name)) return "";
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function interviewKind(text: string): string {
  if (/phone screen/i.test(text)) return "phone screen";
  if (/on-?site/i.test(text)) return "onsite";
  return "interview";
}

function decisionDue(text: string, receivedAt: string): string | null {
  const due = text.match(
    /\b(?:respond by|reply by|decision due(?: by)?|due by)\s+((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:,?\s+20\d{2})?|20\d{2}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2})?)/i,
  );
  if (!due) return null;
  return scheduledAtFromMail(due[1], receivedAt);
}

function categoryLabel(category: JobMailCategory): string {
  if (category === "recruiter-outreach") return "Recruiter outreach";
  if (category === "application") return "Application";
  if (category === "interview") return "Interview";
  return "Offer";
}

function yearFrom(receivedAt: string): number {
  const year = Number(receivedAt.slice(0, 4));
  return Number.isInteger(year) && year > 1990 ? year : new Date(receivedAt).getUTCFullYear();
}

function monthIndex(name: string): number {
  return [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ].indexOf(name.toLowerCase());
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function clipLine(value: string, max: number): string {
  return clipRaw(value.replace(/\s+/g, " "), max);
}

function clipRaw(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}
