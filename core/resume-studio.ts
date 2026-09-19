import type { CareerFactVersion } from "./career-memory";

export type ResumeVariant = {
  id: string;
  occupantId: string;
  name: string;
  targetRole: string;
  audience: string;
  intent: string;
  selectedFactIds: string[];
  createdAt: string;
};

export type ResumeClaim = {
  text: string;
  factId: string;
  factVersion: number;
  evidenceIds: string[];
};

export type ResumeRevision = {
  id: string;
  occupantId: string;
  variantId: string;
  revisionNumber: number;
  title: string;
  targetRole: string;
  summary: ResumeClaim[];
  experience: Array<{
    factId: string;
    title: string;
    organization: string;
    span: string;
    claims: ResumeClaim[];
  }>;
  skills: ResumeClaim[];
  pinnedFacts: Array<{ factId: string; version: number }>;
  createdAt: string;
};

export type ResumeStudioError =
  | "name-required"
  | "target-required"
  | "facts-required"
  | "fact-missing"
  | "fact-noncanonical"
  | "unsupported-claim";

export function prepareResumeVariant(
  variant: ResumeVariant,
):
  | { ok: true; value: ResumeVariant }
  | { ok: false; error: ResumeStudioError } {
  if (!variant.name.trim()) return { ok: false, error: "name-required" };
  if (!variant.targetRole.trim()) return { ok: false, error: "target-required" };
  if (variant.selectedFactIds.length === 0) {
    return { ok: false, error: "facts-required" };
  }
  return {
    ok: true,
    value: {
      ...variant,
      name: variant.name.trim(),
      targetRole: variant.targetRole.trim(),
      audience: variant.audience.trim(),
      intent: variant.intent.trim(),
      selectedFactIds: [...new Set(variant.selectedFactIds)],
    },
  };
}

export function buildResumeRevision(input: {
  id: string;
  variant: ResumeVariant;
  revisionNumber: number;
  facts: CareerFactVersion[];
  createdAt: string;
}):
  | { ok: true; value: ResumeRevision }
  | { ok: false; error: ResumeStudioError; factId?: string } {
  const prepared = prepareResumeVariant(input.variant);
  if (!prepared.ok) return prepared;
  const selected: CareerFactVersion[] = [];
  for (const factId of prepared.value.selectedFactIds) {
    const fact = input.facts.find((candidate) => candidate.id === factId);
    if (!fact) return { ok: false, error: "fact-missing", factId };
    if (fact.status !== "canonical") {
      return { ok: false, error: "fact-noncanonical", factId };
    }
    selected.push(fact);
  }

  const identity = selected.find((fact) => fact.factType === "identity");
  const roles = selected.filter((fact) => fact.factType === "role");
  const achievements = selected.filter(
    (fact) => fact.factType === "achievement",
  );
  const skills = selected.filter((fact) => fact.factType === "skill");
  const fullName = stringValue(identity?.value.full_name) ||
    stringValue(identity?.value.fullName) ||
    "Career professional";

  const revision: ResumeRevision = {
    id: input.id,
    occupantId: prepared.value.occupantId,
    variantId: prepared.value.id,
    revisionNumber: input.revisionNumber,
    title: fullName,
    targetRole: prepared.value.targetRole,
    summary: achievements.slice(0, 2).map(claimFromFact),
    experience: roles.map((role) => ({
      factId: role.id,
      title:
        stringValue(role.value.title) ||
        stringValue(role.value.role) ||
        "Role",
      organization:
        stringValue(role.value.company) ||
        stringValue(role.value.organization),
      span: careerSpan(role.value),
      claims: achievements
        .filter(
          (achievement) =>
            !achievement.subjectId ||
            achievement.subjectId === role.subjectId ||
            achievement.subjectId === role.id,
        )
        .map(claimFromFact),
    })),
    skills: skills.map(claimFromFact),
    pinnedFacts: selected.map((fact) => ({
      factId: fact.id,
      version: fact.version,
    })),
    createdAt: input.createdAt,
  };
  return { ok: true, value: revision };
}

export function assertClaimsTraceable(
  revision: ResumeRevision,
): { ok: true } | { ok: false; error: ResumeStudioError } {
  const claims = [
    ...revision.summary,
    ...revision.skills,
    ...revision.experience.flatMap((item) => item.claims),
  ];
  return claims.every(
    (claim) =>
      Boolean(claim.factId) &&
      claim.factVersion > 0 &&
      claim.evidenceIds.length > 0,
  )
    ? { ok: true }
    : { ok: false, error: "unsupported-claim" };
}

function claimFromFact(fact: CareerFactVersion): ResumeClaim {
  return {
    text:
      stringValue(fact.value.statement) ||
      stringValue(fact.value.name) ||
      stringValue(fact.value.title),
    factId: fact.id,
    factVersion: fact.version,
    evidenceIds: fact.evidenceIds,
  };
}

function careerSpan(value: Record<string, unknown>): string {
  const start = stringValue(value.start_date) || stringValue(value.startDate);
  const end =
    stringValue(value.end_date) ||
    stringValue(value.endDate) ||
    (value.is_current || value.isCurrent ? "Present" : "");
  return [start, end].filter(Boolean).join(" — ");
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
