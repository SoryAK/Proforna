import { describe, expect, it } from "vitest";
import {
  connectedAccountsLine,
  connectionToolLine,
  isReadTool,
  mentionsConnection,
  pickReadTool,
  presentMcpText,
  presentMcpTools,
} from "./connection-access";

const zoom = {
  name: "zoom",
  displayName: "Zoom",
  description: "Search meetings, pull transcripts, and work with Zoom Docs.",
};

describe("connected accounts", () => {
  it("notices the account the occupant named and ignores a plain question", () => {
    expect(mentionsConnection("what zoom meetings do I have", zoom)).toBe(true);
    expect(mentionsConnection("What should I capture next?", zoom)).toBe(false);
  });

  it("calls one read tool and skips a tool that changes the account", () => {
    const tools = [
      { name: "list_meetings", description: "List meetings", required: [] },
      { name: "delete_meeting", description: "Delete a meeting", required: [] },
    ];
    expect(isReadTool(tools[1])).toBe(false);
    expect(pickReadTool("what meetings do I have", tools)?.name).toBe("list_meetings");
    expect(presentMcpTools({ result: { tools: [{ name: "list_meetings", description: "List meetings", inputSchema: {} }] } })).toEqual([
      { name: "list_meetings", description: "List meetings", required: [] },
    ]);
    expect(presentMcpText({ result: { content: [{ type: "text", text: "Standup at 9" }] } })).toBe("Standup at 9");
    expect(connectionToolLine("Zoom", "list_meetings", "Standup at 9")).toBe("Zoom list_meetings:\nStandup at 9");
    expect(connectedAccountsLine([zoom])).toBe(
      "Connected accounts:\n- Zoom. Search meetings, pull transcripts, and work with Zoom Docs.",
    );
  });
});
