/**
 * Tests for buildRankedOrderBy — the relevance-ranking SQL helper used
 * by /api/work-logs/mention-search.
 *
 * We inspect the Prisma.Sql object directly (its `.values` array and
 * joined template strings) rather than running it against Postgres —
 * the actual ORDER BY semantics are postgres's job; what we own is
 * the SHAPE of the SQL fragment.
 */

import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { buildRankedOrderBy } from "@/lib/mention-search/build-ranked-query";

/** Concatenate the template strings of a Prisma.Sql for substring assertions. */
function joinedSql(sql: Prisma.Sql): string {
  return sql.strings.join("?");
}

describe("buildRankedOrderBy", () => {
  it("returns a Prisma.Sql fragment (has .strings + .values)", () => {
    const out = buildRankedOrderBy({
      field: "name",
      term: "re",
      secondary: Prisma.sql`name ASC`,
    });
    // Prisma's Sql class is internal; duck-type on the public surface
    // instead of `instanceof Prisma.Sql` (which is not a runtime export).
    expect(Array.isArray(out.strings)).toBe(true);
    expect(Array.isArray(out.values)).toBe(true);
  });

  it("emits a CASE expression with three tiers (0 exact, 1 prefix, 2 substring)", () => {
    const out = buildRankedOrderBy({
      field: "name",
      term: "re",
      secondary: Prisma.sql`name ASC`,
    });
    const text = joinedSql(out);
    expect(text).toMatch(/ORDER BY/i);
    expect(text).toMatch(/CASE/i);
    // Tier-0 (exact): lower(field) = lower($term)  → returns 0
    // Tier-1 (prefix): lower(field) LIKE lower($term) || '%' → returns 1
    // Tier-2 (substring): everything else (no explicit clause; ELSE 2)
    expect(text).toMatch(/THEN\s+0/);
    expect(text).toMatch(/THEN\s+1/);
    expect(text).toMatch(/ELSE\s+2/);
  });

  it("parameterizes the term — `term` value appears in .values, NOT inlined in the SQL template", () => {
    const out = buildRankedOrderBy({
      field: "name",
      term: "Robert'); DROP TABLE Contact;--",
      secondary: Prisma.sql`name ASC`,
    });
    // The dangerous payload must be bound, not inlined.
    expect(out.values).toContain("Robert'); DROP TABLE Contact;--");
    expect(joinedSql(out)).not.toContain("Robert");
    expect(joinedSql(out)).not.toContain("DROP TABLE");
  });

  it("appends the secondary sort fragment after the rank tier", () => {
    const out = buildRankedOrderBy({
      field: "name",
      term: "re",
      secondary: Prisma.sql`date DESC`,
    });
    const text = joinedSql(out);
    // Secondary order must come AFTER the rank CASE — same ORDER BY clause.
    const caseIdx = text.search(/CASE/i);
    const secondaryIdx = text.indexOf("date DESC");
    expect(caseIdx).toBeGreaterThanOrEqual(0);
    expect(secondaryIdx).toBeGreaterThan(caseIdx);
  });

  it("emits a LIMIT clause defaulting to 8", () => {
    const out = buildRankedOrderBy({
      field: "name",
      term: "re",
      secondary: Prisma.sql`name ASC`,
    });
    const text = joinedSql(out);
    expect(text).toMatch(/LIMIT/i);
    // Default is bound as a parameter, not inlined.
    expect(out.values).toContain(8);
  });

  it("honors a custom take value", () => {
    const out = buildRankedOrderBy({
      field: "name",
      term: "re",
      secondary: Prisma.sql`name ASC`,
      take: 20,
    });
    expect(out.values).toContain(20);
    expect(out.values).not.toContain(8);
  });

  it("uses the field argument as a raw identifier inside the CASE expression", () => {
    const out = buildRankedOrderBy({
      field: "company",
      term: "acme",
      secondary: Prisma.sql`company ASC`,
    });
    const text = joinedSql(out);
    // The canonical display field name should appear unparameterized in
    // the CASE (Postgres can't bind a column name). Callers MUST pass a
    // static, safe identifier — never user input.
    expect(text).toMatch(/lower\(\s*company\s*\)/i);
    expect(text).not.toMatch(/lower\(\s*name\s*\)/i);
  });
});
