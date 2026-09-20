import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  authorizeChangeSet,
  createApproval,
  hashChangeSet,
  type Approval,
  type AuditEvent,
  type ChangeOperation,
  type ChangeSet,
} from "../core/index";

export async function mintOccupantApproval(
  occupantId: string,
  input: {
    purpose: string;
    destination: string;
    operations: ChangeOperation[];
    now: string;
  },
): Promise<{ changeSet: ChangeSet; hash: string; approval: Approval }> {
  const changeSet: ChangeSet = {
    id: randomUUID(),
    occupantId,
    purpose: input.purpose,
    destination: input.destination,
    operations: input.operations,
    createdAt: input.now,
  };
  const hash = await hashChangeSet(changeSet);
  const approval = await createApproval(changeSet, {
    id: randomUUID(),
    approvedBy: occupantId,
    approvedAt: input.now,
  });
  const authorized = await authorizeChangeSet(changeSet, approval, input.now);
  if (!authorized.ok) throw new OccupantChangeError(authorized.error);
  return { changeSet, hash, approval };
}

export function persistApprovedChange(
  db: DatabaseSync,
  changeSet: ChangeSet,
  hash: string,
  approval: Approval,
  status: "proposed" | "committed" = "committed",
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

export function persistAuditEvent(db: DatabaseSync, event: AuditEvent) {
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

export class OccupantChangeError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
