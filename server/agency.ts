import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  INSPECT_SYSTEM_PROMPT,
  planAgentRun,
  type AgentRun,
} from "../core/index";
import { loadLatestModelConnection } from "./models";
import { completeOpenAiChat, type CompleteFn } from "./openai-compat";
import { listWorklog } from "./worklog";

type JsonObject = Record<string, unknown>;

export type AgencyRunResult = {
  run: AgentRun & {
    answer: string | null;
    model: string | null;
  };
};

export async function runAgency(
  db: DatabaseSync,
  occupantId: string,
  input: JsonObject,
  complete: CompleteFn = completeOpenAiChat,
): Promise<AgencyRunResult> {
  const connection = loadLatestModelConnection(db, occupantId);
  const now = new Date().toISOString();
  const planned = planAgentRun({
    id: randomUUID(),
    occupantId,
    purpose: input.purpose,
    scope: input.scope,
    grant: input.grant,
    hosting: connection?.hosting ?? null,
    now,
  });
  if (!planned.ok) throw new AgencyStoreError(planned.error);
  if (!connection) throw new AgencyStoreError("model-missing");

  const scope = planned.value.scope;
  const entry = listWorklog(db, occupantId).find((item) => item.id === scope.id);
  if (!entry) throw new AgencyStoreError("entry-missing");

  insertRun(db, planned.value, {
    purpose: planned.value.purpose,
    scope: planned.value.scope,
    grant: planned.value.grant,
    hosting: connection.hosting,
    model: connection.model,
  });

  try {
    const reply = await complete({
      baseUrl: connection.baseUrl,
      apiKey: connection.apiKey,
      model: connection.model,
      messages: [
        { role: "system", content: INSPECT_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            `Worklog title: ${entry.title}`,
            `Occurred on: ${entry.occurredOn}`,
            entry.project ? `Project: ${entry.project}` : "",
            entry.content,
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
    });
    const completed: AgentRun = {
      ...planned.value,
      status: "completed",
      completedAt: new Date().toISOString(),
    };
    finishRun(db, completed, { kind: "answer", text: reply.text, model: reply.model });
    return {
      run: { ...completed, answer: reply.text, model: reply.model },
    };
  } catch (error) {
    const failed: AgentRun = {
      ...planned.value,
      status: "failed",
      completedAt: new Date().toISOString(),
    };
    finishRun(db, failed, {
      kind: "error",
      message: error instanceof Error ? error.message : "The model could not inspect this.",
    });
    throw new AgencyStoreError("model-failed");
  }
}

function insertRun(
  db: DatabaseSync,
  run: AgentRun,
  inputs: JsonObject,
) {
  db.prepare(
    `INSERT INTO agent_runs
      (id, occupant_id, purpose, capability_grant_json, inputs_json, outputs_json,
       status, created_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    run.id,
    run.occupantId,
    run.purpose,
    JSON.stringify(run.grant),
    JSON.stringify(inputs),
    "{}",
    run.status,
    run.createdAt,
    run.completedAt,
  );
}

function finishRun(db: DatabaseSync, run: AgentRun, outputs: JsonObject) {
  db.prepare(
    `UPDATE agent_runs
        SET status = ?, outputs_json = ?, completed_at = ?
      WHERE id = ? AND occupant_id = ?`,
  ).run(
    run.status,
    JSON.stringify(outputs),
    run.completedAt,
    run.id,
    run.occupantId,
  );
}

export class AgencyStoreError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
