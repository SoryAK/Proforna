/**
 * "Not a duplicate": the occupant says two saved roles are different, so the
 * duplicate review stops pairing them. A pair has no order.
 */
export type DistinctPair = { firstId: string; secondId: string; key: string };

export function distinctPairKey(left: string, right: string): string {
  return [left, right].sort().join("|");
}

export function prepareDistinctPair(
  input: unknown,
): { ok: true; value: DistinctPair } | { ok: false; error: "pair-invalid" } {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const left = typeof record.firstId === "string" ? record.firstId.trim() : "";
  const right = typeof record.secondId === "string" ? record.secondId.trim() : "";
  if (!left || !right || left === right || left.includes("|") || right.includes("|")) {
    return { ok: false, error: "pair-invalid" };
  }
  const [firstId, secondId] = [left, right].sort();
  return { ok: true, value: { firstId, secondId, key: `${firstId}|${secondId}` } };
}
