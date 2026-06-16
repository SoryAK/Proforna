/**
 * ADR-0030 Unit 3 — procedure schema bundle.
 *
 * Single import point for the four custom nodes that compose the procedure
 * document schema. The Unit 4 editor mount picks this bundle (instead of
 * the notes extensions) when `WorkLog.kind === "procedure"`.
 *
 * Order matters for Tiptap registration: the top-node (`procedureDoc`)
 * comes first so the schema registers it as the doc replacement before its
 * children are referenced.
 */

import { ProcedureDocNode } from "./procedure-doc-node";
import { ProcedureStepNode } from "./procedure-step-node";
import { ProcedureTitleNode } from "./procedure-title-node";
import { ProcedureToolsNode } from "./procedure-tools-node";
import { ProcedureCommands } from "./procedure-commands";

export const procedureSchemaExtensions = [
  ProcedureDocNode,
  ProcedureTitleNode,
  ProcedureToolsNode,
  ProcedureStepNode,
  // ADR-0030 Unit 6 — toolbar commands (appendStep, toggleTools, etc.)
  ProcedureCommands,
] as const;

export {
  ProcedureDocNode,
  ProcedureStepNode,
  ProcedureTitleNode,
  ProcedureToolsNode,
  ProcedureCommands,
};
