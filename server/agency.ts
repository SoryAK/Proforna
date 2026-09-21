import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  EXTRACT_FACTS_SYSTEM_PROMPT,
  INSPECT_SYSTEM_PROMPT,
  parseExtractedWorklogFacts,
  planAgentRun,
  type AgentRun,
  type ChangeSet,
} from "../core/index";
import { loadLatestModelConnection } from "./models";
import {
  completeOpenAiChat,
  isAbortError,
  type CompleteFn,
} from "./openai-compat";
import { listWorklog, persistWorklogFactProposals, WorklogStoreError } from "./worklog";

type JsonObject = Record<string, unknown>;

const activeOccupantRuns = new Set<string>();

export type AgencyChangeSetSummary = {
  id: string;
  purpose: string;
  destination: string;
};

export type AgencyRunResult = {
  run: AgentRun & {
    answer: string | null;
    model: string | null;
    changeSet: AgencyChangeSetSummary | null;
  };
};

export async function runAgency(
  db: DatabaseSync,
  occupantId: string,
  input: JsonObject,
  complete: CompleteFn = completeOpenAiChat,
  signal?: AbortSignal,
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
  if (activeOccupantRuns.has(occupantId)) {
    throw new AgencyStoreError("model-busy");
  }

  const scope = planned.value.scope;
  const entry = listWorklog(db, occupantId).find((item) => item.id === scope.id);
  if (!entry) throw new AgencyStoreError("entry-missing");

  activeOccupantRuns.add(occupantId);
  insertRun(db, planned.value, {
    purpose: planned.value.purpose,
    scope: planned.value.scope,
    grant: planned.value.grant,
    hosting: connection.hosting,
    model: connection.model,
  });

  const prompt =
    planned.value.purpose === "extract-facts"
      ? EXTRACT_FACTS_SYSTEM_PROMPT
      : INSPECT_SYSTEM_PROMPT;
  const local = connection.hosting === "local";

  let reply: { text: string; model: string };
  try {
    reply = await complete({
      baseUrl: connection.baseUrl,
      apiKey: connection.apiKey,
      model: connection.model,
      messages: [
        { role: "system", content: prompt },
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
      signal,
      jsonObject: planned.value.purpose === "extract-facts",
      keepAlive: local ? 0 : undefined,
      contextTokens: local ? 8192 : undefined,
    });
  } catch (error) {
    const failed: AgentRun = {
      ...planned.value,
      status: "failed",
      completedAt: new Date().toISOString(),
    };
    finishRun(db, failed, {
      kind: "error",
      message:
        error instanceof Error ? error.message : "The model could not finish this.",
    });
    throw new AgencyStoreError(
      isAbortError(error) ? "model-cancelled" : "model-failed",
    );
  } finally {
    activeOccupantRuns.delete(occupantId);
  }

  const completed: AgentRun = {
    ...planned.value,
    status: "completed",
    completedAt: new Date().toISOString(),
  };

  if (planned.value.purpose === "extract-facts") {
    const proposals = parseExtractedWorklogFacts(reply.text, entry);
    let changeSet: ChangeSet | null;
    try {
      changeSet = await persistWorklogFactProposals(
        db,
        occupantId,
        entry.id,
        proposals,
      );
    } catch (error) {
      const failed: AgentRun = {
        ...planned.value,
        status: "failed",
        completedAt: new Date().toISOString(),
      };
      finishRun(db, failed, {
        kind: "error",
        message:
          error instanceof Error ? error.message : "Could not record the Change Set.",
      });
      if (error instanceof WorklogStoreError) {
        throw new AgencyStoreError(error.code);
      }
      throw error;
    }
    finishRun(db, completed, {
      kind: "change-set",
      changeSetId: changeSet?.id ?? null,
      model: reply.model,
    });
    return {
      run: {
        ...completed,
        answer: null,
        model: reply.model,
        changeSet: summarizeChangeSet(changeSet),
      },
    };
  }

  finishRun(db, completed, {
    kind: "answer",
    text: reply.text,
    model: reply.model,
  });
  return {
    run: {
      ...completed,
      answer: reply.text,
      model: reply.model,
      changeSet: null,
    },
  };
}

function summarizeChangeSet(
  changeSet: ChangeSet | null,
): AgencyChangeSetSummary | null {
  if (!changeSet) return null;
  return {
    id: changeSet.id,
    purpose: changeSet.purpose,
    destination: changeSet.destination,
  };
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
