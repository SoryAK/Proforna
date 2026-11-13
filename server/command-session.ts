import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  prepareCommandMessage,
  prepareCommandSession,
  prepareCommandSessionChange,
  prepareCommandSessionRemoval,
  presentCommandRoles,
  titleFromOccupantTurn,
  type CommandMessage,
  type CommandRoleContext,
  type CommandSession,
  type CommandSpeaker,
} from "../core/index";
import { runAgency, AgencyStoreError } from "./agency";
import type { CompleteFn } from "./openai-compat";

type JsonObject = Record<string, unknown>;

export function listCommandSessions(
  db: DatabaseSync,
  occupantId: string,
): CommandSession[] {
  return db
    .prepare(
      `SELECT id, occupant_id, title, created_at, updated_at
         FROM command_sessions
        WHERE occupant_id = ?
        ORDER BY updated_at DESC, id DESC`,
    )
    .all(occupantId)
    .map(mapSession);
}

export function createCommandSession(
  db: DatabaseSync,
  occupantId: string,
): CommandSession {
  const now = new Date().toISOString();
  const planned = prepareCommandSession({
    id: randomUUID(),
    occupantId,
    title: "",
    createdAt: now,
    updatedAt: now,
  });
  if (!planned.ok) throw new CommandSessionStoreError(planned.error);
  db.prepare(
    `INSERT INTO command_sessions
      (id, occupant_id, title, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    planned.value.id,
    occupantId,
    planned.value.title,
    planned.value.createdAt,
    planned.value.updatedAt,
  );
  return planned.value;
}

export function updateCommandSession(
  db: DatabaseSync,
  occupantId: string,
  sessionId: string,
  title: string,
): CommandSession {
  const session = loadSession(db, occupantId, sessionId);
  const planned = prepareCommandSessionChange(session, title);
  if (!planned.ok) throw new CommandSessionStoreError(planned.error);
  db.prepare(
    `UPDATE command_sessions
        SET title = ?
      WHERE id = ? AND occupant_id = ?`,
  ).run(planned.value.title, session.id, occupantId);
  return loadSession(db, occupantId, session.id);
}

export function deleteCommandSession(
  db: DatabaseSync,
  occupantId: string,
  sessionId: string,
): void {
  const planned = prepareCommandSessionRemoval({ occupantId, sessionId });
  if (!planned.ok) throw new CommandSessionStoreError(planned.error);
  const session = loadSession(db, occupantId, planned.value.sessionId);
  db.exec("BEGIN");
  try {
    db.prepare(
      `DELETE FROM command_messages
        WHERE occupant_id = ? AND session_id = ?`,
    ).run(occupantId, session.id);
    db.prepare(
      `DELETE FROM command_sessions
        WHERE id = ? AND occupant_id = ?`,
    ).run(session.id, occupantId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function readCommandSession(
  db: DatabaseSync,
  occupantId: string,
  sessionId: string,
): { session: CommandSession; messages: CommandMessage[] } {
  const session = loadSession(db, occupantId, sessionId);
  const messages = db
    .prepare(
      `SELECT id, occupant_id, session_id, speaker, body, agent_run_id, created_at
         FROM command_messages
        WHERE occupant_id = ? AND session_id = ?
        ORDER BY created_at ASC, rowid ASC`,
    )
    .all(occupantId, session.id)
    .map(mapMessage);
  return { session, messages };
}

export async function sendCommandTurn(
  db: DatabaseSync,
  occupantId: string,
  sessionId: string,
  input: JsonObject,
  complete?: CompleteFn,
  signal?: AbortSignal,
): Promise<{ session: CommandSession; messages: CommandMessage[] }> {
  const session = loadSession(db, occupantId, sessionId);
  const prior = readCommandSession(db, occupantId, session.id).messages;
  const accepted = prepareCommandMessage({
    id: randomUUID(),
    occupantId,
    sessionId: session.id,
    speaker: "occupant",
    body: typeof input.body === "string" ? input.body : "",
    agentRunId: null,
    createdAt: new Date().toISOString(),
  });
  if (!accepted.ok) throw new CommandSessionStoreError(accepted.error);
  const body = accepted.value.body;
  const roleNote = presentCommandRoles(parseCommandRoles(input.roles));
  const result = await runAgency(
    db,
    occupantId,
    {
      purpose: "command",
      scope: { type: "home" },
      prompt: roleNote ? `${body}\n\n${roleNote}` : body,
      grant: input.grant,
      sessionId: session.id,
      history: prior.map((message) => ({
        speaker: message.speaker,
        body: message.body,
      })),
    },
    complete,
    signal,
  );
  const now = new Date().toISOString();
  const occupantTurn = persistMessage(db, occupantId, {
    id: randomUUID(),
    occupantId,
    sessionId: session.id,
    speaker: "occupant",
    body,
    agentRunId: result.run.id,
    createdAt: now,
  });
  const answer = (result.run.answer ?? "").trim();
  if (answer) {
    persistMessage(db, occupantId, {
      id: randomUUID(),
      occupantId,
      sessionId: session.id,
      speaker: "proforna",
      body: answer,
      agentRunId: result.run.id,
      createdAt: new Date().toISOString(),
    });
  }
  const stored = loadSession(db, occupantId, session.id);
  const title =
    stored.title === "New conversation"
      ? titleFromOccupantTurn(occupantTurn.body)
      : stored.title;
  db.prepare(
    `UPDATE command_sessions
        SET title = ?, updated_at = ?
      WHERE id = ? AND occupant_id = ?`,
  ).run(title, occupantTurn.createdAt, session.id, occupantId);
  return readCommandSession(db, occupantId, session.id);
}

function parseCommandRoles(value: unknown): CommandRoleContext[] {
  if (!Array.isArray(value)) return [];
  const roles: CommandRoleContext[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    roles.push({
      organization: typeof record.organization === "string" ? record.organization : "",
      title: typeof record.title === "string" ? record.title : "",
      startDate: typeof record.startDate === "string" ? record.startDate : "",
      endDate: typeof record.endDate === "string" ? record.endDate : "",
      isCurrent: record.isCurrent === true,
    });
  }
  return roles;
}

function persistMessage(
  db: DatabaseSync,
  occupantId: string,
  message: CommandMessage,
): CommandMessage {
  const planned = prepareCommandMessage(message);
  if (!planned.ok) throw new CommandSessionStoreError(planned.error);
  db.prepare(
    `INSERT INTO command_messages
      (id, occupant_id, session_id, speaker, body, agent_run_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    planned.value.id,
    occupantId,
    planned.value.sessionId,
    planned.value.speaker,
    planned.value.body,
    planned.value.agentRunId,
    planned.value.createdAt,
  );
  return planned.value;
}

function loadSession(
  db: DatabaseSync,
  occupantId: string,
  sessionId: string,
): CommandSession {
  const row = db
    .prepare(
      `SELECT id, occupant_id, title, created_at, updated_at
         FROM command_sessions
        WHERE id = ? AND occupant_id = ?`,
    )
    .get(sessionId, occupantId);
  if (!row) throw new CommandSessionStoreError("session-missing");
  return mapSession(row);
}

function mapSession(row: unknown): CommandSession {
  const record = row as {
    id: string;
    occupant_id: string;
    title: string;
    created_at: string;
    updated_at: string;
  };
  return {
    id: record.id,
    occupantId: record.occupant_id,
    title: record.title,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

function mapMessage(row: unknown): CommandMessage {
  const record = row as {
    id: string;
    occupant_id: string;
    session_id: string;
    speaker: CommandSpeaker;
    body: string;
    agent_run_id: string | null;
    created_at: string;
  };
  return {
    id: record.id,
    occupantId: record.occupant_id,
    sessionId: record.session_id,
    speaker: record.speaker,
    body: record.body,
    agentRunId: record.agent_run_id,
    createdAt: record.created_at,
  };
}

export class CommandSessionStoreError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
