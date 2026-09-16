import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  prepareModelConnection,
  type ModelConnectionInput,
  type ModelHosting,
} from "../core/model-connection";

export type PublicModelConnection = {
  id: string;
  hosting: ModelHosting;
  baseUrl: string;
  model: string;
  hasKey: boolean;
};

export class ModelConnectionError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

export function saveModelConnection(
  db: DatabaseSync,
  occupantId: string,
  input: ModelConnectionInput,
): PublicModelConnection {
  const prepared = prepareModelConnection(input);
  if (!prepared.ok) {
    throw new ModelConnectionError(prepared.error);
  }
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO model_connections
      (id, occupant_id, hosting, base_url, model, api_key, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    occupantId,
    prepared.value.hosting,
    prepared.value.baseUrl,
    prepared.value.model,
    prepared.value.apiKey,
    now,
  );
  return {
    id,
    hosting: prepared.value.hosting,
    baseUrl: prepared.value.baseUrl,
    model: prepared.value.model,
    hasKey: Boolean(prepared.value.apiKey),
  };
}

export type PrivateModelConnection = {
  id: string;
  hosting: ModelHosting;
  baseUrl: string;
  model: string;
  apiKey: string | null;
};

export function loadLatestModelConnection(
  db: DatabaseSync,
  occupantId: string,
): PrivateModelConnection | null {
  const row = db
    .prepare(
      `SELECT id, hosting, base_url AS baseUrl, model, api_key AS apiKey
       FROM model_connections
       WHERE occupant_id = ?
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .get(occupantId) as PrivateModelConnection | undefined;
  return row ?? null;
}

export function listModelConnections(
  db: DatabaseSync,
  occupantId: string,
): PublicModelConnection[] {
  const rows = db
    .prepare(
      `SELECT id, hosting, base_url AS baseUrl, model, api_key AS apiKey
       FROM model_connections
       WHERE occupant_id = ?
       ORDER BY created_at ASC`,
    )
    .all(occupantId) as Array<{
    id: string;
    hosting: ModelHosting;
    baseUrl: string;
    model: string;
    apiKey: string | null;
  }>;
  return rows.map((row) => ({
    id: row.id,
    hosting: row.hosting,
    baseUrl: row.baseUrl,
    model: row.model,
    hasKey: Boolean(row.apiKey),
  }));
}
