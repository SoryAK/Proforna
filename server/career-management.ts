import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  authorizeChangeSet,
  createApproval,
  hashChangeSet,
  planOpportunityNetworkPromotion,
  prepareExternalAction,
  prepareOpportunity,
  transitionApplication,
  type Application,
  type ApplicationStage,
  type ChangeSet,
  type ExternalAction,
  type ExternalActionKind,
  type Opportunity,
  type OpportunityKind,
} from "../core/index";

type JsonObject = Record<string, unknown>;

export type ExternalActionAdapter = {
  perform(action: ExternalAction): Promise<Record<string, unknown>>;
};

export function readCareerManagement(db: DatabaseSync, occupantId: string) {
  const pendingRequests = db
    .prepare(
      `SELECT r.id AS id, r.opportunity_id AS opportunityId
         FROM projection_access_requests r
         JOIN interactive_projections p ON p.id = r.projection_id
        WHERE p.occupant_id = ? AND r.status = 'new'
          AND r.opportunity_id IS NOT NULL AND r.opportunity_id != ''`,
    )
    .all(occupantId) as Array<{ id: string; opportunityId: string }>;
  const pendingByOpportunity = new Map(
    pendingRequests.map((request) => [request.opportunityId, request.id]),
  );
  return {
    opportunities: rows(db, "opportunities", occupantId).map((opportunity) => ({
      ...opportunity,
      pending_access_request_id:
        pendingByOpportunity.get(String(opportunity.id)) ?? null,
    })),
    applications: rows(db, "applications", occupantId),
    interviews: rows(db, "interviews", occupantId),
    offers: rows(db, "offers", occupantId),
    contacts: rows(db, "contacts", occupantId),
    plans: rows(db, "career_plans", occupantId).map((plan) => ({
      ...plan,
      tasks: db
        .prepare("SELECT * FROM career_tasks WHERE plan_id = ? ORDER BY rowid")
        .all(String(plan.id)),
    })),
    actions: rows(db, "external_actions", occupantId),
  };
}

export function createOpportunity(
  db: DatabaseSync,
  occupantId: string,
  input: JsonObject,
): Opportunity {
  const opportunity: Opportunity = {
    id: randomUUID(),
    occupantId,
    kind: parseOpportunityKind(input.kind),
    title: text(input.title),
    organization: text(input.organization),
    sourceUrl: text(input.sourceUrl),
    location: text(input.location),
    fitSummary: text(input.fitSummary),
    status: "saved",
    createdAt: new Date().toISOString(),
  };
  const prepared = prepareOpportunity(opportunity);
  if (!prepared.ok) throw new CareerManagementStoreError(prepared.error);
  const contactId = text(input.contactId) || null;
  db.prepare(
    `INSERT INTO opportunities
      (id, occupant_id, kind, title, organization, source_url, location,
       fit_summary, status, created_at, contact_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    opportunity.id,
    occupantId,
    opportunity.kind,
    opportunity.title,
    opportunity.organization,
    opportunity.sourceUrl,
    opportunity.location,
    opportunity.fitSummary,
    opportunity.status,
    opportunity.createdAt,
    contactId,
  );
  return opportunity;
}

export function promoteOpportunityToNetwork(
  db: DatabaseSync,
  occupantId: string,
  opportunityId: string,
) {
  const row = db
    .prepare(
      `SELECT id, kind, title, organization, contact_id AS contactId, status
         FROM opportunities WHERE id = ? AND occupant_id = ?`,
    )
    .get(opportunityId, occupantId) as
    | {
        id: string;
        kind: string;
        title: string;
        organization: string;
        contactId: string | null;
        status: string;
      }
    | undefined;
  if (!row) throw new CareerManagementStoreError("opportunity-missing");
  const planned = planOpportunityNetworkPromotion({
    kind: parseOpportunityKind(row.kind),
  });
  if (!planned.ok) throw new CareerManagementStoreError(planned.error);
  let contactId = row.contactId ? String(row.contactId) : "";
  let contact = contactId
    ? db
        .prepare(
          "SELECT * FROM contacts WHERE id = ? AND occupant_id = ?",
        )
        .get(contactId, occupantId)
    : undefined;
  if (!contact) {
    const created = createContact(db, occupantId, {
      name: row.title,
      organization: row.organization,
    });
    contactId = created.id;
    contact = created;
  }
  db.prepare(
    `UPDATE opportunities
        SET status = ?, contact_id = ?
      WHERE id = ? AND occupant_id = ?`,
  ).run(planned.value.status, contactId, opportunityId, occupantId);
  return {
    opportunity: { id: opportunityId, status: planned.value.status, contactId },
    contact,
  };
}

export function createApplication(
  db: DatabaseSync,
  occupantId: string,
  opportunityId: string,
  input: JsonObject,
): Application {
  requireOwned(db, "opportunities", occupantId, opportunityId);
  const now = new Date().toISOString();
  const application: Application = {
    id: randomUUID(),
    occupantId,
    opportunityId,
    resumeRevisionId: text(input.resumeRevisionId) || null,
    stage: "preparing",
    nextStep: text(input.nextStep),
    deadline: text(input.deadline) || null,
    createdAt: now,
    updatedAt: now,
  };
  db.prepare(
    `INSERT INTO applications
      (id, occupant_id, opportunity_id, resume_revision_id, stage, next_step,
       deadline, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    application.id,
    occupantId,
    opportunityId,
    application.resumeRevisionId,
    application.stage,
    application.nextStep,
    application.deadline,
    now,
    now,
  );
  db.prepare(
    "UPDATE opportunities SET status = 'pursuing' WHERE id = ?",
  ).run(opportunityId);
  return application;
}

export async function transitionOwnedApplication(
  db: DatabaseSync,
  occupantId: string,
  applicationId: string,
  stage: ApplicationStage,
) {
  const current = readApplication(db, occupantId, applicationId);
  if (!current) throw new CareerManagementStoreError("application-missing");
  const now = new Date().toISOString();
  const transitioned = transitionApplication(current, stage, now);
  if (!transitioned.ok) {
    throw new CareerManagementStoreError(transitioned.error);
  }
  const changeSet: ChangeSet = {
    id: randomUUID(),
    occupantId,
    purpose: `Move application to ${stage}`,
    destination: `application:${applicationId}`,
    operations: [
      {
        action: "transition",
        entityType: "application",
        entityId: applicationId,
        values: { from: current.stage, to: stage },
      },
    ],
    createdAt: now,
  };
  const hash = await hashChangeSet(changeSet);
  const approval = await createApproval(changeSet, {
    id: randomUUID(),
    approvedBy: occupantId,
    approvedAt: now,
  });
  const authorized = await authorizeChangeSet(changeSet, approval, now);
  if (!authorized.ok) throw new CareerManagementStoreError(authorized.error);
  db.exec("BEGIN");
  try {
    insertChangeSet(db, changeSet, hash, "committed");
    insertApproval(db, approval);
    db.prepare(
      "UPDATE applications SET stage = ?, updated_at = ? WHERE id = ?",
    ).run(stage, now, applicationId);
    insertAudit(db, {
      id: randomUUID(),
      occupantId,
      eventType: "application-transitioned",
      entityType: "application",
      entityId: applicationId,
      changeSetId: changeSet.id,
      approvalId: approval.id,
      detail: { from: current.stage, to: stage },
      occurredAt: now,
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return transitioned.value;
}

export function createContact(
  db: DatabaseSync,
  occupantId: string,
  input: JsonObject,
) {
  const name = text(input.name);
  if (!name) throw new CareerManagementStoreError("name-required");
  const contact = {
    id: randomUUID(),
    occupantId,
    name,
    organization: text(input.organization),
    role: text(input.role),
    email: text(input.email),
    notes: text(input.notes),
    createdAt: new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO contacts
      (id, occupant_id, name, organization, role, email, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    contact.id,
    occupantId,
    contact.name,
    contact.organization,
    contact.role,
    contact.email,
    contact.notes,
    contact.createdAt,
  );
  return contact;
}

export function createPlan(
  db: DatabaseSync,
  occupantId: string,
  input: JsonObject,
) {
  const title = text(input.title);
  if (!title) throw new CareerManagementStoreError("title-required");
  const plan = {
    id: randomUUID(),
    occupantId,
    title,
    outcome: text(input.outcome),
    horizon: text(input.horizon),
    status: "active",
    createdAt: new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO career_plans
      (id, occupant_id, title, outcome, horizon, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    plan.id,
    occupantId,
    plan.title,
    plan.outcome,
    plan.horizon,
    plan.status,
    plan.createdAt,
  );
  for (const task of objectArray(input.tasks)) {
    const taskTitle = text(task.title);
    if (!taskTitle) continue;
    db.prepare(
      `INSERT INTO career_tasks (id, plan_id, title, due_on, status)
       VALUES (?, ?, ?, ?, 'todo')`,
    ).run(randomUUID(), plan.id, taskTitle, text(task.dueOn) || null);
  }
  return plan;
}

export function createInterview(
  db: DatabaseSync,
  occupantId: string,
  applicationId: string,
  input: JsonObject,
) {
  requireOwned(db, "applications", occupantId, applicationId);
  const interview = {
    id: randomUUID(),
    applicationId,
    kind: text(input.kind) || "interview",
    scheduledAt: text(input.scheduledAt),
    notes: text(input.notes),
    createdAt: new Date().toISOString(),
  };
  if (!interview.scheduledAt) {
    throw new CareerManagementStoreError("schedule-required");
  }
  db.prepare(
    `INSERT INTO interviews
      (id, occupant_id, application_id, kind, scheduled_at, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    interview.id,
    occupantId,
    applicationId,
    interview.kind,
    interview.scheduledAt,
    interview.notes,
    interview.createdAt,
  );
  return interview;
}

export function createOffer(
  db: DatabaseSync,
  occupantId: string,
  applicationId: string,
  input: JsonObject,
) {
  requireOwned(db, "applications", occupantId, applicationId);
  const summary = text(input.summary);
  if (!summary) throw new CareerManagementStoreError("summary-required");
  const offer = {
    id: randomUUID(),
    applicationId,
    summary,
    decisionDueAt: text(input.decisionDueAt) || null,
    status: "considering",
    createdAt: new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO offers
      (id, occupant_id, application_id, summary, decision_due_at, status,
       created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    offer.id,
    occupantId,
    applicationId,
    offer.summary,
    offer.decisionDueAt,
    offer.status,
    offer.createdAt,
  );
  return offer;
}

export async function proposeExternalAction(
  db: DatabaseSync,
  occupantId: string,
  input: JsonObject,
): Promise<ExternalAction> {
  const idempotencyKey = text(input.idempotencyKey);
  const existing = db
    .prepare(
      "SELECT * FROM external_actions WHERE occupant_id = ? AND idempotency_key = ?",
    )
    .get(occupantId, idempotencyKey) as JsonObject | undefined;
  if (existing) return mapExternalAction(existing);
  const action: ExternalAction = {
    id: randomUUID(),
    occupantId,
    kind: parseActionKind(input.kind),
    destination: text(input.destination),
    payload: isObject(input.payload) ? input.payload : {},
    idempotencyKey,
    status: "proposed",
    createdAt: new Date().toISOString(),
  };
  const prepared = prepareExternalAction(action);
  if (!prepared.ok) throw new CareerManagementStoreError(prepared.error);
  const changeSet: ChangeSet = {
    id: randomUUID(),
    occupantId,
    purpose: `Authorize ${action.kind}`,
    destination: action.destination,
    operations: [
      {
        action:
          action.kind === "message"
            ? "send"
            : action.kind === "schedule"
              ? "send"
              : "send",
        entityType: `external-${action.kind}`,
        entityId: action.id,
        values: { payload: action.payload, idempotencyKey },
      },
    ],
    createdAt: action.createdAt,
  };
  insertChangeSet(db, changeSet, await hashChangeSet(changeSet), "proposed");
  db.prepare(
    `INSERT INTO external_actions
      (id, occupant_id, kind, destination, payload_json, idempotency_key,
       status, change_set_id, result_json, created_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, 'proposed', ?, NULL, ?, NULL)`,
  ).run(
    action.id,
    occupantId,
    action.kind,
    action.destination,
    JSON.stringify(action.payload),
    action.idempotencyKey,
    changeSet.id,
    action.createdAt,
  );
  return action;
}

export async function approveExternalAction(
  db: DatabaseSync,
  occupantId: string,
  actionId: string,
  adapter?: ExternalActionAdapter,
) {
  const row = db
    .prepare(
      "SELECT * FROM external_actions WHERE id = ? AND occupant_id = ?",
    )
    .get(actionId, occupantId) as JsonObject | undefined;
  if (!row) throw new CareerManagementStoreError("action-missing");
  const action = mapExternalAction(row);
  if (action.status === "completed") {
    return {
      action,
      result: row.result_json ? JSON.parse(String(row.result_json)) : {},
    };
  }
  const changeSet = readChangeSet(db, String(row.change_set_id));
  const now = new Date().toISOString();
  const approval = await createApproval(changeSet, {
    id: randomUUID(),
    approvedBy: occupantId,
    approvedAt: now,
  });
  const authorized = await authorizeChangeSet(changeSet, approval, now);
  if (!authorized.ok) throw new CareerManagementStoreError(authorized.error);
  const result = adapter
    ? await adapter.perform(action)
    : { queued: true, note: "No external adapter configured." };
  db.exec("BEGIN");
  try {
    insertApproval(db, approval);
    db.prepare(
      `UPDATE external_actions SET status = 'completed', result_json = ?,
              completed_at = ? WHERE id = ?`,
    ).run(JSON.stringify(result), now, action.id);
    db.prepare(
      "UPDATE change_sets SET status = 'committed' WHERE id = ?",
    ).run(changeSet.id);
    insertAudit(db, {
      id: randomUUID(),
      occupantId,
      eventType: "external-action-completed",
      entityType: `external-${action.kind}`,
      entityId: action.id,
      changeSetId: changeSet.id,
      approvalId: approval.id,
      detail: { destination: action.destination, idempotencyKey: action.idempotencyKey },
      occurredAt: now,
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { action: { ...action, status: "completed" as const }, result };
}

function rows(db: DatabaseSync, table: string, occupantId: string): JsonObject[] {
  return db
    .prepare(`SELECT * FROM ${table} WHERE occupant_id = ? ORDER BY rowid DESC`)
    .all(occupantId) as JsonObject[];
}

function readApplication(
  db: DatabaseSync,
  occupantId: string,
  id: string,
): Application | null {
  const row = db
    .prepare("SELECT * FROM applications WHERE id = ? AND occupant_id = ?")
    .get(id, occupantId) as JsonObject | undefined;
  return row
    ? {
        id: String(row.id),
        occupantId: String(row.occupant_id),
        opportunityId: String(row.opportunity_id),
        resumeRevisionId: row.resume_revision_id
          ? String(row.resume_revision_id)
          : null,
        stage: row.stage as ApplicationStage,
        nextStep: String(row.next_step),
        deadline: row.deadline ? String(row.deadline) : null,
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
      }
    : null;
}

function readChangeSet(db: DatabaseSync, id: string): ChangeSet {
  const row = db
    .prepare("SELECT * FROM change_sets WHERE id = ?")
    .get(id) as JsonObject | undefined;
  if (!row) throw new CareerManagementStoreError("change-set-missing");
  return {
    id: String(row.id),
    occupantId: String(row.occupant_id),
    purpose: String(row.purpose),
    destination: String(row.destination),
    operations: JSON.parse(String(row.operations_json)),
    createdAt: String(row.created_at),
  };
}

function insertChangeSet(
  db: DatabaseSync,
  changeSet: ChangeSet,
  hash: string,
  status: string,
) {
  db.prepare(
    `INSERT INTO change_sets
      (id, occupant_id, purpose, destination, operations_json, change_hash,
       status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    changeSet.id,
    changeSet.occupantId,
    changeSet.purpose,
    changeSet.destination,
    JSON.stringify(changeSet.operations),
    hash,
    status,
    changeSet.createdAt,
  );
}

function insertApproval(
  db: DatabaseSync,
  approval: Awaited<ReturnType<typeof createApproval>>,
) {
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
}

function insertAudit(
  db: DatabaseSync,
  event: {
    id: string;
    occupantId: string;
    eventType: string;
    entityType: string;
    entityId: string;
    changeSetId: string;
    approvalId: string;
    detail: JsonObject;
    occurredAt: string;
  },
) {
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

function requireOwned(
  db: DatabaseSync,
  table: "opportunities" | "applications",
  occupantId: string,
  id: string,
) {
  if (
    !db
      .prepare(`SELECT id FROM ${table} WHERE id = ? AND occupant_id = ?`)
      .get(id, occupantId)
  ) {
    throw new CareerManagementStoreError(`${table.slice(0, -1)}-missing`);
  }
}

function mapExternalAction(row: JsonObject): ExternalAction {
  return {
    id: String(row.id),
    occupantId: String(row.occupant_id),
    kind: row.kind as ExternalActionKind,
    destination: String(row.destination),
    payload: JSON.parse(String(row.payload_json)),
    idempotencyKey: String(row.idempotency_key),
    status: row.status as ExternalAction["status"],
    createdAt: String(row.created_at),
  };
}

function parseOpportunityKind(value: unknown): OpportunityKind {
  return value === "project" || value === "speaking" || value === "connection"
    ? value
    : "role";
}

function parseActionKind(value: unknown): ExternalActionKind {
  return value === "message" || value === "schedule"
    ? value
    : "application";
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function objectArray(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

export class CareerManagementStoreError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
