import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  buildResumeRevision,
  prepareResumeVariant,
  type ResumeRevision,
  type ResumeVariant,
} from "../core/index";
import { backfillCareerMemory, readCareerMemory } from "./career-memory";

type JsonObject = Record<string, unknown>;

export function listResumeVariants(
  db: DatabaseSync,
  occupantId: string,
): Array<ResumeVariant & { revisions: ResumeRevision[] }> {
  const variants = db
    .prepare(
      `SELECT id, occupant_id, name, target_role, audience, intent,
              selected_fact_ids_json, created_at
       FROM resume_variants WHERE occupant_id = ? ORDER BY updated_at DESC`,
    )
    .all(occupantId)
    .map(mapVariant);
  return variants.map((variant) => ({
    ...variant,
    revisions: db
      .prepare(
        `SELECT revision_json FROM resume_revisions
         WHERE variant_id = ? AND occupant_id = ?
         ORDER BY revision_number DESC`,
      )
      .all(variant.id, occupantId)
      .map((row) =>
        JSON.parse(String((row as JsonObject).revision_json)) as ResumeRevision,
      ),
  }));
}

export function createResumeVariant(
  db: DatabaseSync,
  occupantId: string,
  input: JsonObject,
): ResumeVariant {
  backfillCareerMemory(db, occupantId);
  const allFacts = readCareerMemory(db, occupantId).facts.filter(
    (fact) => fact.status === "canonical",
  );
  const selected = stringArray(input.selectedFactIds);
  const now = new Date().toISOString();
  const variant: ResumeVariant = {
    id: randomUUID(),
    occupantId,
    name: text(input.name),
    targetRole: text(input.targetRole),
    audience: text(input.audience),
    intent: text(input.intent),
    selectedFactIds:
      selected.length > 0 ? selected : allFacts.map((fact) => fact.id),
    createdAt: now,
  };
  const prepared = prepareResumeVariant(variant);
  if (!prepared.ok) throw new ResumeStudioStoreError(prepared.error);
  db.prepare(
    `INSERT INTO resume_variants
      (id, occupant_id, name, target_role, audience, intent,
       selected_fact_ids_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    variant.id,
    occupantId,
    prepared.value.name,
    prepared.value.targetRole,
    prepared.value.audience,
    prepared.value.intent,
    JSON.stringify(prepared.value.selectedFactIds),
    now,
    now,
  );
  return prepared.value;
}

export function createResumeRevision(
  db: DatabaseSync,
  occupantId: string,
  variantId: string,
): ResumeRevision {
  const variant = listResumeVariants(db, occupantId).find(
    (item) => item.id === variantId,
  );
  if (!variant) throw new ResumeStudioStoreError("variant-missing");
  const revisionNumber = variant.revisions.length + 1;
  const result = buildResumeRevision({
    id: randomUUID(),
    variant,
    revisionNumber,
    facts: readCareerMemory(db, occupantId).facts,
    createdAt: new Date().toISOString(),
  });
  if (!result.ok) {
    throw new ResumeStudioStoreError(
      result.factId ? `${result.error}:${result.factId}` : result.error,
    );
  }
  db.prepare(
    `INSERT INTO resume_revisions
      (id, occupant_id, variant_id, revision_number, revision_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    result.value.id,
    occupantId,
    variantId,
    revisionNumber,
    JSON.stringify(result.value),
    result.value.createdAt,
  );
  db.prepare(
    "UPDATE resume_variants SET updated_at = ? WHERE id = ? AND occupant_id = ?",
  ).run(result.value.createdAt, variantId, occupantId);
  return result.value;
}

export function readResumeRevision(
  db: DatabaseSync,
  occupantId: string,
  revisionId: string,
): ResumeRevision | null {
  const row = db
    .prepare(
      `SELECT revision_json FROM resume_revisions
       WHERE id = ? AND occupant_id = ?`,
    )
    .get(revisionId, occupantId) as JsonObject | undefined;
  return row
    ? (JSON.parse(String(row.revision_json)) as ResumeRevision)
    : null;
}

function mapVariant(row: unknown): ResumeVariant {
  const value = row as JsonObject;
  return {
    id: String(value.id),
    occupantId: String(value.occupant_id),
    name: String(value.name),
    targetRole: String(value.target_role),
    audience: String(value.audience),
    intent: String(value.intent),
    selectedFactIds: JSON.parse(String(value.selected_fact_ids_json)),
    createdAt: String(value.created_at),
  };
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export class ResumeStudioStoreError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
