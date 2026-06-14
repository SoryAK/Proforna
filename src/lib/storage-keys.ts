/**
 * Centralised localStorage key registry.
 *
 * Convention: `resumsify:<feature>:<key>`
 *   - `resumsify:` namespaces every key the app owns so future features can't
 *     collide with library-set keys (App Insights, Stripe, etc.).
 *   - `<feature>:` second segment groups keys by surface. This makes
 *     localStorage easy to skim in DevTools and lets us mass-clear a feature
 *     during testing.
 *   - Inner words stay kebab-case for readability.
 *
 * When adding a new key:
 *   1. Add the constant below under the right feature group.
 *   2. Import it where you use it — never hard-code the literal in components.
 *   3. If you're renaming an existing key, register the old name in
 *      `LEGACY_KEY_MAP` so a one-time migration runs on next load.
 */

export const STORAGE_KEYS = {
  sidebar: {
    collapsed: "resumsify:sidebar:collapsed",
    worklogShowGlobal: "resumsify:sidebar:worklog-show-global",
  },
  worklog: {
    railActivityOpen: "resumsify:worklog:rail-activity-open",
    railCategoriesOpen: "resumsify:worklog:rail-categories-open",
    railFoldersOpen: "resumsify:worklog:rail-folders-open",
    folderTreeExpanded: "resumsify:worklog:folder-tree-expanded",
  },
  documents: {
    viewMode: "resumsify:documents:view-mode",
  },
} as const;

/**
 * Map of legacy → current key names. Populated for any key that was renamed
 * after release so users don't lose their preferences. The migration is
 * one-way and idempotent — once the new key exists, the old one is dropped.
 */
const LEGACY_KEY_MAP: Record<string, string> = {
  // sidebar
  "sidebar-collapsed": STORAGE_KEYS.sidebar.collapsed,
  "sidebar-worklog-show-global": STORAGE_KEYS.sidebar.worklogShowGlobal,
  // worklog rail / folder tree
  "worklog-rail-activity-open": STORAGE_KEYS.worklog.railActivityOpen,
  "worklog-rail-categories-open": STORAGE_KEYS.worklog.railCategoriesOpen,
  "worklog-folder-tree-expanded": STORAGE_KEYS.worklog.folderTreeExpanded,
  // documents view mode
  "docs-view": STORAGE_KEYS.documents.viewMode,
};

/**
 * Lazily migrates a single legacy key to its new name.
 *
 * Safe to call on every read; the work only happens once. Returns nothing
 * because callers should follow it with `localStorage.getItem(newKey)` —
 * keeping the read/migrate paths separate makes the call sites easier to
 * reason about than a wrapper that hides both.
 */
export function migrateLegacyKey(newKey: string): void {
  if (typeof window === "undefined") return;
  const oldKey = Object.keys(LEGACY_KEY_MAP).find(
    (k) => LEGACY_KEY_MAP[k] === newKey,
  );
  if (!oldKey) return;
  try {
    const ls = window.localStorage;
    if (ls.getItem(newKey) !== null) {
      // New key already populated — drop the legacy one if it's still hanging
      // around so we don't leave dead keys in storage.
      if (ls.getItem(oldKey) !== null) ls.removeItem(oldKey);
      return;
    }
    const legacyValue = ls.getItem(oldKey);
    if (legacyValue === null) return;
    ls.setItem(newKey, legacyValue);
    ls.removeItem(oldKey);
  } catch {
    // localStorage can throw in private mode / quota cases; migration is
    // best-effort and never blocks the caller.
  }
}
