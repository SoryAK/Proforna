import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  authorizeChangeSet,
  createApproval,
  hashChangeSet,
  planOpportunityNetworkPromotion,
  prepareExternalAction,
  prepareInterview,
  prepareOffer,
  prepareOpportunity,
  preparePlan,
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

const contactSends = new Set<string>();

export function markContactSend(contactId: string, pending: boolean) {
  if (pending) contactSends.add(contactId);
  else contactSends.delete(contactId);
}

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

/**
 * Changes an opportunity with the same fields that add it. A field left out
 * keeps its value, so a screen that edits only some fields cannot wipe the rest
 * (a saved listing keeps its link and place when its title is fixed).
 */
export function updateOpportunity(
  db: DatabaseSync,
  occupantId: string,
  opportunityId: string,
  input: JsonObject,
): Opportunity {
  const current = db
    .prepare(
      `SELECT kind, title, organization, source_url, location, fit_summary,
              status, created_at, contact_id
         FROM opportunities WHERE id = ? AND occupant_id = ?`,
    )
    .get(opportunityId, occupantId) as
    | {
        kind: string;
        title: string;
        organization: string;
        source_url: string;
        location: string;
        fit_summary: string;
        status: Opportunity["status"];
        created_at: string;
        contact_id: string | null;
      }
    | undefined;
  if (!current) throw new CareerManagementStoreError("opportunity-missing");
  const field = (key: string, fallback: string) => (key in input ? text(input[key]) : fallback);
  const prepared = prepareOpportunity({
    id: opportunityId,
    occupantId,
    kind: parseOpportunityKind("kind" in input ? input.kind : current.kind),
    title: field("title", current.title),
    organization: field("organization", current.organization),
    sourceUrl: field("sourceUrl", current.source_url),
    location: field("location", current.location),
    fitSummary: field("fitSummary", current.fit_summary),
    status: current.status,
    createdAt: current.created_at,
  });
  if (!prepared.ok) throw new CareerManagementStoreError(prepared.error);
  const opportunity = prepared.value;
  const contactId = "contactId" in input ? text(input.contactId) || null : current.contact_id;
  db.prepare(
    `UPDATE opportunities
        SET kind = ?, title = ?, organization = ?, source_url = ?, location = ?,
            fit_summary = ?, contact_id = ?
      WHERE id = ? AND occupant_id = ?`,
  ).run(
    opportunity.kind,
    opportunity.title,
    opportunity.organization,
    opportunity.sourceUrl,
    opportunity.location,
    opportunity.fitSummary,
    contactId,
    opportunityId,
    occupantId,
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

export function deleteOpportunity(
  db: DatabaseSync,
  occupantId: string,
  opportunityId: string,
): void {
  const existing = db
    .prepare("SELECT id FROM opportunities WHERE id = ? AND occupant_id = ?")
    .get(opportunityId, occupantId);
  if (!existing) throw new CareerManagementStoreError("opportunity-missing");
  const applications = db
    .prepare(
      "SELECT id FROM applications WHERE opportunity_id = ? AND occupant_id = ?",
    )
    .all(opportunityId, occupantId) as Array<{ id: string }>;
  db.exec("BEGIN");
  try {
    for (const application of applications) {
      db.prepare(
        "DELETE FROM interviews WHERE application_id = ? AND occupant_id = ?",
      ).run(application.id, occupantId);
      db.prepare(
        "DELETE FROM offers WHERE application_id = ? AND occupant_id = ?",
      ).run(application.id, occupantId);
      db.prepare(
        "DELETE FROM applications WHERE id = ? AND occupant_id = ?",
      ).run(application.id, occupantId);
    }
    db.prepare(
      "DELETE FROM opportunities WHERE id = ? AND occupant_id = ?",
    ).run(opportunityId, occupantId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function deleteApplication(
  db: DatabaseSync,
  occupantId: string,
  applicationId: string,
): void {
  const row = db
    .prepare(
      `SELECT opportunity_id AS opportunityId
         FROM applications WHERE id = ? AND occupant_id = ?`,
    )
    .get(applicationId, occupantId) as { opportunityId: string } | undefined;
  if (!row) throw new CareerManagementStoreError("application-missing");
  db.exec("BEGIN");
  try {
    db.prepare(
      "DELETE FROM interviews WHERE application_id = ? AND occupant_id = ?",
    ).run(applicationId, occupantId);
    db.prepare(
      "DELETE FROM offers WHERE application_id = ? AND occupant_id = ?",
    ).run(applicationId, occupantId);
    db.prepare(
      "DELETE FROM applications WHERE id = ? AND occupant_id = ?",
    ).run(applicationId, occupantId);
    const remaining = db
      .prepare(
        `SELECT id FROM applications
          WHERE opportunity_id = ? AND occupant_id = ?`,
      )
      .get(row.opportunityId, occupantId);
    if (!remaining) {
      db.prepare(
        "DELETE FROM opportunities WHERE id = ? AND occupant_id = ?",
      ).run(row.opportunityId, occupantId);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
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

export function updateContact(
  db: DatabaseSync,
  occupantId: string,
  contactId: string,
  input: JsonObject,
) {
  const name = text(input.name);
  if (!name) throw new CareerManagementStoreError("name-required");
  const current = db
    .prepare(
      "SELECT notes FROM contacts WHERE id = ? AND occupant_id = ?",
    )
    .get(contactId, occupantId) as { notes: string } | undefined;
  if (!current) throw new CareerManagementStoreError("not-found");
  const organization = text(input.organization);
  const role = text(input.role);
  const email = text(input.email);
  const notes = "notes" in input ? text(input.notes) : current.notes;
  db.prepare(
    `UPDATE contacts
        SET name = ?, organization = ?, role = ?, email = ?, notes = ?
      WHERE id = ? AND occupant_id = ?`,
  ).run(name, organization, role, email, notes, contactId, occupantId);
  return { id: contactId, name, organization, role, email, notes };
}

export function removeContact(
  db: DatabaseSync,
  occupantId: string,
  contactId: string,
) {
  const existing = db
    .prepare("SELECT id FROM contacts WHERE id = ? AND occupant_id = ?")
    .get(contactId, occupantId);
  if (!existing) throw new CareerManagementStoreError("not-found");
  if (contactSends.has(contactId)) {
    throw new CareerManagementStoreError("send-pending");
  }
  db.exec("BEGIN");
  try {
    db.prepare(
      "DELETE FROM contact_messages WHERE contact_id = ? AND occupant_id = ?",
    ).run(contactId, occupantId);
    db.prepare(
      "UPDATE opportunities SET contact_id = NULL WHERE contact_id = ? AND occupant_id = ?",
    ).run(contactId, occupantId);
    db.prepare("DELETE FROM contacts WHERE id = ? AND occupant_id = ?").run(
      contactId,
      occupantId,
    );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function createPlan(
  db: DatabaseSync,
  occupantId: string,
  input: JsonObject,
) {
  const prepared = preparePlan(input);
  if (!prepared.ok) throw new CareerManagementStoreError(prepared.error);
  const plan = {
    id: randomUUID(),
    occupantId,
    title: prepared.value.title,
    outcome: prepared.value.outcome,
    horizon: prepared.value.horizon ?? "",
    status: "active",
    createdAt: new Date().toISOString(),
  };
  db.exec("BEGIN");
  try {
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
    insertPlanTasks(db, plan.id, prepared.value.tasks ?? []);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return plan;
}

/** Changes a plan with the same fields that add it. Tasks are replaced only when sent. */
export function updatePlan(
  db: DatabaseSync,
  occupantId: string,
  planId: string,
  input: JsonObject,
) {
  const current = db
    .prepare(
      "SELECT title, outcome, horizon, status, created_at FROM career_plans WHERE id = ? AND occupant_id = ?",
    )
    .get(planId, occupantId) as
    | { title: string; outcome: string; horizon: string; status: string; created_at: string }
    | undefined;
  if (!current) throw new CareerManagementStoreError("not-found");
  // A field left out keeps what it was; a field sent is checked as sent, so a
  // blank title is still refused and a blank outcome still clears it.
  const prepared = preparePlan({
    ...input,
    title: "title" in input ? input.title : current.title,
    outcome: "outcome" in input ? input.outcome : current.outcome,
  });
  if (!prepared.ok) throw new CareerManagementStoreError(prepared.error);
  const horizon = prepared.value.horizon ?? current.horizon;
  db.exec("BEGIN");
  try {
    db.prepare(
      `UPDATE career_plans SET title = ?, outcome = ?, horizon = ?
        WHERE id = ? AND occupant_id = ?`,
    ).run(prepared.value.title, prepared.value.outcome, horizon, planId, occupantId);
    if (prepared.value.tasks) {
      db.prepare("DELETE FROM career_tasks WHERE plan_id = ?").run(planId);
      insertPlanTasks(db, planId, prepared.value.tasks);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return {
    id: planId,
    occupantId,
    title: prepared.value.title,
    outcome: prepared.value.outcome,
    horizon,
    status: current.status,
    createdAt: current.created_at,
  };
}

/** Removes a plan and its tasks. */
export function removePlan(db: DatabaseSync, occupantId: string, planId: string) {
  const existing = db
    .prepare("SELECT id FROM career_plans WHERE id = ? AND occupant_id = ?")
    .get(planId, occupantId);
  if (!existing) throw new CareerManagementStoreError("not-found");
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM career_tasks WHERE plan_id = ?").run(planId);
    db.prepare("DELETE FROM career_plans WHERE id = ? AND occupant_id = ?").run(
      planId,
      occupantId,
    );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function insertPlanTasks(
  db: DatabaseSync,
  planId: string,
  tasks: ReadonlyArray<{ title: string; dueOn: string | null }>,
) {
  const insert = db.prepare(
    `INSERT INTO career_tasks (id, plan_id, title, due_on, status)
     VALUES (?, ?, ?, ?, 'todo')`,
  );
  for (const task of tasks) insert.run(randomUUID(), planId, task.title, task.dueOn);
}

export function createInterview(
  db: DatabaseSync,
  occupantId: string,
  applicationId: string,
  input: JsonObject,
) {
  requireOwned(db, "applications", occupantId, applicationId);
  const prepared = prepareInterview(input);
  if (!prepared.ok) throw new CareerManagementStoreError(prepared.error);
  const interview = {
    id: randomUUID(),
    applicationId,
    ...prepared.value,
    createdAt: new Date().toISOString(),
  };
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

/** Changes an interview with the same fields that add it. */
export function updateInterview(
  db: DatabaseSync,
  occupantId: string,
  interviewId: string,
  input: JsonObject,
) {
  const current = db
    .prepare("SELECT application_id, created_at FROM interviews WHERE id = ? AND occupant_id = ?")
    .get(interviewId, occupantId) as { application_id: string; created_at: string } | undefined;
  if (!current) throw new CareerManagementStoreError("not-found");
  const prepared = prepareInterview(input);
  if (!prepared.ok) throw new CareerManagementStoreError(prepared.error);
  db.prepare(
    `UPDATE interviews SET kind = ?, scheduled_at = ?, notes = ?
      WHERE id = ? AND occupant_id = ?`,
  ).run(prepared.value.kind, prepared.value.scheduledAt, prepared.value.notes, interviewId, occupantId);
  return {
    id: interviewId,
    applicationId: current.application_id,
    ...prepared.value,
    createdAt: current.created_at,
  };
}

export function removeInterview(db: DatabaseSync, occupantId: string, interviewId: string) {
  const removed = db
    .prepare("DELETE FROM interviews WHERE id = ? AND occupant_id = ?")
    .run(interviewId, occupantId);
  if (removed.changes !== 1) throw new CareerManagementStoreError("not-found");
}

export function createOffer(
  db: DatabaseSync,
  occupantId: string,
  applicationId: string,
  input: JsonObject,
) {
  requireOwned(db, "applications", occupantId, applicationId);
  const prepared = prepareOffer(input);
  if (!prepared.ok) throw new CareerManagementStoreError(prepared.error);
  const offer = {
    id: randomUUID(),
    applicationId,
    ...prepared.value,
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

/** Changes an offer with the same fields that add it. Its status is kept. */
export function updateOffer(
  db: DatabaseSync,
  occupantId: string,
  offerId: string,
  input: JsonObject,
) {
  const current = db
    .prepare("SELECT application_id, status, created_at FROM offers WHERE id = ? AND occupant_id = ?")
    .get(offerId, occupantId) as
    | { application_id: string; status: string; created_at: string }
    | undefined;
  if (!current) throw new CareerManagementStoreError("not-found");
  const prepared = prepareOffer(input);
  if (!prepared.ok) throw new CareerManagementStoreError(prepared.error);
  db.prepare(
    `UPDATE offers SET summary = ?, decision_due_at = ? WHERE id = ? AND occupant_id = ?`,
  ).run(prepared.value.summary, prepared.value.decisionDueAt, offerId, occupantId);
  return {
    id: offerId,
    applicationId: current.application_id,
    ...prepared.value,
    status: current.status,
    createdAt: current.created_at,
  };
}

export function removeOffer(db: DatabaseSync, occupantId: string, offerId: string) {
  const removed = db
    .prepare("DELETE FROM offers WHERE id = ? AND occupant_id = ?")
    .run(offerId, occupantId);
  if (removed.changes !== 1) throw new CareerManagementStoreError("not-found");
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
  if (String(row.status) === "cancelled") {
    throw new CareerManagementStoreError("action-cancelled");
  }
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

/**
 * Cancels an action still waiting for approval. Its change set is withdrawn,
 * so it can never be approved; a completed action stays as it is.
 */
export function cancelExternalAction(db: DatabaseSync, occupantId: string, actionId: string) {
  const row = db
    .prepare("SELECT status, change_set_id, kind, destination FROM external_actions WHERE id = ? AND occupant_id = ?")
    .get(actionId, occupantId) as
    | { status: string; change_set_id: string; kind: string; destination: string }
    | undefined;
  if (!row) throw new CareerManagementStoreError("action-missing");
  if (row.status === "cancelled") return;
  if (row.status !== "proposed") throw new CareerManagementStoreError("action-not-pending");
  const now = new Date().toISOString();
  db.exec("BEGIN");
  try {
    db.prepare("UPDATE external_actions SET status = 'cancelled', completed_at = ? WHERE id = ?").run(
      now,
      actionId,
    );
    db.prepare("UPDATE change_sets SET status = 'withdrawn' WHERE id = ? AND status = 'proposed'").run(
      row.change_set_id,
    );
    insertAudit(db, {
      id: randomUUID(),
      occupantId,
      eventType: "external-action-cancelled",
      entityType: `external-${row.kind}`,
      entityId: actionId,
      changeSetId: row.change_set_id,
      approvalId: null,
      detail: { destination: row.destination },
      occurredAt: now,
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
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
    approvalId: string | null;
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

export class CareerManagementStoreError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
