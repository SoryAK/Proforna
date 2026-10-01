import type { ModelHosting } from "./model-connection";
import { stripJsonFence } from "./resume-extract";
import type { WorklogFactProposal } from "./worklog";

export const AGENT_PURPOSES = [
  "inspect",
  "extract-facts",
  "suggest-reply",
  "command",
] as const;
export type AgentPurpose = (typeof AGENT_PURPOSES)[number];

export type AgentScope =
  | { type: "worklog"; id: string }
  | { type: "contact"; id: string }
  | { type: "home" };

export type CapabilityGrant = {
  remoteModel: boolean;
  expiresAt: string | null;
};

export type AgentRunStatus = "started" | "completed" | "failed" | "blocked";

export type AgentRun = {
  id: string;
  occupantId: string;
  purpose: AgentPurpose;
  scope: AgentScope;
  grant: CapabilityGrant;
  status: AgentRunStatus;
  createdAt: string;
  completedAt: string | null;
};

export type AgencyError =
  | "purpose-invalid"
  | "scope-required"
  | "model-missing"
  | "remote-model-grant-required"
  | "grant-expired";

export const INSPECT_SYSTEM_PROMPT =
  "You are Proforna. Answer only from the scoped vault text. Do not claim you changed Career Memory. Do not invent facts.";

export const EXTRACT_FACTS_SYSTEM_PROMPT =
  "You are Proforna. Extract career facts that are literally in the Worklog entry. Do not invent. Do not claim you changed Career Memory. Return ONLY JSON: {\"achievements\":[{\"statement\":\"string\",\"confidence\":\"candidate\"|\"supported\"}],\"skills\":[{\"name\":\"string\",\"confidence\":\"candidate\"|\"supported\"}]}. Use supported only when the entry includes a number or metric. Use empty arrays when nothing is stated.";

export function parseExtractedWorklogFacts(
  text: string,
  entry: { id: string; roleId: string | null },
): WorklogFactProposal[] {
  let raw: unknown;
  try {
    raw = JSON.parse(stripJsonFence(text));
  } catch {
    return [];
  }
  if (!raw || typeof raw !== "object") return [];
  const record = raw as Record<string, unknown>;
  const proposals: WorklogFactProposal[] = [];
  const achievements = Array.isArray(record.achievements)
    ? record.achievements
    : [];
  for (const item of achievements) {
    const row =
      item && typeof item === "object"
        ? (item as Record<string, unknown>)
        : {};
    const statement =
      typeof row.statement === "string" ? row.statement.trim() : "";
    if (!statement) continue;
    proposals.push({
      factType: "achievement",
      subjectId: entry.roleId ?? "",
      statement,
      evidenceRef: entry.id,
      confidence: row.confidence === "supported" ? "supported" : "candidate",
    });
  }
  const skills = Array.isArray(record.skills) ? record.skills : [];
  for (const item of skills) {
    const row =
      item && typeof item === "object"
        ? (item as Record<string, unknown>)
        : {};
    const name = typeof row.name === "string" ? row.name.trim() : "";
    if (!name) continue;
    proposals.push({
      factType: "skill",
      subjectId: entry.roleId ?? "",
      statement: name,
      evidenceRef: entry.id,
      confidence: row.confidence === "supported" ? "supported" : "candidate",
    });
  }
  return proposals;
}

export const COMMAND_SYSTEM_PROMPT =
  "You are Proforna. Continue this conversation using only the vault gist and the messages. If a Mail section is present, use only that mail. If a GitHub section is present, use only that GitHub account. If a Connected accounts section is present, those are the accounts the occupant turned on. If an account section includes a tool result, use only that result. Do not claim you changed Career Memory, a repo, an issue, a pull request, or an outside account. Do not send messages. Do not invent facts.";

export const MAIL_DRAFT_SYSTEM_PROMPT =
  "You are Proforna. Draft one email the occupant asked for. Use only the vault gist and the command. Do not invent facts. Do not claim you sent it. Return ONLY JSON: {\"to\":\"string\",\"subject\":\"string\",\"body\":\"string\"}.";

const MAIL_WORD = /\b(?:e-?mails?|gmail|inbox|mailbox|mail)\b/i;
const DRAFT_WORD = /\b(?:draft|write|compose)\b/i;
const SEARCH_WORD = /\b(?:find|search|read|show|check|look|what|who|latest|last|recent|newest|tell|said|says)\b/i;
const LEADING_SEARCH =
  /^(?:please\s+)?(?:can you\s+)?(?:find|search|read|show|check|look(?:\s+through|\s+for)?)\s+(?:my\s+|the\s+)?(?:e-?mails?|gmail|inbox|mailbox|mail)\s*(?:about|from|for|on|regarding)?\s*/i;

export function mailAsk(prompt: string): "search" | "draft" | null {
  const text = prompt.trim();
  if (!MAIL_WORD.test(text)) return null;
  if (DRAFT_WORD.test(text)) return "draft";
  if (SEARCH_WORD.test(text)) return "search";
  return null;
}

export function gmailSearchQuery(prompt: string): string {
  const stripped = prompt.replace(LEADING_SEARCH, "").trim();
  if (stripped !== prompt.trim()) return stripped || "in:inbox";
  const topic = prompt
    .replace(
      /\b(?:please|can|you|tell|me|what|whats|what's|did|does|do|is|was|my|the|a|an|latest|last|recent|newest|just|said|say|says|about|of|e-?mails?|gmail|inbox|mailbox|mail)\b/gi,
      " ",
    )
    .replace(/[?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return topic || "in:inbox";
}

export function parseMailDraft(
  text: string,
): { to: string; subject: string; body: string } | null {
  let raw: unknown;
  try {
    raw = JSON.parse(stripJsonFence(text));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const to = typeof record.to === "string" ? record.to.trim() : "";
  const subject = typeof record.subject === "string" ? record.subject.trim() : "";
  const body = typeof record.body === "string" ? record.body.trim() : "";
  if (!to || !subject || !body) return null;
  return { to, subject, body };
}

export function mailUnavailableLine(): string {
  return "Mail: Gmail is not available.";
}

export function mailUnreadLine(): string {
  return "Mail: Gmail could not be read.";
}

const GITHUB_WORD = /\b(?:github|repos?|repositories|repository|pull requests?)\b/i;

export function githubAsk(prompt: string): boolean {
  return GITHUB_WORD.test(prompt.trim());
}

export function presentGithubAccount(
  user: unknown,
  repos: unknown,
): { login: string; repos: Array<{ name: string; description: string }> } {
  const record = user && typeof user === "object" ? (user as { login?: unknown }) : null;
  const login = typeof record?.login === "string" ? record.login.trim() : "";
  const rows = Array.isArray(repos) ? repos : [];
  return {
    login,
    repos: rows.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as { full_name?: unknown; name?: unknown; description?: unknown };
      const name = text(row.full_name) || text(row.name);
      if (!name) return [];
      return [{ name, description: text(row.description).slice(0, 120) }];
    }).slice(0, 8),
  };
}

export function githubAccountLine(account: {
  login: string;
  repos: ReadonlyArray<{ name: string; description: string }>;
}): string {
  const repos = account.repos.length
    ? account.repos
        .map((repo) => (repo.description ? `- ${repo.name} — ${repo.description}` : `- ${repo.name}`))
        .join("\n")
    : "none";
  return `GitHub:\nLogin: ${account.login || "unknown"}\nRepos, recently updated:\n${repos}`;
}

export function githubUnavailableLine(): string {
  return "GitHub: GitHub is not available.";
}

export function githubUnreadLine(): string {
  return "GitHub: GitHub could not be read.";
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function mailSnippetsLine(snippets: readonly string[]): string {
  const lines = snippets.map((snippet) => snippet.trim()).filter(Boolean);
  if (lines.length === 0) return "Mail: no messages matched.";
  return `Mail, newest first:\n${lines.map((snippet) => `- ${snippet}`).join("\n")}`;
}

export const SUGGEST_REPLY_SYSTEM_PROMPT =
  "You are Proforna. Draft one reply the occupant could send on this Contact thread. Use only the thread. Do not invent facts. Do not claim you sent it. Return ONLY JSON: {\"body\":\"string\"}.";

export function parseSuggestedReply(text: string): string {
  let raw: unknown;
  try {
    raw = JSON.parse(stripJsonFence(text));
  } catch {
    return "";
  }
  if (!raw || typeof raw !== "object") return "";
  const body = (raw as Record<string, unknown>).body;
  return typeof body === "string" ? body.trim() : "";
}

export function planAgentRun(input: {
  id: string;
  occupantId: string;
  purpose: unknown;
  scope: unknown;
  grant: unknown;
  hosting: ModelHosting | null;
  now: string;
}): { ok: true; value: AgentRun } | { ok: false; error: AgencyError } {
  if (!input.hosting) return { ok: false, error: "model-missing" };
  if (!isAgentPurpose(input.purpose)) {
    return { ok: false, error: "purpose-invalid" };
  }
  const scope = parseScope(input.scope);
  if (!scope) return { ok: false, error: "scope-required" };
  const grant = parseGrant(input.grant);
  if (grant.expiresAt && grant.expiresAt <= input.now) {
    return { ok: false, error: "grant-expired" };
  }
  if (input.hosting === "cloud" && !grant.remoteModel) {
    return { ok: false, error: "remote-model-grant-required" };
  }
  return {
    ok: true,
    value: {
      id: input.id,
      occupantId: input.occupantId,
      purpose: input.purpose,
      scope,
      grant,
      status: "started",
      createdAt: input.now,
      completedAt: null,
    },
  };
}

function isAgentPurpose(value: unknown): value is AgentPurpose {
  return AGENT_PURPOSES.some((purpose) => purpose === value);
}

function parseGrant(value: unknown): CapabilityGrant {
  const record =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    remoteModel: record.remoteModel === true,
    expiresAt:
      typeof record.expiresAt === "string" && record.expiresAt.trim()
        ? record.expiresAt.trim()
        : null,
  };
}

function parseScope(value: unknown): AgentScope | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  if (record.type === "worklog" && id) return { type: "worklog", id };
  if (record.type === "contact" && id) return { type: "contact", id };
  if (record.type === "home") return { type: "home" };
  return null;
}
