import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  defaultThirdPartyPlugins,
  readThirdPartyPlugin,
  thirdPartyBlock,
  type ThirdPartyPlugin,
} from "./plugins";

const root = join(process.cwd(), "plugins", "third_party");

function loadCatalog(): ThirdPartyPlugin[] {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const dir = join(root, entry.name);
      const plugin = readThirdPartyPlugin(
        JSON.parse(readFileSync(join(dir, ".cursor-plugin", "plugin.json"), "utf8")),
        JSON.parse(readFileSync(join(dir, "mcp.json"), "utf8")),
      );
      if (!plugin) throw new Error(`unreadable plugin ${entry.name}`);
      return plugin;
    });
}

describe("third-party plugins", () => {
  const catalog = loadCatalog();

  it("offers scheduling, tasks, agreements, and the occupant's repositories", () => {
    expect(defaultThirdPartyPlugins(catalog).map((plugin) => plugin.name)).toEqual([
      "calendly",
      "docusign",
      "github",
      "todoist",
      "zoom",
    ]);
  });

  it("leaves Google's preview Gmail server and Cursor-hosted gateways off", () => {
    const byName = new Map(catalog.map((plugin) => [plugin.name, plugin]));
    expect(thirdPartyBlock(byName.get("gmail")!)).toBe("preview");
    expect(thirdPartyBlock(byName.get("google-calendar")!)).toBe("preview");
    expect(thirdPartyBlock(byName.get("google-drive")!)).toBe("foreign-host");
    expect(thirdPartyBlock(byName.get("outlook")!)).toBe("foreign-host");
    expect(thirdPartyBlock(byName.get("ashby")!)).toBe("outside-career");
    expect(thirdPartyBlock(byName.get("playwright")!)).toBe("unresolved");
  });

  it("does not treat a preview host as a default even when the name is allowlisted", () => {
    const preview: ThirdPartyPlugin = {
      name: "calendly",
      displayName: "Calendly",
      description: "Check availability and book, cancel, or reschedule.",
      endpoint: "https://gmailmcp.googleapis.com/mcp/v1",
    };
    expect(thirdPartyBlock(preview)).toBe("preview");
    expect(defaultThirdPartyPlugins([preview])).toEqual([]);
  });
});
