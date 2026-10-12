import {
  authorizeChangeSet,
  type Approval,
  type AuditEvent,
  type ChangeOperation,
  type ChangeSet,
} from "./governance";

export type Sensitivity = "private" | "restricted" | "public";

export type Evidence = {
  id: string;
  occupantId: string;
  sourceType: "user" | "resume" | "worklog" | "work-map" | "document" | "import" | "message";
  sourceRef: string;
  title: string;
  capturedAt: string;
  checksum: string;
  sensitivity: Sensitivity;
  content: Record<string, unknown>;
};

export type CareerFactVersion = {
  id: string;
  occupantId: string;
  factType:
    | "identity"
    | "role"
    | "education"
    | "skill"
    | "achievement"
    | "preference";
  subjectId: string;
  value: Record<string, unknown>;
  evidenceIds: string[];
  sensitivity: Sensitivity;
  version: number;
  status: "canonical" | "superseded" | "proposed";
  supersedesId: string | null;
  createdAt: string;
};

export type CareerMemoryState = {
  evidence: Evidence[];
  facts: CareerFactVersion[];
  audit: AuditEvent[];
};

export type CareerMemoryError =
  | "title-required"
  | "source-required"
  | "fact-type-required"
  | "evidence-required"
  | "approval-required"
  | "operation-invalid";

export function prepareEvidence(input: Evidence):
  | { ok: true; value: Evidence }
  | { ok: false; error: CareerMemoryError } {
  if (!input.title.trim()) return { ok: false, error: "title-required" };
  if (!input.sourceRef.trim()) return { ok: false, error: "source-required" };
  return {
    ok: true,
    value: {
      ...input,
      title: input.title.trim(),
      sourceRef: input.sourceRef.trim(),
    },
  };
}

export function prepareCareerFact(input: CareerFactVersion):
  | { ok: true; value: CareerFactVersion }
  | { ok: false; error: CareerMemoryError } {
  if (!input.factType) return { ok: false, error: "fact-type-required" };
  if (input.evidenceIds.length === 0) {
    return { ok: false, error: "evidence-required" };
  }
  return { ok: true, value: input };
}

export function canonicalFacts(
  facts: CareerFactVersion[],
): CareerFactVersion[] {
  return facts.filter((fact) => fact.status === "canonical");
}

export async function commitCareerFactChanges(
  state: CareerMemoryState,
  changeSet: ChangeSet,
  approval: Approval | null,
  now: string,
): Promise<
  | { ok: true; value: CareerMemoryState; committed: CareerFactVersion[] }
  | { ok: false; error: CareerMemoryError }
> {
  if (!approval) return { ok: false, error: "approval-required" };
  const authorization = await authorizeChangeSet(changeSet, approval, now);
  if (!authorization.ok) return { ok: false, error: "approval-required" };

  const facts = state.facts.map((fact) => ({ ...fact }));
  const committed: CareerFactVersion[] = [];
  const audit = [...state.audit];

  for (const [index, operation] of changeSet.operations.entries()) {
    if (
      operation.entityType !== "career-fact" ||
      (operation.action !== "create" && operation.action !== "supersede")
    ) {
      return { ok: false, error: "operation-invalid" };
    }
    const raw = operation.values as Partial<CareerFactVersion>;
    const previous =
      operation.action === "supersede" && operation.entityId
        ? facts.find((fact) => fact.id === operation.entityId)
        : undefined;
    if (previous) previous.status = "superseded";
    const next: CareerFactVersion = {
      id: String(raw.id ?? `${changeSet.id}:fact:${index}`),
      occupantId: changeSet.occupantId,
      factType: raw.factType ?? previous?.factType ?? "achievement",
      subjectId: String(raw.subjectId ?? previous?.subjectId ?? ""),
      value: raw.value ?? {},
      evidenceIds: raw.evidenceIds ?? previous?.evidenceIds ?? [],
      sensitivity: raw.sensitivity ?? previous?.sensitivity ?? "private",
      version: (previous?.version ?? 0) + 1,
      status: "canonical",
      supersedesId: previous?.id ?? null,
      createdAt: now,
    };
    const prepared = prepareCareerFact(next);
    if (!prepared.ok) return prepared;
    facts.push(prepared.value);
    committed.push(prepared.value);
    audit.push({
      id: `${changeSet.id}:audit:${index}`,
      occupantId: changeSet.occupantId,
      eventType: previous ? "fact-superseded" : "fact-created",
      entityType: "career-fact",
      entityId: prepared.value.id,
      changeSetId: changeSet.id,
      approvalId: approval.id,
      detail: {
        factType: prepared.value.factType,
        supersedesId: prepared.value.supersedesId,
      },
      occurredAt: now,
    });
  }

  return {
    ok: true,
    value: { evidence: state.evidence, facts, audit },
    committed,
  };
}

export type ResumeImportRole = {
  id: string;
  kind: "job" | "school";
  title: string;
  organization: string;
  location: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  description: string;
  achievements: string[];
  /** When set, these evidence rows back the role. Otherwise the shared resume evidence is used. */
  evidenceIds?: string[];
  /** Parallel to achievements. A blank entry uses the role's evidence. */
  achievementEvidenceIds?: string[];
};

export function planResumeImportFacts(input: {
  evidenceId: string;
  roles: ResumeImportRole[];
  skills: string[];
  /** Parallel to skills. A blank entry uses the shared resume evidence. */
  skillEvidenceIds?: string[];
}): ChangeOperation[] {
  const operations: ChangeOperation[] = [];
  for (const role of input.roles) {
    const roleEvidence = evidenceList(role.evidenceIds, input.evidenceId);
    if (roleEvidence.length === 0) continue;
    const factType = role.kind === "school" ? "education" : "role";
    operations.push({
      action: "create",
      entityType: "career-fact",
      values: {
        factType,
        subjectId: role.id,
        value: {
          title: role.title,
          company: role.organization,
          organization: role.organization,
          location: role.location,
          startDate: role.startDate,
          endDate: role.endDate,
          isCurrent: role.isCurrent,
          description: role.description,
        },
        evidenceIds: roleEvidence,
      },
    });
    role.achievements.forEach((raw, index) => {
      const statement = raw.trim();
      if (!statement) return;
      const achievementEvidence = evidenceList(
        role.achievementEvidenceIds?.[index]
          ? [role.achievementEvidenceIds[index]]
          : undefined,
        roleEvidence[0] ?? "",
      );
      if (achievementEvidence.length === 0) return;
      operations.push({
        action: "create",
        entityType: "career-fact",
        values: {
          factType: "achievement",
          subjectId: role.id,
          value: { statement },
          evidenceIds: achievementEvidence,
        },
      });
    });
  }
  input.skills.forEach((name, index) => {
    const skill = name.trim();
    if (!skill) return;
    const skillEvidence = evidenceList(
      input.skillEvidenceIds?.[index] ? [input.skillEvidenceIds[index]] : undefined,
      input.evidenceId,
    );
    if (skillEvidence.length === 0) return;
    operations.push({
      action: "create",
      entityType: "career-fact",
      values: {
        factType: "skill",
        subjectId: skill.toLowerCase(),
        value: { name: skill },
        evidenceIds: skillEvidence,
      },
    });
  });
  return operations;
}

function evidenceList(preferred: string[] | undefined, fallback: string): string[] {
  const own = (preferred ?? []).map((id) => id.trim()).filter(Boolean);
  if (own.length > 0) return [...new Set(own)];
  const shared = fallback.trim();
  return shared ? [shared] : [];
}
