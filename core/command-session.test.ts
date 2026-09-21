import { describe, expect, it } from "vitest";
import {
  prepareCommandMessage,
  prepareCommandSession,
  presentCommandHistory,
  titleFromOccupantTurn,
} from "./command-session";

describe("command session", () => {
  it("requires an occupant before opening a session", () => {
    expect(
      prepareCommandSession({
        id: "session-1",
        occupantId: "  ",
        title: "",
        createdAt: "2026-09-21T15:00:00.000Z",
        updatedAt: "2026-09-21T15:00:00.000Z",
      }),
    ).toEqual({ ok: false, error: "session-required" });
  });

  it("names an empty session New conversation", () => {
    expect(
      prepareCommandSession({
        id: "session-1",
        occupantId: "local",
        title: "  ",
        createdAt: "2026-09-21T15:00:00.000Z",
        updatedAt: "2026-09-21T15:00:00.000Z",
      }),
    ).toMatchObject({
      ok: true,
      value: { title: "New conversation" },
    });
  });

  it("requires a session and a body on each turn", () => {
    expect(
      prepareCommandMessage({
        id: "msg-1",
        occupantId: "local",
        sessionId: "",
        speaker: "occupant",
        body: "What should I capture next?",
        agentRunId: null,
        createdAt: "2026-09-21T15:00:00.000Z",
      }),
    ).toEqual({ ok: false, error: "session-required" });
    expect(
      prepareCommandMessage({
        id: "msg-1",
        occupantId: "local",
        sessionId: "session-1",
        speaker: "occupant",
        body: "  ",
        agentRunId: null,
        createdAt: "2026-09-21T15:00:00.000Z",
      }),
    ).toEqual({ ok: false, error: "body-required" });
  });

  it("titles a session from the first occupant turn", () => {
    expect(titleFromOccupantTurn("  What should I capture next?  ")).toBe(
      "What should I capture next?",
    );
    expect(
      titleFromOccupantTurn(
        "Help me decide which Worklog entries still need measured outcomes before I publish.",
      ),
    ).toBe("Help me decide which Worklog entries still need…");
  });

  it("presents recent turns for the model", () => {
    expect(
      presentCommandHistory([
        { speaker: "occupant", body: "What is thin?" },
        { speaker: "proforna", body: "Measured outcomes." },
      ]),
    ).toBe("[occupant] What is thin?\n[proforna] Measured outcomes.");
  });
});
