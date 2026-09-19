import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type {
  IntegrationConnection,
  IntegrationKind,
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
  const kind = parseKind(input.kind);
  const label = text(input.label);
  if (!label) throw new IntegrationStoreError("label-required");
  const config = isObject(input.config) ? input.config : {};
  if (
    Object.keys(config).some((key) =>
      /password|secret|api.?key|access.?token|refresh.?token/i.test(key),
    )
  ) {
    throw new IntegrationStoreError("secret-not-allowed");
  }
  const connection: IntegrationConnection = {
    id: randomUUID(),
    occupantId,
    kind,
    label,
    config,
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

function parseKind(value: unknown): IntegrationKind {
  if (value === "calendar" || value === "email" || value === "job-board") {
    return value;
  }
  throw new IntegrationStoreError("kind-invalid");
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export class IntegrationStoreError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
