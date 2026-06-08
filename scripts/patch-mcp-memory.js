#!/usr/bin/env node
/**
 * Re-applies Resumsify's two patches to @modelcontextprotocol/server-memory@0.6.3.
 *
 * Run after any global re-install that wipes node_modules:
 *   npm run memory:patch
 *
 * Patches (idempotent — checks for sentinel before editing):
 *   1. McpServer name → reads process.env.MCP_SERVER_NAME (so supervisor can name each scope).
 *   2. searchNodes()  → tokenizes the query on whitespace and AND-matches each token
 *                       across entity name | type | observations. Original behavior was
 *                       a single .includes(query) that failed on any multi-word query.
 *
 * Usage:
 *   node scripts/patch-mcp-memory.js          # apply
 *   node scripts/patch-mcp-memory.js --check  # exit 0 if patched, 1 if not
 */

const fs = require("node:fs");
const path = require("node:path");

const TARGET = path.join(
  process.env.APPDATA,
  "npm",
  "node_modules",
  "@modelcontextprotocol",
  "server-memory",
  "dist",
  "index.js"
);

const SENTINEL_NAME = "process.env.MCP_SERVER_NAME";
const SENTINEL_SEARCH = "PATCH (resumsify): tokenize on whitespace";

const NAMING_OLD = `const server = new McpServer({
    name: "memory-server",
    version: "0.6.3",
});`;

const NAMING_NEW = `const server = new McpServer({
    name: process.env.MCP_SERVER_NAME || "memory-server",
    version: "0.6.3",
});`;

const SEARCH_OLD = `    async searchNodes(query) {
        const graph = await this.loadGraph();
        // Filter entities
        const filteredEntities = graph.entities.filter(e => e.name.toLowerCase().includes(query.toLowerCase()) ||
            e.entityType.toLowerCase().includes(query.toLowerCase()) ||
            e.observations.some(o => o.toLowerCase().includes(query.toLowerCase())));
        // Create a Set of filtered entity names for quick lookup
        const filteredEntityNames = new Set(filteredEntities.map(e => e.name));
        // Filter relations to only include those between filtered entities
        const filteredRelations = graph.relations.filter(r => filteredEntityNames.has(r.from) && filteredEntityNames.has(r.to));
        const filteredGraph = {
            entities: filteredEntities,
            relations: filteredRelations,
        };
        return filteredGraph;
    }`;

const SEARCH_NEW = `    async searchNodes(query) {
        const graph = await this.loadGraph();
        // PATCH (resumsify): tokenize on whitespace, AND-match every token across name|type|observations.
        // Original implementation used a single .includes(query) which failed multi-word queries.
        const tokens = String(query || "").toLowerCase().split(/\\s+/).filter(Boolean);
        const matches = (e) => {
            if (tokens.length === 0) return true;
            const haystack = [
                e.name.toLowerCase(),
                e.entityType.toLowerCase(),
                ...e.observations.map(o => o.toLowerCase())
            ].join(" \\u0001 ");
            return tokens.every(t => haystack.includes(t));
        };
        const filteredEntities = graph.entities.filter(matches);
        const filteredEntityNames = new Set(filteredEntities.map(e => e.name));
        const filteredRelations = graph.relations.filter(r => filteredEntityNames.has(r.from) && filteredEntityNames.has(r.to));
        const filteredGraph = {
            entities: filteredEntities,
            relations: filteredRelations,
        };
        return filteredGraph;
    }`;

function fail(msg) {
  console.error(`[patch-mcp-memory] ${msg}`);
  process.exit(1);
}

function main() {
  const checkOnly = process.argv.includes("--check");

  if (!fs.existsSync(TARGET)) {
    fail(`target not found: ${TARGET}\n` +
         `Install first: npm install -g @modelcontextprotocol/server-memory`);
  }

  const src = fs.readFileSync(TARGET, "utf8");
  const namingApplied = src.includes(SENTINEL_NAME);
  const searchApplied = src.includes(SENTINEL_SEARCH);

  if (checkOnly) {
    console.log(`naming patch:  ${namingApplied ? "OK" : "MISSING"}`);
    console.log(`search patch:  ${searchApplied ? "OK" : "MISSING"}`);
    process.exit(namingApplied && searchApplied ? 0 : 1);
  }

  if (namingApplied && searchApplied) {
    console.log("[patch-mcp-memory] Both patches already applied — no-op.");
    return;
  }

  let next = src;
  let changed = 0;

  if (!namingApplied) {
    if (!next.includes(NAMING_OLD)) {
      fail("naming patch: original block not found. Upstream may have changed shape.");
    }
    next = next.replace(NAMING_OLD, NAMING_NEW);
    changed++;
    console.log("[patch-mcp-memory] applied naming patch");
  }

  if (!searchApplied) {
    if (!next.includes(SEARCH_OLD)) {
      fail("search patch: original searchNodes block not found. Upstream may have changed shape.");
    }
    next = next.replace(SEARCH_OLD, SEARCH_NEW);
    changed++;
    console.log("[patch-mcp-memory] applied search tokenize patch");
  }

  fs.writeFileSync(TARGET, next, "utf8");
  console.log(`[patch-mcp-memory] wrote ${changed} patch(es) to ${TARGET}`);
  console.log("[patch-mcp-memory] Restart the supervisor:");
  console.log("    Restart-Service MCPMemorySupervisor");
}

main();
