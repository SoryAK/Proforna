import type { ModelHosting } from "./model-connection";

export const AGENT_PURPOSES = ["inspect"] as const;
export type AgentPurpose = (typeof AGENT_PURPOSES)[number];

export type AgentScope = {
  type: "worklog";
  id: string;
};

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
  if (input.purpose !== "inspect") return { ok: false, error: "purpose-invalid" };
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
      purpose: "inspect",
      scope,
      grant,
      status: "started",
      createdAt: input.now,
      completedAt: null,
    },
  };
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
  if (record.type !== "worklog" || !id) return null;
  return { type: "worklog", id };
}
