export type RoleAchievement = { id: string; statement: string };

export function roleAchievementStatements(value: unknown): string[] {
  return readRoleAchievements(value, () => "").items.map((item) => item.statement);
}

export function readRoleAchievements(
  value: unknown,
  mintId: () => string,
): { items: RoleAchievement[]; changed: boolean } {
  const parsed = typeof value === "string" ? parseJson(value) : value;
  if (!Array.isArray(parsed)) return { items: [], changed: false };
  const items: RoleAchievement[] = [];
  let changed = false;
  for (const entry of parsed) {
    if (typeof entry === "string") {
      const statement = entry.trim();
      if (!statement) {
        changed = true;
        continue;
      }
      items.push({ id: mintId(), statement });
      changed = true;
      continue;
    }
    if (!entry || typeof entry !== "object") {
      changed = true;
      continue;
    }
    const record = entry as { id?: unknown; statement?: unknown };
    const statement = typeof record.statement === "string" ? record.statement.trim() : "";
    if (!statement) {
      changed = true;
      continue;
    }
    const id = typeof record.id === "string" ? record.id.trim() : "";
    if (!id) {
      items.push({ id: mintId(), statement });
      changed = true;
      continue;
    }
    items.push({ id, statement });
    if (record.id !== id || record.statement !== statement) changed = true;
  }
  return { items, changed };
}

export function reconcileRoleAchievements(
  previous: readonly RoleAchievement[],
  lines: readonly string[],
  mintId: () => string,
): RoleAchievement[] {
  const wanted = lines.map((line) => line.trim()).filter(Boolean);
  const pool = previous.map((item) => ({ ...item, used: false }));
  const matched = wanted.map((statement) => {
    const found = pool.find((item) => !item.used && item.statement === statement);
    if (!found) return null;
    found.used = true;
    return { id: found.id, statement };
  });
  const leftover = pool.filter((item) => !item.used);
  let cursor = 0;
  return matched.map((item, index) => {
    if (item) return item;
    const reuse = leftover[cursor];
    cursor += 1;
    if (reuse) return { id: reuse.id, statement: wanted[index] ?? "" };
    return { id: mintId(), statement: wanted[index] ?? "" };
  });
}

export function achievementStatement(
  achievements: readonly string[],
  achievementIds: readonly string[] | undefined,
  achievementId: string,
): string | null {
  const index = achievementIds?.indexOf(achievementId) ?? -1;
  if (index < 0) return null;
  const statement = achievements[index]?.trim() ?? "";
  return statement || null;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
