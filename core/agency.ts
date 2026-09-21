import type { ModelHosting } from "./model-connection";
import { stripJsonFence } from "./resume-extract";
import type { WorklogFactProposal } from "./worklog";

export const AGENT_PURPOSES = [
  "inspect",
  "extract-facts",
  "suggest-reply",
] as const;
export type AgentPurpose = (typeof AGENT_PURPOSES)[number];

export type AgentScope =
  | { type: "worklog"; id: string }
  | { type: "contact"; id: string };

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
  return null;
}
