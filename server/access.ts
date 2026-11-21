import { randomBytes, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  accessEmailDraft,
  accessExpiry,
  accessState,
  effectiveSections,
  isOpenEnded,
  planAccessChange,
  planAccessRemove,
  planProjectionGrant,
  prepareAccessChange,
  type AccessActivity,
  type AccessActivityKind,
  type AccessState,
  type WorkMapPublishSection,
} from "../core/index";
import { mintOccupantApproval, persistApprovedChange, persistAuditEvent } from "./change-sets";
import { readProfile } from "./occupant";
import {
  createProjectionGrant,
  readProjection,
  revokeProjectionGrant,
  tokenHash,
  type ProjectionRelay,
} from "./projections";

/** Why an Access action could not be done; the route turns these into statuses. */
export class AccessStoreError extends Error {
  constructor(
    readonly code: string,
    /** For "already-shared": the record that already covers this person. */
    readonly personId?: string,
  ) {
    super(code);
  }
}

/** One person's access to the page, as the Access list shows it. */
export type AccessPerson = {
  id: string;
  projectionId: string;
  slug: string;
  name: string;
  email: string;
  /** False for links made before Docier kept names; they can be named. */
  named: boolean;
  source: "asked" | "shared";
  /** What the link opens now; `wholePage` when it follows the page's own sections. */
  sections: WorkMapPublishSection[];
  wholePage: boolean;
  pageSections: WorkMapPublishSection[];
  expiresAt: string;
  untilRevoked: boolean;
  state: AccessState;
  /** The link, when Docier holds it. Links made before Access existed can't be shown again. */
  link: string | null;
  openCount: number;
  lastOpenedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
  requestId: string | null;
  /** Newest first. */
  activity: AccessActivity[];
};

export type AccessPage = {
  projectionId: string;
  slug: string;
  sections: WorkMapPublishSection[];
  visibility: string;
  published: boolean;
};

type GrantRow = {
  id: string;
  projection_id: string;
  token_hash: string;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
  request_id: string | null;
  person_name: string;
  person_email: string;
  source: string;
  sections_json: string | null;
  link_token: string | null;
  open_count: number;
  last_opened_at: string | null;
  slug: string;
  projection_json: string;
  requester_name: string | null;
  requester_email: string | null;
  requester_message: string | null;
  requested_at: string | null;
};

const SELECT_GRANT = `SELECT g.*, p.slug, p.projection_json, r.requester_name, r.requester_email,
       r.message AS requester_message, r.created_at AS requested_at
  FROM projection_access_grants g
  JOIN interactive_projections p ON p.id = g.projection_id
  LEFT JOIN projection_access_requests r ON r.id = g.request_id`;

type ActivityRow = {
  id: string;
  kind: string;
  sections_json: string | null;
  expires_at: string | null;
  message: string;
  occurred_at: string;
};

function parseSections(json: string | null): WorkMapPublishSection[] | null {
  return json ? (JSON.parse(json) as WorkMapPublishSection[]) : null;
}

function linkFor(origin: string | null, slug: string, token: string | null): string | null {
  return origin && token ? `${origin.replace(/\/+$/, "")}/r/${encodeURIComponent(slug)}?token=${token}` : null;
}

/** Adds one entry to someone's Activity. Entries are never changed afterwards. */
export function recordActivity(
  db: DatabaseSync,
  occupantId: string,
  entry: {
    grantId?: string | null;
    requestId?: string | null;
    kind: AccessActivityKind;
    sections?: WorkMapPublishSection[] | null;
    expiresAt?: string | null;
    message?: string;
    occurredAt?: string;
    relayOpenId?: string | null;
  },
) {
  db.prepare(
    `INSERT OR IGNORE INTO access_activity
      (id, occupant_id, grant_id, request_id, kind, sections_json, expires_at, message, relay_open_id, occurred_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    occupantId,
    entry.grantId ?? null,
    entry.requestId ?? null,
    entry.kind,
    entry.sections ? JSON.stringify(entry.sections) : null,
    entry.expiresAt ?? null,
    entry.message ?? "",
    entry.relayOpenId ?? null,
    entry.occurredAt ?? new Date().toISOString(),
  );
}

/** The Activity on a grant, and on the request that led to it. */
export function readActivity(
  db: DatabaseSync,
  occupantId: string,
  ids: { grantId?: string | null; requestId?: string | null },
): AccessActivity[] {
  const rows = db
    .prepare(
      `SELECT id, kind, sections_json, expires_at, message, occurred_at FROM access_activity
        WHERE occupant_id = ? AND ((grant_id IS NOT NULL AND grant_id = ?) OR (request_id IS NOT NULL AND request_id = ?))
        ORDER BY occurred_at DESC, rowid DESC`,
    )
    .all(occupantId, ids.grantId ?? null, ids.requestId ?? null) as ActivityRow[];
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind as AccessActivityKind,
    sections: parseSections(row.sections_json),
    expiresAt: row.expires_at,
    message: row.message,
    occurredAt: row.occurred_at,
  }));
}

function present(db: DatabaseSync, occupantId: string, row: GrantRow, origin: string | null, now: Date): AccessPerson {
  const page = (JSON.parse(row.projection_json) as { sections: WorkMapPublishSection[] }).sections;
  const chosen = parseSections(row.sections_json);
  return {
    id: row.id,
    projectionId: row.projection_id,
    slug: row.slug,
    name: row.person_name || row.requester_name || "Someone with a link",
    email: row.person_email || row.requester_email || "",
    named: Boolean(row.person_name || row.requester_name),
    source: row.source === "asked" || row.request_id ? "asked" : "shared",
    sections: effectiveSections(chosen, page),
    wholePage: chosen === null,
    pageSections: page,
    expiresAt: row.expires_at,
    untilRevoked: isOpenEnded(row.expires_at),
    state: accessState({ expiresAt: row.expires_at, revokedAt: row.revoked_at }, now),
    link: linkFor(origin, row.slug, row.link_token),
    openCount: Number(row.open_count ?? 0),
    lastOpenedAt: row.last_opened_at,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
    requestId: row.request_id,
    activity: withAsk(readActivity(db, occupantId, { grantId: row.id, requestId: row.request_id }), row),
  };
}

/** Requests from before Activity existed still show the ask. */
function withAsk(activity: AccessActivity[], row: GrantRow): AccessActivity[] {
  if (!row.request_id || !row.requested_at || activity.some((entry) => entry.kind === "asked")) return activity;
  return [
    ...activity,
    {
      id: `asked-${row.request_id}`,
      kind: "asked",
      sections: null,
      expiresAt: null,
      message: row.requester_message ?? "",
      occurredAt: row.requested_at,
    },
  ];
}

function readGrant(db: DatabaseSync, occupantId: string, id: string): GrantRow {
  const row = db.prepare(`${SELECT_GRANT} WHERE g.id = ? AND p.occupant_id = ?`).get(id, occupantId) as
    | GrantRow
    | undefined;
  if (!row) throw new AccessStoreError("not-found");
  return row;
}

/** The page links open: the occupant's most recently published one. */
export function readAccessPage(db: DatabaseSync, occupantId: string): AccessPage | null {
  const row = db
    .prepare(
      `SELECT id, slug, visibility, status, projection_json FROM interactive_projections
        WHERE occupant_id = ?
        ORDER BY CASE status WHEN 'published' THEN 0 ELSE 1 END, created_at DESC LIMIT 1`,
    )
    .get(occupantId) as
    | { id: string; slug: string; visibility: string; status: string; projection_json: string }
    | undefined;
  if (!row) return null;
  return {
    projectionId: row.id,
    slug: row.slug,
    sections: (JSON.parse(row.projection_json) as { sections: WorkMapPublishSection[] }).sections,
    visibility: row.visibility,
    published: row.status === "published",
  };
}

/**
 * Brings in when links were opened on the Relay since the last open taken, and
 * adds each to Activity once. Returns whether the Relay could be reached.
 */
export async function pullOpens(db: DatabaseSync, occupantId: string, relay: ProjectionRelay | undefined) {
  if (!relay?.grantOpens) return true;
  const last = db
    .prepare(
      "SELECT MAX(occurred_at) AS at FROM access_activity WHERE occupant_id = ? AND relay_open_id IS NOT NULL",
    )
    .get(occupantId) as { at: string | null };
  let opens;
  try {
    opens = await relay.grantOpens(last.at ?? "");
  } catch {
    return false;
  }
  const findGrant = db.prepare(
    `SELECT g.id FROM projection_access_grants g
       JOIN interactive_projections p ON p.id = g.projection_id
      WHERE p.occupant_id = ? AND p.slug = ? AND g.token_hash = ?`,
  );
  const seen = db.prepare("SELECT 1 FROM access_activity WHERE relay_open_id = ?");
  for (const open of opens) {
    if (seen.get(open.id)) continue;
    const grant = findGrant.get(occupantId, open.slug, open.tokenHash) as { id: string } | undefined;
    if (!grant) continue;
    recordActivity(db, occupantId, { grantId: grant.id, kind: "opened", occurredAt: open.openedAt, relayOpenId: open.id });
    db.prepare(
      `UPDATE projection_access_grants
          SET open_count = open_count + 1,
              last_opened_at = CASE WHEN last_opened_at IS NULL OR last_opened_at < ? THEN ? ELSE last_opened_at END
        WHERE id = ?`,
    ).run(open.openedAt, open.openedAt, grant.id);
  }
  return true;
}

export function listAccess(db: DatabaseSync, occupantId: string, origin: string | null): AccessPerson[] {
  const now = new Date();
  const rows = db
    .prepare(`${SELECT_GRANT} WHERE p.occupant_id = ? ORDER BY g.created_at DESC`)
    .all(occupantId) as GrantRow[];
  return rows.map((row) => present(db, occupantId, row, origin, now));
}

export function readAccess(db: DatabaseSync, occupantId: string, id: string, origin: string | null): AccessPerson {
  return present(db, occupantId, readGrant(db, occupantId, id), origin, new Date());
}

function prepare(input: unknown, page: readonly WorkMapPublishSection[]) {
  const prepared = prepareAccessChange(input, page);
  if (!prepared.ok) throw new AccessStoreError(prepared.error);
  return prepared.value;
}

/** Shares the page with someone directly, without a request. */
export async function shareAccess(
  db: DatabaseSync,
  occupantId: string,
  input: unknown,
  relay: ProjectionRelay | undefined,
  origin: string | null,
): Promise<AccessPerson> {
  const page = readAccessPage(db, occupantId);
  if (!page?.published) throw new AccessStoreError("page-not-published");
  const record = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const email = typeof record.email === "string" ? record.email.trim() : "";
  if (!name) throw new AccessStoreError("name-required");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AccessStoreError("email-invalid");
  // One record per person: someone who already has one gets it changed or
  // given again, not a second link.
  const existing = listAccess(db, occupantId, origin).find(
    (person) => person.email.toLowerCase() === email.toLowerCase(),
  );
  if (existing) throw new AccessStoreError("already-shared", existing.id);
  const change = prepare(input, page.sections);
  const expiresAt = accessExpiry(change.days, new Date());
  const grant = await createProjectionGrant(db, occupantId, page.projectionId, expiresAt, relay, null, {
    name,
    email,
    source: "shared",
    sections: change.sections,
  });
  recordActivity(db, occupantId, {
    grantId: grant.id,
    kind: "shared",
    sections: change.sections,
    expiresAt,
    message: change.message,
  });
  return readAccess(db, occupantId, grant.id, origin);
}

/**
 * Names a link, or changes who it's for: the same name and email used to
 * share it. What the link opens is unchanged.
 */
export function renameAccess(db: DatabaseSync, occupantId: string, id: string, input: unknown, origin: string | null) {
  readGrant(db, occupantId, id);
  const record = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const name = typeof record.name === "string" ? record.name.trim().slice(0, 200) : "";
  const email = typeof record.email === "string" ? record.email.trim().slice(0, 320) : "";
  if (!name) throw new AccessStoreError("name-required");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AccessStoreError("email-invalid");
  const other = email
    ? listAccess(db, occupantId, origin).find(
        (person) => person.id !== id && person.email.toLowerCase() === email.toLowerCase(),
      )
    : undefined;
  if (other) throw new AccessStoreError("already-shared", other.id);
  db.prepare("UPDATE projection_access_grants SET person_name = ?, person_email = ? WHERE id = ?").run(name, email, id);
  return readAccess(db, occupantId, id, origin);
}

/** Changes what someone's link opens and for how long. The link stays the same. */
export async function changeAccess(
  db: DatabaseSync,
  occupantId: string,
  id: string,
  input: unknown,
  relay: ProjectionRelay | undefined,
  origin: string | null,
): Promise<AccessPerson> {
  const row = readGrant(db, occupantId, id);
  const state = accessState({ expiresAt: row.expires_at, revokedAt: row.revoked_at }, new Date());
  if (state === "revoked" || state === "expired") throw new AccessStoreError("access-ended");
  const page = (JSON.parse(row.projection_json) as { sections: WorkMapPublishSection[] }).sections;
  const change = prepare(input, page);
  const now = new Date().toISOString();
  const expiresAt = accessExpiry(change.days, new Date());
  const minted = await mintOccupantApproval(occupantId, {
    purpose: "Change access to the page",
    destination: `relay:${row.slug}`,
    operations: [planAccessChange({ grantId: id, slug: row.slug, sections: change.sections, expiresAt })],
    now,
  });
  // The Relay first: if it can't be reached, nothing changes here either.
  if (relay?.updateGrant) {
    await relay.updateGrant(row.slug, row.token_hash, { expiresAt, sections: change.sections });
  }
  db.exec("BEGIN");
  try {
    persistApprovedChange(db, minted.changeSet, minted.hash, minted.approval);
    db.prepare("UPDATE projection_access_grants SET expires_at = ?, sections_json = ? WHERE id = ?").run(
      expiresAt,
      change.sections ? JSON.stringify(change.sections) : null,
      id,
    );
    persistAuditEvent(db, {
      id: randomUUID(),
      occupantId,
      eventType: "projection-grant-changed",
      entityType: "projection-access-grant",
      entityId: id,
      changeSetId: minted.changeSet.id,
      approvalId: minted.approval.id,
      detail: { slug: row.slug, sections: change.sections, expiresAt },
      occurredAt: now,
    });
    recordActivity(db, occupantId, {
      grantId: id,
      kind: "changed",
      sections: change.sections,
      expiresAt,
      message: change.message,
      occurredAt: now,
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return readAccess(db, occupantId, id, origin);
}

export async function revokeAccess(
  db: DatabaseSync,
  occupantId: string,
  id: string,
  input: unknown,
  relay: ProjectionRelay | undefined,
  origin: string | null,
): Promise<AccessPerson> {
  const row = readGrant(db, occupantId, id);
  if (row.revoked_at) return readAccess(db, occupantId, id, origin);
  const record = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const message = typeof record.message === "string" ? record.message.trim().slice(0, 2000) : "";
  await revokeProjectionGrant(db, occupantId, row.projection_id, id, relay);
  recordActivity(db, occupantId, { grantId: id, kind: "revoked", message });
  return readAccess(db, occupantId, id, origin);
}

/**
 * Gives someone whose access ended a new link, with what they should see now.
 * The old link stays dead; their record and Activity carry on.
 */
export async function restoreAccess(
  db: DatabaseSync,
  occupantId: string,
  id: string,
  input: unknown,
  relay: ProjectionRelay | undefined,
  origin: string | null,
): Promise<AccessPerson> {
  const row = readGrant(db, occupantId, id);
  const state = accessState({ expiresAt: row.expires_at, revokedAt: row.revoked_at }, new Date());
  if (state !== "revoked" && state !== "expired") throw new AccessStoreError("access-active");
  const projection = readProjection(db, occupantId, row.projection_id);
  if (!projection) throw new AccessStoreError("page-not-published");
  const change = prepare(input, projection.sections);
  const token = randomBytes(24).toString("base64url");
  const hash = tokenHash(token);
  const now = new Date().toISOString();
  const expiresAt = accessExpiry(change.days, new Date());
  const minted = await mintOccupantApproval(occupantId, {
    purpose: "Give access to the page again",
    destination: `relay:${row.slug}`,
    operations: [planProjectionGrant({ projectionId: row.projection_id, slug: row.slug, expiresAt, tokenHash: hash })],
    now,
  });
  if (relay?.grant) await relay.grant(row.slug, { token, expiresAt, sections: change.sections });
  db.exec("BEGIN");
  try {
    persistApprovedChange(db, minted.changeSet, minted.hash, minted.approval);
    db.prepare(
      `UPDATE projection_access_grants
          SET token_hash = ?, link_token = ?, expires_at = ?, sections_json = ?, revoked_at = NULL
        WHERE id = ?`,
    ).run(hash, token, expiresAt, change.sections ? JSON.stringify(change.sections) : null, id);
    persistAuditEvent(db, {
      id: randomUUID(),
      occupantId,
      eventType: "projection-grant-restored",
      entityType: "projection-access-grant",
      entityId: id,
      changeSetId: minted.changeSet.id,
      approvalId: minted.approval.id,
      detail: { slug: row.slug, sections: change.sections, expiresAt },
      occurredAt: now,
    });
    recordActivity(db, occupantId, {
      grantId: id,
      kind: "restored",
      sections: change.sections,
      expiresAt,
      message: change.message,
      occurredAt: now,
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return readAccess(db, occupantId, id, origin);
}

/** Deletes someone's record and its Activity. A link that still works is revoked first. */
export async function removeAccess(
  db: DatabaseSync,
  occupantId: string,
  id: string,
  relay: ProjectionRelay | undefined,
) {
  const row = readGrant(db, occupantId, id);
  if (!row.revoked_at) await revokeProjectionGrant(db, occupantId, row.projection_id, id, relay);
  const now = new Date().toISOString();
  const minted = await mintOccupantApproval(occupantId, {
    purpose: "Remove an access record",
    destination: `relay:${row.slug}`,
    operations: [planAccessRemove({ grantId: id, slug: row.slug })],
    now,
  });
  db.exec("BEGIN");
  try {
    persistApprovedChange(db, minted.changeSet, minted.hash, minted.approval);
    db.prepare("DELETE FROM access_activity WHERE grant_id = ?").run(id);
    db.prepare("DELETE FROM projection_access_grants WHERE id = ?").run(id);
    persistAuditEvent(db, {
      id: randomUUID(),
      occupantId,
      eventType: "projection-grant-removed",
      entityType: "projection-access-grant",
      entityId: id,
      changeSetId: minted.changeSet.id,
      approvalId: minted.approval.id,
      detail: { slug: row.slug },
      occurredAt: now,
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/** The email carrying someone's link, for a Gmail draft the occupant sends. */
export function accessEmail(db: DatabaseSync, occupantId: string, id: string, origin: string | null) {
  const person = readAccess(db, occupantId, id, origin);
  if (!person.link || person.state === "revoked" || person.state === "expired") {
    throw new AccessStoreError("link-unavailable");
  }
  if (!person.email) throw new AccessStoreError("email-invalid");
  const profile = readProfile(db, occupantId);
  const fromName = profile.fullName.trim() || `${profile.firstName} ${profile.lastName}`.trim() || "Me";
  const latest = person.activity.find((entry) => entry.message && entry.kind !== "asked" && entry.kind !== "opened");
  return {
    to: person.email,
    ...accessEmailDraft({
      fromName,
      toName: person.name,
      link: person.link,
      sections: person.wholePage ? null : person.sections,
      expiresAt: person.expiresAt,
      message: latest?.message ?? "",
    }),
  };
}
