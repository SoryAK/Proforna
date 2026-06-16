/**
 * ADR-0030 Unit 3 — Tiptap node spec smoke tests.
 *
 * Live editor instantiation requires a DOM (jsdom). Vitest is node-only on
 * this project (per ADR-0018 / testing.instructions.md). These tests
 * therefore cover what we CAN check from a pure-Node environment:
 *
 *   1. Each Node has the right `name`.
 *   2. The bundle exports them in the expected order.
 *   3. The procedureDoc enforces L1+L3 via its content expression string.
 *   4. procedureStep declares `title` as a nullable attr (L2).
 *   5. procedureTitle accepts only text (no marks, no inline atoms).
 *
 * Round-trip parse/render is exercised end-to-end in Unit 4's browser
 * smoke. The schema-shape contract here is what ProseMirror's runtime will
 * actually enforce when an editor instance is created.
 */

import { describe, expect, it } from "vitest";
import {
  procedureSchemaExtensions,
  ProcedureDocNode,
  ProcedureStepNode,
  ProcedureTitleNode,
  ProcedureToolsNode,
} from "./procedure-schema-extensions";

describe("procedure schema extensions — node names", () => {
  it("ProcedureDocNode is named 'procedureDoc'", () => {
    expect(ProcedureDocNode.name).toBe("procedureDoc");
  });

  it("ProcedureTitleNode is named 'procedureTitle'", () => {
    expect(ProcedureTitleNode.name).toBe("procedureTitle");
  });

  it("ProcedureToolsNode is named 'procedureTools'", () => {
    expect(ProcedureToolsNode.name).toBe("procedureTools");
  });

  it("ProcedureStepNode is named 'procedureStep'", () => {
    expect(ProcedureStepNode.name).toBe("procedureStep");
  });
});

describe("procedure schema extensions — bundle", () => {
  it("exports four nodes plus the procedureCommands extension, top-node first", () => {
    // Unit 6 added the ProcedureCommands Extension at index 4 — the four
    // node specs come first so node registration completes before the
    // extension's command declarations execute.
    expect(procedureSchemaExtensions.length).toBe(5);
    expect(procedureSchemaExtensions[0].name).toBe("procedureDoc");
    // Title before any container so registration order matches the
    // structural sequence in the doc's content expression.
    expect(procedureSchemaExtensions[1].name).toBe("procedureTitle");
    expect(procedureSchemaExtensions[4].name).toBe("procedureCommands");
  });
});

describe("procedure schema extensions — locked decisions", () => {
  it("L1+L3: procedureDoc.content is 'procedureTitle procedureTools? procedureStep+'", () => {
    // The content expression is the canonical place L1 (tools optional)
    // and L3 (steps flat & 1+) are enforced. ProseMirror parses this at
    // editor init.
    expect(ProcedureDocNode.config.content).toBe(
      "procedureTitle procedureTools? procedureStep+",
    );
  });

  it("L1: tools block uses 'block+' (accepts paragraphs, photos, mentions)", () => {
    expect(ProcedureToolsNode.config.content).toBe("block+");
  });

  it("L3: procedureStep.content is 'block+' but procedureStep is NOT in 'block' group (cannot self-nest)", () => {
    expect(ProcedureStepNode.config.content).toBe("block+");
    // Group either undefined or empty — never `block`. If procedureStep
    // were in `block`, `block+` would allow nested steps.
    const group = ProcedureStepNode.config.group;
    expect(group === undefined || group === "" || group === null).toBe(true);
  });

  it("L2: procedureStep declares a nullable `title` attribute", () => {
    // The Tiptap addAttributes function returns the attr spec.
    const addAttrs = ProcedureStepNode.config.addAttributes;
    expect(typeof addAttrs).toBe("function");
    const attrs = (addAttrs as () => Record<string, { default: unknown }>)();
    expect(attrs).toHaveProperty("title");
    expect(attrs.title.default).toBeNull();
  });

  it("procedureTitle accepts only text (no marks, no inline atoms)", () => {
    expect(ProcedureTitleNode.config.content).toBe("text*");
    expect(ProcedureTitleNode.config.marks).toBe("");
  });
});

describe("procedure schema extensions — round-trip rendering hooks", () => {
  it("each container node defines parseHTML and renderHTML", () => {
    for (const node of [
      ProcedureTitleNode,
      ProcedureToolsNode,
      ProcedureStepNode,
    ]) {
      expect(typeof node.config.parseHTML).toBe("function");
      expect(typeof node.config.renderHTML).toBe("function");
    }
  });

  it("ProcedureDocNode does NOT define parseHTML/renderHTML (top-node, never serialized as HTML)", () => {
    // The doc node is the structural root — it doesn't have HTML
    // representation; ProseMirror serializes its children directly.
    expect(ProcedureDocNode.config.parseHTML).toBeUndefined();
    expect(ProcedureDocNode.config.renderHTML).toBeUndefined();
  });
});
