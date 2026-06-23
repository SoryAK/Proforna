/**
 * Prisma JSON write helpers.
 *
 * Why this exists
 * ---------------
 * Prisma v6 splits JSON typings into a *read* type (`Prisma.JsonValue`) and a
 * *write* type (`Prisma.InputJsonValue`). They look identical at the schema
 * level but they are NOT structurally compatible at compile-time — the input
 * variant intentionally excludes `null` so a missing-JSON column can be
 * encoded explicitly via `Prisma.JsonNull` / `Prisma.DbNull`.
 *
 * In practice we are constantly piping ProseMirror docs, AI envelopes, and
 * generic JSON blobs (already validated by Zod / our own type guards) into
 * Prisma `create` / `update` calls. Each site previously needed a verbose
 * `as Prisma.InputJsonValue` cast and copy-paste null-handling boilerplate.
 *
 * These two thin helpers centralise that boundary so the rest of the codebase
 * can stay free of Prisma-specific JSON gymnastics.
 */
import { Prisma } from "@prisma/client";

/**
 * Cast a validated value (object, array, scalar) to `Prisma.InputJsonValue`
 * for use in non-nullable JSON columns. The caller is responsible for having
 * already verified the value is a serialisable JSON shape (no class
 * instances, no functions, no circular refs).
 */
export function toJsonInput(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

/**
 * Same as `toJsonInput` but for nullable JSON columns: maps JS `null` /
 * `undefined` to Prisma's sentinel `Prisma.JsonNull` so the row stores a
 * SQL `NULL` instead of a JSON-encoded `null` literal.
 */
export function toNullableJsonInput(
  value: unknown,
): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue {
  if (value === null || value === undefined) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}
