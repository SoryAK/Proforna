import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  COMMAND_SYSTEM_PROMPT,
  EXTRACT_FACTS_SYSTEM_PROMPT,
  INSPECT_SYSTEM_PROMPT,
  SUGGEST_REPLY_SYSTEM_PROMPT,
  parseExtractedWorklogFacts,
  parseSuggestedReply,
  planAgentRun,
  presentCommandHistory,
  type AgentRun,
  type ChangeSet,
  type CommandSpeaker,
} from "../core/index";
import { loadLatestModelConnection } from "./models";
import {
  completeOpenAiChat,
  isAbortError,
  type CompleteFn,
} from "./openai-compat";
import { persistSuggestedReply, readContactThread, ConversationStoreError } from "./conversation";
import { readProfile } from "./occupant";
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

  const occupantPrompt =
    typeof input.prompt === "string" ? input.prompt.trim() : "";
  if (planned.value.purpose === "command" && !occupantPrompt) {
    throw new AgencyStoreError("prompt-required");
  }
  const history = parseCommandHistory(input.history);
  const context = loadRunContext(
    db,
    occupantId,
    planned.value,
    occupantPrompt,
    history,
  );
  if (!context.ok) throw new AgencyStoreError(context.error);

  activeOccupantRuns.add(occupantId);
  insertRun(db, planned.value, {
    purpose: planned.value.purpose,
    scope: planned.value.scope,
    grant: planned.value.grant,
    hosting: connection.hosting,
    model: connection.model,
    prompt: occupantPrompt || undefined,
  });

  const local = connection.hosting === "local";

  let reply: { text: string; model: string };
  try {
    reply = await complete({
      baseUrl: connection.baseUrl,
      apiKey: connection.apiKey,
      model: connection.model,
      messages: [
        { role: "system", content: context.prompt },
        { role: "user", content: context.userContent },
      ],
      signal,
      jsonObject: context.jsonObject,
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

  const scope = planned.value.scope;
  if (planned.value.purpose === "extract-facts" && scope.type === "worklog") {
    const entry = listWorklog(db, occupantId).find(
      (item) => item.id === scope.id,
    );
    if (!entry) throw new AgencyStoreError("entry-missing");
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

  if (
    planned.value.purpose === "suggest-reply" &&
    planned.value.scope.type === "contact"
  ) {
    const body = parseSuggestedReply(reply.text);
    let changeSet: ChangeSet | null;
    try {
      changeSet = await persistSuggestedReply(
        db,
        occupantId,
        planned.value.scope.id,
        body,
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
          error instanceof Error ? error.message : "Could not record the draft.",
      });
      if (error instanceof ConversationStoreError) {
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

function loadRunContext(
  db: DatabaseSync,
  occupantId: string,
  run: AgentRun,
  occupantPrompt: string,
  history: Array<{ speaker: CommandSpeaker; body: string }>,
):
  | { ok: true; prompt: string; userContent: string; jsonObject: boolean }
  | { ok: false; error: string } {
  const scope = run.scope;
  if (scope.type === "home") {
    return {
      ok: true,
      prompt: COMMAND_SYSTEM_PROMPT,
      jsonObject: false,
      userContent: homeVaultGist(db, occupantId, occupantPrompt, history),
    };
  }
  if (scope.type === "contact") {
    try {
      const thread = readContactThread(db, occupantId, scope.id);
      return {
        ok: true,
        prompt: SUGGEST_REPLY_SYSTEM_PROMPT,
        jsonObject: true,
        userContent: [
          `Contact: ${thread.contact.name}`,
          thread.contact.email ? `Email: ${thread.contact.email}` : "",
          "Thread:",
          ...thread.messages.map(
            (message) =>
              `[${message.direction}] ${message.body}`,
          ),
        ]
          .filter(Boolean)
          .join("\n"),
      };
    } catch {
      return { ok: false, error: "contact-missing" };
    }
  }
  if (scope.type !== "worklog") {
    return { ok: false, error: "scope-required" };
  }
  const entry = listWorklog(db, occupantId).find(
    (item) => item.id === scope.id,
  );
  if (!entry) return { ok: false, error: "entry-missing" };
  return {
    ok: true,
    prompt:
      run.purpose === "extract-facts"
        ? EXTRACT_FACTS_SYSTEM_PROMPT
        : INSPECT_SYSTEM_PROMPT,
    jsonObject: run.purpose === "extract-facts",
    userContent: [
      `Worklog title: ${entry.title}`,
      `Occurred on: ${entry.occurredOn}`,
      entry.project ? `Project: ${entry.project}` : "",
      entry.content,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

function homeVaultGist(
  db: DatabaseSync,
  occupantId: string,
  prompt: string,
  history: Array<{ speaker: CommandSpeaker; body: string }>,
): string {
  const profile = readProfile(db, occupantId);
  const worklog = listWorklog(db, occupantId).slice(0, 5);
  const contacts = db
    .prepare(
      `SELECT name FROM contacts WHERE occupant_id = ? ORDER BY created_at DESC LIMIT 8`,
    )
    .all(occupantId) as Array<{ name: string }>;
  const conversation = presentCommandHistory(history);
  return [
    `Occupant: ${profile.fullName || "unnamed"}`,
    profile.headline ? `Headline: ${profile.headline}` : "",
    worklog.length
      ? `Recent Worklog: ${worklog.map((entry) => entry.title).join("; ")}`
      : "Recent Worklog: none",
    contacts.length
      ? `My Network: ${contacts.map((contact) => contact.name).join("; ")}`
      : "My Network: none",
    conversation ? `Conversation:\n${conversation}` : "",
    `Command: ${prompt}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function parseCommandHistory(
  value: unknown,
): Array<{ speaker: CommandSpeaker; body: string }> {
  if (!Array.isArray(value)) return [];
  const rows: Array<{ speaker: CommandSpeaker; body: string }> = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const speaker: CommandSpeaker | null =
      record.speaker === "proforna"
        ? "proforna"
        : record.speaker === "occupant"
          ? "occupant"
          : null;
    const body = typeof record.body === "string" ? record.body.trim() : "";
    if (!speaker || !body) continue;
    rows.push({ speaker, body });
  }
  return rows;
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
