export type CommandSpeaker = "occupant" | "proforna";

export type CommandSession = {
  id: string;
  occupantId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type CommandMessage = {
  id: string;
  occupantId: string;
  sessionId: string;
  speaker: CommandSpeaker;
  body: string;
  agentRunId: string | null;
  createdAt: string;
};

export type CommandSessionError = "session-required" | "body-required";

const DEFAULT_TITLE = "New conversation";
const TITLE_LIMIT = 48;
const HISTORY_LIMIT = 12;

export function prepareCommandSession(
  session: CommandSession,
):
  | { ok: true; value: CommandSession }
  | { ok: false; error: CommandSessionError } {
  if (!session.occupantId.trim()) {
    return { ok: false, error: "session-required" };
  }
  const title = session.title.trim() || DEFAULT_TITLE;
  return {
    ok: true,
    value: {
      ...session,
      occupantId: session.occupantId.trim(),
      title,
    },
  };
}

export function prepareCommandMessage(
  message: CommandMessage,
):
  | { ok: true; value: CommandMessage }
  | { ok: false; error: CommandSessionError } {
  if (!message.sessionId.trim()) {
    return { ok: false, error: "session-required" };
  }
  const body = message.body.trim();
  if (!body) return { ok: false, error: "body-required" };
  if (message.speaker !== "occupant" && message.speaker !== "proforna") {
    return { ok: false, error: "body-required" };
  }
  return {
    ok: true,
    value: {
      ...message,
      sessionId: message.sessionId.trim(),
      occupantId: message.occupantId.trim(),
      body,
    },
  };
}

export function titleFromOccupantTurn(body: string): string {
  const text = body.trim().replace(/\s+/g, " ");
  if (!text) return DEFAULT_TITLE;
  if (text.length <= TITLE_LIMIT) return text;
  return `${text.slice(0, TITLE_LIMIT - 1).trimEnd()}…`;
}

export function presentCommandHistory(
  messages: Array<{ speaker: CommandSpeaker; body: string }>,
): string {
  return messages
    .slice(-HISTORY_LIMIT)
    .map((message) => `[${message.speaker}] ${message.body}`)
    .join("\n");
}
