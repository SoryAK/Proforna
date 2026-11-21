import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  prepareIntegration,
  type IntegrationConnection,
  type IntegrationKind,
} from "../core/index";

type JsonObject = Record<string, unknown>;

export type CareerIntegrationAdapter = {
  kind: IntegrationKind;
  test(config: Record<string, unknown>): Promise<{ ok: boolean; message: string }>;
};

export function listIntegrations(
  db: DatabaseSync,
  occupantId: string,
): IntegrationConnection[] {
  return (
    db
      .prepare(
        `SELECT id, occupant_id, kind, label, config_json, status, created_at
         FROM integration_connections WHERE occupant_id = ?
         ORDER BY created_at DESC`,
      )
      .all(occupantId) as JsonObject[]
  ).map((row) => ({
    id: String(row.id),
    occupantId: String(row.occupant_id),
    kind: row.kind as IntegrationKind,
    label: String(row.label),
    config: JSON.parse(String(row.config_json)),
    status: row.status as IntegrationConnection["status"],
    createdAt: String(row.created_at),
  }));
}

export function saveIntegration(
  db: DatabaseSync,
  occupantId: string,
  input: JsonObject,
): IntegrationConnection {
  const prepared = prepareIntegration(input);
  if (!prepared.ok) throw new IntegrationStoreError(prepared.error);
  const connection: IntegrationConnection = {
    id: randomUUID(),
    occupantId,
    ...prepared.value,
    status: "configured",
    createdAt: new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO integration_connections
      (id, occupant_id, kind, label, config_json, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    connection.id,
    occupantId,
    connection.kind,
    connection.label,
    JSON.stringify(connection.config),
    connection.status,
    connection.createdAt,
  );
  return connection;
}

/** Changes an integration with the same fields that add it. */
export function updateIntegration(
  db: DatabaseSync,
  occupantId: string,
  integrationId: string,
  input: JsonObject,
): IntegrationConnection {
  const current = db
    .prepare(
      "SELECT status, created_at FROM integration_connections WHERE id = ? AND occupant_id = ?",
    )
    .get(integrationId, occupantId) as
    | { status: IntegrationConnection["status"]; created_at: string }
    | undefined;
  if (!current) throw new IntegrationStoreError("not-found");
  const prepared = prepareIntegration(input);
  if (!prepared.ok) throw new IntegrationStoreError(prepared.error);
  db.prepare(
    `UPDATE integration_connections SET kind = ?, label = ?, config_json = ?
      WHERE id = ? AND occupant_id = ?`,
  ).run(
    prepared.value.kind,
    prepared.value.label,
    JSON.stringify(prepared.value.config),
    integrationId,
    occupantId,
  );
  return {
    id: integrationId,
    occupantId,
    ...prepared.value,
    status: current.status,
    createdAt: current.created_at,
  };
}

export function removeIntegration(
  db: DatabaseSync,
  occupantId: string,
  integrationId: string,
): void {
  const removed = db
    .prepare("DELETE FROM integration_connections WHERE id = ? AND occupant_id = ?")
    .run(integrationId, occupantId);
  if (removed.changes !== 1) throw new IntegrationStoreError("not-found");
}

export class IntegrationStoreError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
