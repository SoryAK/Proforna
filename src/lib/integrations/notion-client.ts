/**
 * Notion API client wrapper for Sprint 6B import (ADR-0019).
 *
 * Centralizes:
 *   - decrypting the access token from `IntegrationConnection.config.tokenRef`
 *   - constructing a typed `@notionhq/client` instance per request
 *   - listing the workspace's accessible pages (paginated search)
 *   - fetching ALL block children of a page across pagination boundaries
 *   - narrowing SDK responses to the minimal shapes consumed by
 *     `importNotion()` so the converter stays SDK-version-agnostic
 *
 * NEVER log tokens. Errors bubble with redacted messages — caller
 * decides what to surface in the HTTP response.
 */

import { Client } from "@notionhq/client";
import { decryptToken } from "@/lib/integration-crypto";
import type { NotionBlock } from "@/lib/worklog/import/notion-to-pm";

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

export type NotionConnectionConfig = {
  tokenRef?: {
    version?: string;
    accessToken?: string;
  };
  workspaceId?: string | null;
  workspaceName?: string | null;
  botId?: string | null;
};

export type NotionPageSummary = {
  id: string;
  title: string;
  url: string;
  lastEditedTime: string;
  parentLabel: string | null;
};

export type NotionPageContent = {
  id: string;
  title: string;
  blocks: NotionBlock[];
};

// Minimal SDK-shape narrowing — keeps the rest of the codebase decoupled
// from `@notionhq/client` types. The SDK changes types between minor
// versions; we only depend on the fields we actually read.
type SdkPage = {
  id: string;
  url?: string;
  last_edited_time: string;
  properties?: Record<string, unknown>;
  parent?: { type?: string; workspace?: boolean };
};

type SdkRichText = {
  plain_text: string;
};

// ─────────────────────────────────────────────────────────
// Client construction
// ─────────────────────────────────────────────────────────

export function buildNotionClient(config: NotionConnectionConfig): Client {
  const ct = config.tokenRef?.accessToken;
  if (!ct) {
    throw new Error("Notion connection is missing an access token");
  }
  const auth = decryptToken(ct);
  return new Client({ auth });
}

// ─────────────────────────────────────────────────────────
// Page listing (search endpoint, type=page)
// ─────────────────────────────────────────────────────────

const PAGE_LIST_LIMIT = 100; // hard cap per call to keep the picker responsive

export async function listAccessiblePages(
  client: Client,
): Promise<NotionPageSummary[]> {
  const pages: NotionPageSummary[] = [];
  let cursor: string | undefined;

  // Notion's `search` endpoint paginates; one call returns up to 100.
  // For v1 the picker is a flat list — a single page of 100 results
  // sorted by last_edited_time covers the realistic on-ramp use case.
  // Future: paginate fully with infinite scroll.
  do {
    const res = await client.search({
      filter: { property: "object", value: "page" },
      sort: { direction: "descending", timestamp: "last_edited_time" },
      page_size: PAGE_LIST_LIMIT,
      start_cursor: cursor,
    });

    for (const r of res.results) {
      const summary = toPageSummary(r as unknown as SdkPage);
      if (summary) pages.push(summary);
    }

    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;

    // Bound the response — picker is intentionally flat-list-only in v1.
    if (pages.length >= PAGE_LIST_LIMIT) break;
  } while (cursor);

  return pages;
}

function toPageSummary(p: SdkPage): NotionPageSummary | null {
  if (!p.id || !p.last_edited_time) return null;

  const title = extractTitleFromProperties(p.properties);
  const parentLabel = parentTypeToLabel(p.parent?.type);

  return {
    id: p.id,
    title: title || "Untitled",
    url: p.url ?? "",
    lastEditedTime: p.last_edited_time,
    parentLabel,
  };
}

function extractTitleFromProperties(
  properties: Record<string, unknown> | undefined,
): string {
  if (!properties) return "";
  for (const value of Object.values(properties)) {
    const prop = value as { type?: string; title?: SdkRichText[] };
    if (prop?.type === "title" && Array.isArray(prop.title)) {
      return prop.title.map((t) => t.plain_text).join("").trim();
    }
  }
  return "";
}

function parentTypeToLabel(type: string | undefined): string | null {
  switch (type) {
    case "workspace":
      return "Workspace";
    case "page_id":
      return "Sub-page";
    case "database_id":
      return "Database row";
    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────────
// Single-page fetch (metadata + paginated block children)
// ─────────────────────────────────────────────────────────

const BLOCK_PAGE_SIZE = 100;
const MAX_BLOCKS_PER_PAGE = 1000; // hard cap — protects against huge pages

export async function fetchPageContent(
  client: Client,
  pageId: string,
): Promise<NotionPageContent> {
  // Page metadata for the title (separate from block children).
  const page = (await client.pages.retrieve({
    page_id: pageId,
  })) as unknown as SdkPage;
  const title = extractTitleFromProperties(page.properties) || "Untitled";

  const blocks: NotionBlock[] = [];
  let cursor: string | undefined;

  do {
    const res = await client.blocks.children.list({
      block_id: pageId,
      page_size: BLOCK_PAGE_SIZE,
      start_cursor: cursor,
    });

    for (const r of res.results) {
      blocks.push(r as unknown as NotionBlock);
      if (blocks.length >= MAX_BLOCKS_PER_PAGE) break;
    }

    if (blocks.length >= MAX_BLOCKS_PER_PAGE) break;
    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return { id: page.id, title, blocks };
}
