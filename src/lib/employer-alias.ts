import { prisma } from "@/lib/prisma";

/** Normalise a name for alias lookup: upper, strip punctuation & extra spaces */
export function normEmployer(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Build a lookup map: normalisedVariant → canonicalName
 * for a given user. Returns a function that resolves any name
 * to its canonical form (or the original if no alias exists).
 */
export async function buildAliasResolver(userId: string): Promise<(name: string) => string> {
  const aliases = await prisma.employerAlias.findMany({
    where: { userId },
    select: { canonicalName: true, variantName: true },
  });

  const map = new Map<string, string>();
  for (const a of aliases) {
    map.set(a.variantName, a.canonicalName); // variantName is already normalised
  }

  return (name: string) => {
    const n = normEmployer(name);
    return map.get(n) ?? name;
  };
}
