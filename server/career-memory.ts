import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  commitCareerFactChanges,
  createApproval,
  hashChangeSet,
  prepareEvidence,
  type Approval,
  type AuditEvent,
  type CareerFactVersion,
  type CareerMemoryState,
  type ChangeSet,
  type Evidence,
  type Sensitivity,
} from "../core/index";

type JsonObject = Record<string, unknown>;

export function saveEvidence(
  db: DatabaseSync,
  occupantId: string,
  input: {
    sourceType?: unknown;
    sourceRef?: unknown;
    title?: unknown;
    sensitivity?: unknown;
    content?: unknown;
  },
): Evidence {
  const now = new Date().toISOString();
  const content = isObject(input.content) ? input.content : {};
  const evidence: Evidence = {
    id: randomUUID(),
    occupantId,
    sourceType: parseSourceType(input.sourceType),
    sourceRef: text(input.sourceRef) || randomUUID(),
    title: text(input.title),
    capturedAt: now,
    checksum: createHash("sha256")
      .update(JSON.stringify(content))
      .digest("hex"),
    sensitivity: parseSensitivity(input.sensitivity),
    content,
  };
  const prepared = prepareEvidence(evidence);
  if (!prepared.ok) throw new CareerMemoryStoreError(prepared.error);
  db.prepare(
    `INSERT INTO evidence
      (id, occupant_id, source_type, source_ref, title, captured_at, checksum,
       sensitivity, content_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    prepared.value.id,
    occupantId,
    prepared.value.sourceType,
    prepared.value.sourceRef,
    prepared.value.title,
    prepared.value.capturedAt,
    prepared.value.checksum,
    prepared.value.sensitivity,
    JSON.stringify(prepared.value.content),
  );
  return prepared.value;
}

export async function proposeCareerFact(
  db: DatabaseSync,
  occupantId: string,
  input: {
    purpose?: unknown;
    factType?: unknown;
    subjectId?: unknown;
    value?: unknown;
    evidenceIds?: unknown;
    sensitivity?: unknown;
    supersedesId?: unknown;
  },
): Promise<ChangeSet> {
  const supersedesId = text(input.supersedesId) || undefined;
  const changeSet: ChangeSet = {
    id: randomUUID(),
    occupantId,
    purpose: text(input.purpose) || "Update career memory",
    destination: "career-memory",
    operations: [
      {
        action: supersedesId ? "supersede" : "create",
        entityType: "career-fact",
        entityId: supersedesId,
        values: {
          id: randomUUID(),
          factType: parseFactType(input.factType),
          subjectId: text(input.subjectId),
          value: isObject(input.value) ? input.value : {},
          evidenceIds: stringArray(input.evidenceIds),
          sensitivity: parseSensitivity(input.sensitivity),
        },
      },
    ],
    createdAt: new Date().toISOString(),
  };
  const hash = await hashChangeSet(changeSet);
  db.prepare(
    `INSERT INTO change_sets
      (id, occupant_id, purpose, destination, operations_json, change_hash,
       status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'proposed', ?)`,
  ).run(
    changeSet.id,
    occupantId,
    changeSet.purpose,
    changeSet.destination,
    JSON.stringify(changeSet.operations),
    hash,
    changeSet.createdAt,
  );
  return changeSet;
}

export async function approveCareerFactChange(
  db: DatabaseSync,
  occupantId: string,
  changeSetId: string,
): Promise<{ approval: Approval; facts: CareerFactVersion[] }> {
  const changeSet = readChangeSet(db, occupantId, changeSetId);
  if (!changeSet) throw new CareerMemoryStoreError("change-set-missing");
  const now = new Date().toISOString();
  const approval = await createApproval(changeSet, {
    id: randomUUID(),
    approvedBy: occupantId,
    approvedAt: now,
  });
  const state = readCareerMemory(db, occupantId);
  const committed = await commitCareerFactChanges(
    state,
    changeSet,
    approval,
    now,
  );
  if (!committed.ok) throw new CareerMemoryStoreError(committed.error);

  db.exec("BEGIN");
  try {
    db.prepare(
      `INSERT INTO approvals
        (id, change_set_id, change_hash, destination, approved_by, approved_at,
         expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      approval.id,
      approval.changeSetId,
      approval.changeHash,
      approval.destination,
      approval.approvedBy,
      approval.approvedAt,
      approval.expiresAt,
    );
    for (const fact of committed.committed) {
      if (fact.supersedesId) {
        db.prepare(
          "UPDATE career_facts SET status = 'superseded' WHERE id = ? AND occupant_id = ?",
        ).run(fact.supersedesId, occupantId);
      }
      insertFact(db, fact);
    }
    const newAudit = committed.value.audit.slice(state.audit.length);
    for (const event of newAudit) insertAudit(db, event);
    db.prepare("UPDATE change_sets SET status = 'committed' WHERE id = ?").run(
      changeSet.id,
    );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { approval, facts: committed.committed };
}

export function readCareerMemory(
  db: DatabaseSync,
  occupantId: string,
): CareerMemoryState {
  const evidence = db
    .prepare(
      `SELECT id, occupant_id, source_type, source_ref, title, captured_at,
              checksum, sensitivity, content_json
       FROM evidence WHERE occupant_id = ? ORDER BY captured_at DESC`,
    )
    .all(occupantId)
    .map(mapEvidence);
  const facts = db
    .prepare(
      `SELECT id, occupant_id, fact_type, subject_id, value_json,
              evidence_ids_json, sensitivity, version, status, supersedes_id,
              created_at
       FROM career_facts WHERE occupant_id = ? ORDER BY created_at DESC`,
    )
    .all(occupantId)
    .map(mapFact);
  const audit = db
    .prepare(
      `SELECT id, occupant_id, event_type, entity_type, entity_id,
              change_set_id, approval_id, detail_json, occurred_at
       FROM audit_events WHERE occupant_id = ? ORDER BY occurred_at DESC`,
    )
    .all(occupantId)
    .map(mapAudit);
  return { evidence, facts, audit };
}

export function backfillCareerMemory(
  db: DatabaseSync,
  occupantId: string,
): { evidence: number; facts: number } {
  const profile = db
    .prepare(
      `SELECT full_name, headline, city, state, bio, linkedin_url, github_url,
              portfolio_url, updated_at
       FROM profiles WHERE occupant_id = ?`,
    )
    .get(occupantId) as JsonObject | undefined;
  const rows = db
    .prepare(
      `SELECT id, kind, title, company, location, start_date, end_date,
              is_current, description, achievements_json, degree, field,
              created_at
       FROM work_history WHERE occupant_id = ?`,
    )
    .all(occupantId) as JsonObject[];
  let evidenceCount = 0;
  let factCount = 0;
  if (profile) {
    const profileSource = "legacy-profile";
    const existingProfileEvidence = db
      .prepare(
        "SELECT id FROM evidence WHERE occupant_id = ? AND source_type = 'import' AND source_ref = ?",
      )
      .get(occupantId, profileSource) as { id: string } | undefined;
    if (!existingProfileEvidence) {
      const evidence: Evidence = {
        id: randomUUID(),
        occupantId,
        sourceType: "import",
        sourceRef: profileSource,
        title: "Imported local profile",
        capturedAt: String(profile.updated_at),
        checksum: createHash("sha256")
          .update(JSON.stringify(profile))
          .digest("hex"),
        sensitivity: "private",
        content: { ...profile },
      };
      db.prepare(
        `INSERT INTO evidence
          (id, occupant_id, source_type, source_ref, title, captured_at,
           checksum, sensitivity, content_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        evidence.id,
        occupantId,
        evidence.sourceType,
        evidence.sourceRef,
        evidence.title,
        evidence.capturedAt,
        evidence.checksum,
        evidence.sensitivity,
        JSON.stringify(evidence.content),
      );
      insertFact(db, {
        id: randomUUID(),
        occupantId,
        factType: "identity",
        subjectId: occupantId,
        value: { ...profile },
        evidenceIds: [evidence.id],
        sensitivity: "private",
        version: 1,
        status: "canonical",
        supersedesId: null,
        createdAt: String(profile.updated_at),
      });
      evidenceCount += 1;
      factCount += 1;
    }
  }
  for (const row of rows) {
    const roleId = String(row.id);
    const sourceRef = `legacy-history:${roleId}`;
    const existingFacts = db
      .prepare(
        `SELECT fact_type, value_json, status, evidence_ids_json
         FROM career_facts
         WHERE occupant_id = ? AND subject_id = ?`,
      )
      .all(occupantId, roleId) as Array<{
        fact_type: string;
        value_json: string;
        status: string;
        evidence_ids_json: string;
      }>;
    const factType = row.kind === "school" ? "education" : "role";
    const hasRoleFact = existingFacts.some(
      (fact) => fact.fact_type === factType && fact.status === "canonical",
    );
    const content = { ...row };
    let evidenceId: string | undefined;
    if (hasRoleFact) {
      const roleFact = existingFacts.find(
        (fact) => fact.fact_type === factType && fact.status === "canonical",
      );
      evidenceId = firstEvidenceId(roleFact?.evidence_ids_json);
    } else {
      const existingEvidence = db
        .prepare(
          "SELECT id FROM evidence WHERE occupant_id = ? AND source_type = 'import' AND source_ref = ?",
        )
        .get(occupantId, sourceRef) as { id: string } | undefined;
      evidenceId = existingEvidence?.id;
      if (!evidenceId) {
        evidenceId = randomUUID();
        const evidence: Evidence = {
          id: evidenceId,
          occupantId,
          sourceType: "import",
          sourceRef,
          title: `Imported ${String(row.kind)}: ${String(row.title)}`,
          capturedAt: String(row.created_at),
          checksum: createHash("sha256")
            .update(JSON.stringify(content))
            .digest("hex"),
          sensitivity: "private",
          content,
        };
        db.prepare(
          `INSERT INTO evidence
            (id, occupant_id, source_type, source_ref, title, captured_at, checksum,
             sensitivity, content_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          evidence.id,
          occupantId,
          evidence.sourceType,
          evidence.sourceRef,
          evidence.title,
          evidence.capturedAt,
          evidence.checksum,
          evidence.sensitivity,
          JSON.stringify(evidence.content),
        );
        evidenceCount += 1;
      }
      insertFact(db, {
        id: randomUUID(),
        occupantId,
        factType,
        subjectId: roleId,
        value: content,
        evidenceIds: [evidenceId],
        sensitivity: "private",
        version: 1,
        status: "canonical",
        supersedesId: null,
        createdAt: String(row.created_at),
      });
      factCount += 1;
    }

    const knownStatements = new Set(
      existingFacts
        .filter(
          (fact) =>
            fact.fact_type === "achievement" && fact.status === "canonical",
        )
        .map((fact) => statementFromValue(fact.value_json).toLowerCase())
        .filter(Boolean),
    );
    for (const statement of parseAchievements(row.achievements_json)) {
      if (!evidenceId || knownStatements.has(statement.toLowerCase())) continue;
      insertFact(db, {
        id: randomUUID(),
        occupantId,
        factType: "achievement",
        subjectId: roleId,
        value: { statement },
        evidenceIds: [evidenceId],
        sensitivity: "private",
        version: 1,
        status: "canonical",
        supersedesId: null,
        createdAt: String(row.created_at),
      });
      knownStatements.add(statement.toLowerCase());
      factCount += 1;
    }
  }
  return { evidence: evidenceCount, facts: factCount };
}

export async function commitOccupantFactOperations(
  db: DatabaseSync,
  occupantId: string,
  purpose: string,
  operations: ChangeSet["operations"],
): Promise<CareerFactVersion[]> {
  if (operations.length === 0) return [];
  const changeSet: ChangeSet = {
    id: randomUUID(),
    occupantId,
    purpose,
    destination: "career-memory",
    operations,
    createdAt: new Date().toISOString(),
  };
  const hash = await hashChangeSet(changeSet);
  db.prepare(
    `INSERT INTO change_sets
      (id, occupant_id, purpose, destination, operations_json, change_hash,
       status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'proposed', ?)`,
  ).run(
    changeSet.id,
    occupantId,
    changeSet.purpose,
    changeSet.destination,
    JSON.stringify(changeSet.operations),
    hash,
    changeSet.createdAt,
  );
  const committed = await approveCareerFactChange(db, occupantId, changeSet.id);
  return committed.facts;
}

function readChangeSet(
  db: DatabaseSync,
  occupantId: string,
  id: string,
): ChangeSet | null {
  const row = db
    .prepare(
      `SELECT id, occupant_id, purpose, destination, operations_json, created_at
       FROM change_sets WHERE id = ? AND occupant_id = ? AND status = 'proposed'`,
    )
    .get(id, occupantId) as JsonObject | undefined;
  if (!row) return null;
  return {
    id: String(row.id),
    occupantId: String(row.occupant_id),
    purpose: String(row.purpose),
    destination: String(row.destination),
    operations: JSON.parse(String(row.operations_json)),
    createdAt: String(row.created_at),
  };
}

function insertFact(db: DatabaseSync, fact: CareerFactVersion) {
  db.prepare(
    `INSERT INTO career_facts
      (id, occupant_id, fact_type, subject_id, value_json, evidence_ids_json,
       sensitivity, version, status, supersedes_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    fact.id,
    fact.occupantId,
    fact.factType,
    fact.subjectId,
    JSON.stringify(fact.value),
    JSON.stringify(fact.evidenceIds),
    fact.sensitivity,
    fact.version,
    fact.status,
    fact.supersedesId,
    fact.createdAt,
  );
}

function insertAudit(db: DatabaseSync, event: AuditEvent) {
  db.prepare(
    `INSERT INTO audit_events
      (id, occupant_id, event_type, entity_type, entity_id, change_set_id,
       approval_id, detail_json, occurred_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    event.id,
    event.occupantId,
    event.eventType,
    event.entityType,
    event.entityId,
    event.changeSetId,
    event.approvalId,
    JSON.stringify(event.detail),
    event.occurredAt,
  );
}

function mapEvidence(row: unknown): Evidence {
  const value = row as JsonObject;
  return {
    id: String(value.id),
    occupantId: String(value.occupant_id),
    sourceType: parseSourceType(value.source_type),
    sourceRef: String(value.source_ref),
    title: String(value.title),
    capturedAt: String(value.captured_at),
    checksum: String(value.checksum),
    sensitivity: parseSensitivity(value.sensitivity),
    content: JSON.parse(String(value.content_json)),
  };
}

function mapFact(row: unknown): CareerFactVersion {
  const value = row as JsonObject;
  return {
    id: String(value.id),
    occupantId: String(value.occupant_id),
    factType: parseFactType(value.fact_type),
    subjectId: String(value.subject_id),
    value: JSON.parse(String(value.value_json)),
    evidenceIds: JSON.parse(String(value.evidence_ids_json)),
    sensitivity: parseSensitivity(value.sensitivity),
    version: Number(value.version),
    status: value.status as CareerFactVersion["status"],
    supersedesId: value.supersedes_id ? String(value.supersedes_id) : null,
    createdAt: String(value.created_at),
  };
}

function mapAudit(row: unknown): AuditEvent {
  const value = row as JsonObject;
  return {
    id: String(value.id),
    occupantId: String(value.occupant_id),
    eventType: String(value.event_type),
    entityType: String(value.entity_type),
    entityId: String(value.entity_id),
    changeSetId: value.change_set_id ? String(value.change_set_id) : null,
    approvalId: value.approval_id ? String(value.approval_id) : null,
    detail: JSON.parse(String(value.detail_json)),
    occurredAt: String(value.occurred_at),
  };
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function parseAchievements(value: unknown): string[] {
  try {
    return stringArray(JSON.parse(String(value)))
      .map((item) => item.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function firstEvidenceId(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const ids: unknown = JSON.parse(raw);
    if (!Array.isArray(ids)) return undefined;
    const first = ids.find(
      (item): item is string => typeof item === "string" && Boolean(item.trim()),
    );
    return first;
  } catch {
    return undefined;
  }
}

function statementFromValue(valueJson: string): string {
  try {
    const value = JSON.parse(valueJson) as JsonObject;
    const statement = value.statement ?? value.title ?? value.name;
    return typeof statement === "string" ? statement.trim() : "";
  } catch {
    return "";
  }
}

function parseSensitivity(value: unknown): Sensitivity {
  return value === "public" || value === "restricted" ? value : "private";
}

function parseSourceType(value: unknown): Evidence["sourceType"] {
  return value === "resume" ||
    value === "worklog" ||
    value === "work-map" ||
    value === "document" ||
    value === "import" ||
    value === "message"
    ? value
    : "user";
}

function parseFactType(value: unknown): CareerFactVersion["factType"] {
  return value === "identity" ||
    value === "role" ||
    value === "education" ||
    value === "skill" ||
    value === "preference"
    ? value
    : "achievement";
}

export class CareerMemoryStoreError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
