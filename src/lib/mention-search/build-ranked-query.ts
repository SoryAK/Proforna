/**
 * Build a relevance-ranked Prisma SQL fragment for mention-search.
 *
 * Used by /api/work-logs/mention-search to order entity-picker rows by
 * relevance against the user's query term. Three tiers:
 *
 *   0 — exact case-insensitive match on the canonical display field
 *   1 — prefix case-insensitive match
 *   2 — substring case-insensitive match (default; also catches secondary-
 *       field matches like Contact.role or Asset.identifier that the
 *       WHERE clause includes)
 *
 * After the tier, rows fall back to a secondary order (alphabetical for
 * names, date-desc for worklog/procedure).
 *
 * Invariant — tier-0 and tier-1 ALWAYS rank on the canonical display
 * field. Secondary-field matches (role, company, customerName, content)
 * can only earn tier-2. This prevents tier inversion when the WHERE
 * clause is widened to additional fields.
 *
 * The helper returns a Prisma.Sql fragment with all string interpolations
 * parameterized (no SQL injection). The caller composes it into the
 * outer query like:
 *
 *   prisma.$queryRaw<Row[]>`
 *     SELECT id, name FROM "Contact"
 *     WHERE "userId" = ${userId} AND lower(name) LIKE ${"%"+term+"%"}
 *     ${buildRankedOrderBy({ field: "name", term, secondary: Prisma.sql`name ASC`, take: 8 })}
 *   `;
 *
 * The fragment includes BOTH the ORDER BY and the LIMIT — keeping them
 * together so callers can't accidentally drop the LIMIT and pull the
 * full result set.
 */

import { Prisma } from "@prisma/client";

export interface BuildRankedOrderByOptions {
  /**
   * Unquoted column reference for the canonical display field
   * (e.g. "name", "company", "title"). MUST be a safe identifier — this
   * value is NOT parameterized because Postgres bind params can't take
   * column names. Callers pass static strings from a closed set; do
   * NOT pass user input here.
   */
  field: string;
  /** The user's query term. Empty string is treated as no ranking. */
  term: string;
  /** Secondary sort clause (e.g. Prisma.sql`name ASC`). */
  secondary: Prisma.Sql;
  /** Row limit (default 8 to match MAX_RESULTS). */
  take?: number;
}

export function buildRankedOrderBy(opts: BuildRankedOrderByOptions): Prisma.Sql {
  const { field, term, secondary, take = 8 } = opts;
  // `field` is interpolated as a raw identifier (Postgres bind params
  // cannot take column names). Callers MUST pass a static, safe
  // identifier — never user input. The exported docstring above
  // documents the contract.
  const f = Prisma.raw(field);
  return Prisma.sql`ORDER BY CASE WHEN lower(${f}) = lower(${term}) THEN 0 WHEN lower(${f}) LIKE lower(${term}) || '%' THEN 1 ELSE 2 END, ${secondary} LIMIT ${take}`;
}
