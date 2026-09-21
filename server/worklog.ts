import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  hashChangeSet,
  prepareWorklogEntry,
  planWorklogFactChangeSet,
  proposeFactsFromWorklog,
  type ChangeSet,
  type WorklogEntry,
} from "../core/index";
import { approveCareerFactChange, saveEvidence } from "./career-memory";

type JsonObject = Record<string, unknown>;

export function captureWorklog(
  db: DatabaseSync,
  occupantId: string,
  input: JsonObject,
): WorklogEntry {
  const now = new Date().toISOString();
  const entry: WorklogEntry = {
    id: randomUUID(),
    occupantId,
    occurredOn: text(input.occurredOn) || now.slice(0, 10),
    title: text(input.title),
    content: text(input.content),
    roleId: text(input.roleId) || null,
    project: text(input.project),
    tags: stringArray(input.tags),
    createdAt: now,
  };
  const prepared = prepareWorklogEntry(entry);
  if (!prepared.ok) throw new WorklogStoreError(prepared.error);
  db.prepare(
    `INSERT INTO worklog_entries
      (id, occupant_id, occurred_on, title, content, role_id, project,
       tags_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    entry.id,
    occupantId,
    entry.occurredOn,
    entry.title,
    entry.content,
    entry.roleId,
    entry.project,
    JSON.stringify(entry.tags),
    entry.createdAt,
  );
  saveEvidence(db, occupantId, {
    sourceType: "worklog",
    sourceRef: entry.id,
    title: entry.title,
    content: {
      occurredOn: entry.occurredOn,
      content: entry.content,
      roleId: entry.roleId,
      project: entry.project,
      tags: entry.tags,
    },
  });
  return entry;
}

export function listWorklog(
  db: DatabaseSync,
  occupantId: string,
): WorklogEntry[] {
  return db
    .prepare(
      `SELECT id, occupant_id, occurred_on, title, content, role_id, project,
              tags_json, created_at
       FROM worklog_entries WHERE occupant_id = ?
       ORDER BY occurred_on DESC, created_at DESC`,
    )
    .all(occupantId)
    .map(mapWorklog);
}

export function listProposedChangeSets(
  db: DatabaseSync,
  occupantId: string,
): Array<{ id: string; purpose: string; createdAt: string }> {
  return db
    .prepare(
      `SELECT id, purpose, created_at AS createdAt
         FROM change_sets
        WHERE occupant_id = ? AND status = 'proposed'
        ORDER BY created_at DESC`,
    )
    .all(occupantId) as Array<{ id: string; purpose: string; createdAt: string }>;
}

export async function proposeWorklogChanges(
  db: DatabaseSync,
  occupantId: string,
  entryId: string,
): Promise<ChangeSet[]> {
  const entry = listWorklog(db, occupantId).find((item) => item.id === entryId);
  if (!entry) throw new WorklogStoreError("entry-missing");
  const evidence = db
    .prepare(
      `SELECT id FROM evidence
       WHERE occupant_id = ? AND source_type = 'worklog' AND source_ref = ?`,
    )
    .get(occupantId, entry.id) as { id: string } | undefined;
  if (!evidence) throw new WorklogStoreError("evidence-missing");
  const changeSet = planWorklogFactChangeSet({
    id: randomUUID(),
    occupantId,
    entryTitle: entry.title,
    evidenceId: evidence.id,
    proposals: proposeFactsFromWorklog(entry),
    createdAt: new Date().toISOString(),
  });
  if (!changeSet) return [];
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
  return [changeSet];
}

export async function approveWorklogChanges(
  db: DatabaseSync,
  occupantId: string,
  changeSetIds: string[],
) {
  const results = [];
  for (const id of [...new Set(changeSetIds)]) {
    results.push(await approveCareerFactChange(db, occupantId, id));
  }
  return results;
}

function mapWorklog(row: unknown): WorklogEntry {
  const value = row as JsonObject;
  return {
    id: String(value.id),
    occupantId: String(value.occupant_id),
    occurredOn: String(value.occurred_on),
    title: String(value.title),
    content: String(value.content),
    roleId: value.role_id ? String(value.role_id) : null,
    project: String(value.project),
    tags: JSON.parse(String(value.tags_json)),
    createdAt: String(value.created_at),
  };
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : typeof value === "string"
      ? value.split(",").map((item) => item.trim()).filter(Boolean)
      : [];
}

export class WorklogStoreError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
