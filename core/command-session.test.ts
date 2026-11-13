import { describe, expect, it } from "vitest";
import {
  prepareCommandMessage,
  prepareCommandSession,
  prepareCommandSessionChange,
  prepareCommandSessionRemoval,
  presentCommandHistory,
  presentCommandRoles,
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

  it("changes a session through the same title field", () => {
    const session = {
      id: "session-1",
      occupantId: "local",
      title: "What should I capture next?",
      createdAt: "2026-09-21T15:00:00.000Z",
      updatedAt: "2026-09-21T15:00:00.000Z",
    };
    expect(prepareCommandSessionChange(session, "  Interviews  ")).toMatchObject({
      ok: true,
      value: { id: "session-1", title: "Interviews" },
    });
    expect(prepareCommandSessionChange(session, "  ")).toMatchObject({
      ok: true,
      value: { title: "New conversation" },
    });
  });

  it("requires a session before removing one", () => {
    expect(prepareCommandSessionRemoval({ occupantId: "local", sessionId: "  " })).toEqual({
      ok: false,
      error: "session-required",
    });
    expect(prepareCommandSessionRemoval({ occupantId: " local ", sessionId: " session-1 " })).toEqual({
      ok: true,
      value: { occupantId: "local", sessionId: "session-1" },
    });
  });

  it("lists the roles attached to a question", () => {
    expect(presentCommandRoles([])).toBe("");
    expect(
      presentCommandRoles([
        {
          organization: "Giants Direct",
          title: "Technician",
          startDate: "2024-06",
          endDate: "",
          isCurrent: true,
        },
      ]),
    ).toBe("Roles in this question:\n- Giants Direct, Technician, 2024-06 – present");
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
