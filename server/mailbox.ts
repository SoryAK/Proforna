import { randomBytes, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  planJobMail,
  prepareMailboxConnection,
  pursuitsMatch,
  stagesToward,
  MAILBOX_PROVIDERS,
  type ApplicationStage,
  type InboundMail,
  type JobMailPlan,
} from "../core/index";
import {
  createApplication,
  createInterview,
  createOffer,
  createOpportunity,
  transitionOwnedApplication,
} from "./career-management";
import { persistAuditEvent } from "./change-sets";
import { receiveInboundMessage } from "./conversation";
import {
  exchangeGmailCode,
  gmailAccountEmail,
  gmailAuthorizationUrl,
  gmailOAuthConfigured,
  listJobMail,
  profornaAppOrigin,
  refreshGmailTokens,
  GmailClientError,
} from "./gmail";

type JsonObject = Record<string, unknown>;

export type MailboxView = {
  id: string;
  provider: string;
  label: string;
  accountEmail: string;
  status: "pending" | "connected" | "error";
  lastError: string;
  createdAt: string;
  updatedAt: string;
};

export type MailboxScan = {
  scanned: number;
  kept: number;
  alreadyKept: number;
  ignored: number;
  findings: Array<{
    providerMessageId: string;
    category: string;
    opportunityId: string | null;
    contactId: string | null;
    alreadyKept: boolean;
  }>;
};

type ConnectionRow = {
  id: string;
  occupant_id: string;
  provider: string;
  label: string;
  account_email: string;
  status: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: string | null;
  scopes: string;
  oauth_state: string;
  last_error: string;
  created_at: string;
  updated_at: string;
};

export function readMailbox(
  db: DatabaseSync,
  occupantId: string,
): { oauthConfigured: boolean; providers: readonly string[]; mailbox: MailboxView | null } {
  return {
    oauthConfigured: gmailOAuthConfigured(),
    providers: MAILBOX_PROVIDERS,
    mailbox: present(loadConnection(db, occupantId)),
  };
}

export function beginMailboxConnect(
  db: DatabaseSync,
  occupantId: string,
  input: JsonObject,
): { mailbox: MailboxView; authorizationUrl: string } {
  if (!gmailOAuthConfigured()) {
    throw new MailboxStoreError(
      "oauth-not-configured",
      "Set GMAIL_OAUTH_CLIENT_ID and GMAIL_OAUTH_CLIENT_SECRET before connecting Gmail.",
    );
  }
  const prepared = prepareMailboxConnection({
    provider: input.provider,
    label: input.label,
  });
  if (!prepared.ok) throw new MailboxStoreError(prepared.error);
  const existing = loadConnection(db, occupantId);
  if (existing?.status === "connected") {
    throw new MailboxStoreError("mailbox-exists");
  }
  const now = new Date().toISOString();
  const state = randomBytes(16).toString("hex");
  const id = existing?.id ?? randomUUID();
  if (existing) {
    db.prepare(
      `UPDATE mailbox_connections
          SET provider = ?, label = ?, status = 'pending', oauth_state = ?,
              last_error = '', updated_at = ?
        WHERE id = ? AND occupant_id = ?`,
    ).run(
      prepared.value.provider,
      prepared.value.label,
      state,
      now,
      id,
      occupantId,
    );
  } else {
    db.prepare(
      `INSERT INTO mailbox_connections
        (id, occupant_id, provider, label, account_email, status, access_token,
         refresh_token, token_expires_at, scopes, oauth_state, last_error,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, '', 'pending', '', '', NULL, '', ?, '', ?, ?)`,
    ).run(
      id,
      occupantId,
      prepared.value.provider,
      prepared.value.label,
      state,
      now,
      now,
    );
  }
  const mailbox = present(loadConnection(db, occupantId));
  if (!mailbox) throw new MailboxStoreError("mailbox-missing");
  return { mailbox, authorizationUrl: gmailAuthorizationUrl(state) };
}

export function updateMailbox(
  db: DatabaseSync,
  occupantId: string,
  input: JsonObject,
): MailboxView {
  const existing = loadConnection(db, occupantId);
  if (!existing) throw new MailboxStoreError("mailbox-missing");
  const prepared = prepareMailboxConnection({
    provider: input.provider,
    label: input.label,
  });
  if (!prepared.ok) throw new MailboxStoreError(prepared.error);
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE mailbox_connections
        SET provider = ?, label = ?, updated_at = ?
      WHERE id = ? AND occupant_id = ?`,
  ).run(prepared.value.provider, prepared.value.label, now, existing.id, occupantId);
  const mailbox = present(loadConnection(db, occupantId));
  if (!mailbox) throw new MailboxStoreError("mailbox-missing");
  return mailbox;
}

export function deleteMailbox(db: DatabaseSync, occupantId: string): void {
  const existing = loadConnection(db, occupantId);
  if (!existing) throw new MailboxStoreError("mailbox-missing");
  db.prepare(
    "UPDATE mailbox_findings SET connection_id = NULL WHERE connection_id = ? AND occupant_id = ?",
  ).run(existing.id, occupantId);
  db.prepare(
    "DELETE FROM mailbox_connections WHERE id = ? AND occupant_id = ?",
  ).run(existing.id, occupantId);
}

export async function completeGmailCallback(
  db: DatabaseSync,
  input: { code?: string; state?: string; error?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const state = input.state?.trim() ?? "";
  const row = state
    ? (db
        .prepare(
          `SELECT * FROM mailbox_connections WHERE oauth_state = ? AND status = 'pending'`,
        )
        .get(state) as ConnectionRow | undefined)
    : undefined;
  if (!row) return { ok: false, error: "state-mismatch" };
  if (input.error) {
    rememberError(db, row, "The Gmail connection was cancelled.");
    return { ok: false, error: "oauth-denied" };
  }
  const code = input.code?.trim() ?? "";
  if (!code) {
    rememberError(db, row, "Gmail did not return a sign-in code.");
    return { ok: false, error: "code-missing" };
  }
  try {
    const tokens = await exchangeGmailCode(code);
    const email = await gmailAccountEmail(tokens.accessToken);
    const now = new Date().toISOString();
    db.prepare(
      `UPDATE mailbox_connections
          SET account_email = ?, status = 'connected', access_token = ?,
              refresh_token = ?, token_expires_at = ?, scopes = ?,
              oauth_state = '', last_error = '', updated_at = ?
        WHERE id = ?`,
    ).run(
      email,
      tokens.accessToken,
      tokens.refreshToken,
      tokens.expiresAt,
      tokens.scope,
      now,
      row.id,
    );
    return { ok: true };
  } catch (error) {
    const message =
      error instanceof GmailClientError && error.code === "access-refused"
        ? "Gmail refused the connection. Connect it again."
        : "Gmail could not be connected.";
    rememberError(db, row, message);
    return { ok: false, error: "oauth-failed" };
  }
}

export function mailboxReturnUrl(notice: "connected" | "error"): string {
  return `${profornaAppOrigin()}/#/opportunities?mailbox=${notice}`;
}

export async function scanMailbox(
  db: DatabaseSync,
  occupantId: string,
): Promise<MailboxScan> {
  const connection = loadConnection(db, occupantId);
  if (!connection) throw new MailboxStoreError("mailbox-missing");
  if (connection.status !== "connected") {
    throw new MailboxStoreError("mailbox-not-connected");
  }
  const accessToken = await usableAccessToken(db, connection);
  let messages: InboundMail[];
  try {
    messages = await listJobMail(accessToken);
  } catch (error) {
    throw scanFailure(db, connection, error);
  }
  const findings: MailboxScan["findings"] = [];
  let kept = 0;
  let alreadyKept = 0;
  let ignored = 0;
  for (const message of messages) {
    const prior = db
      .prepare(
        `SELECT category, opportunity_id AS opportunityId, contact_id AS contactId
           FROM mailbox_findings
          WHERE occupant_id = ? AND provider_message_id = ?`,
      )
      .get(occupantId, message.providerMessageId) as
      | { category: string; opportunityId: string | null; contactId: string | null }
      | undefined;
    if (prior) {
      alreadyKept += 1;
      findings.push({
        providerMessageId: message.providerMessageId,
        category: prior.category,
        opportunityId: prior.opportunityId,
        contactId: prior.contactId,
        alreadyKept: true,
      });
      continue;
    }
    const plan = planJobMail(message);
    if (!plan) {
      ignored += 1;
      findings.push({
        providerMessageId: message.providerMessageId,
        category: "",
        opportunityId: null,
        contactId: null,
        alreadyKept: false,
      });
      continue;
    }
    const recorded = await recordJobMail(db, occupantId, connection.id, plan);
    kept += 1;
    findings.push({
      providerMessageId: plan.providerMessageId,
      category: plan.category,
      opportunityId: recorded.opportunityId,
      contactId: recorded.contactId,
      alreadyKept: false,
    });
  }
  db.prepare(
    `UPDATE mailbox_connections
        SET last_error = '', status = 'connected', updated_at = ?
      WHERE id = ? AND occupant_id = ?`,
  ).run(new Date().toISOString(), connection.id, occupantId);
  return { scanned: messages.length, kept, alreadyKept, ignored, findings };
}

async function recordJobMail(
  db: DatabaseSync,
  occupantId: string,
  connectionId: string,
  plan: JobMailPlan,
): Promise<{ opportunityId: string; contactId: string | null; applicationId: string | null }> {
  let contactId: string | null = null;
  let messageId: string | null = null;
  if (plan.contact && plan.messageBody) {
    const received = receiveInboundMessage(db, occupantId, {
      email: plan.contact.email,
      name: plan.contact.name,
      organization: plan.contact.organization,
      body: plan.messageBody,
    });
    contactId = received.contact.id;
    messageId = received.message.id;
    db.prepare(
      `UPDATE contacts
          SET role = CASE WHEN role = '' THEN ? ELSE role END,
              notes = CASE WHEN notes = '' THEN ? ELSE notes END,
              organization = CASE WHEN organization = '' THEN ? ELSE organization END
        WHERE id = ? AND occupant_id = ?`,
    ).run(
      plan.contact.role,
      plan.contact.notes,
      plan.contact.organization,
      contactId,
      occupantId,
    );
  }
  const opportunityId = ensureOpportunity(db, occupantId, plan, contactId);
  let applicationId: string | null = null;
  let interviewId: string | null = null;
  let offerId: string | null = null;
  if (plan.application) {
    const application = await ensureApplication(
      db,
      occupantId,
      opportunityId,
      plan.application.stage,
      plan.application.nextStep,
    );
    applicationId = application.id;
    if (plan.interview) {
      interviewId = ensureInterview(db, occupantId, application.id, plan.interview);
    }
    if (plan.offer) {
      offerId = ensureOffer(db, occupantId, application.id, plan.offer);
    }
  }
  const findingId = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO mailbox_findings
      (id, occupant_id, connection_id, provider_message_id, category, contact_id,
       opportunity_id, application_id, interview_id, offer_id, message_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    findingId,
    occupantId,
    connectionId,
    plan.providerMessageId,
    plan.category,
    contactId,
    opportunityId,
    applicationId,
    interviewId,
    offerId,
    messageId,
    now,
  );
  persistAuditEvent(db, {
    id: randomUUID(),
    occupantId,
    eventType: "job-mail-recorded",
    entityType: "mailbox-finding",
    entityId: findingId,
    changeSetId: null,
    approvalId: null,
    detail: {
      category: plan.category,
      providerMessageId: plan.providerMessageId,
      opportunityId,
    },
    occurredAt: now,
  });
  return { opportunityId, contactId, applicationId };
}

function ensureOpportunity(
  db: DatabaseSync,
  occupantId: string,
  plan: JobMailPlan,
  contactId: string | null,
): string {
  const rows = db
    .prepare(
      `SELECT id, kind, title, organization
         FROM opportunities WHERE occupant_id = ?`,
    )
    .all(occupantId) as Array<{
    id: string;
    kind: string;
    title: string;
    organization: string;
  }>;
  const match = rows.find((row) => pursuitsMatch(row, plan.opportunity));
  if (match) {
    if (contactId) {
      db.prepare(
        `UPDATE opportunities
            SET contact_id = ?
          WHERE id = ? AND occupant_id = ?
            AND (contact_id IS NULL OR contact_id = '')`,
      ).run(contactId, match.id, occupantId);
    }
    return match.id;
  }
  const created = createOpportunity(db, occupantId, {
    kind: plan.opportunity.kind,
    title: plan.opportunity.title,
    organization: plan.opportunity.organization,
    sourceUrl: plan.opportunity.sourceUrl,
    location: plan.opportunity.location,
    fitSummary: plan.opportunity.fitSummary,
    contactId: contactId ?? "",
  });
  return created.id;
}

async function ensureApplication(
  db: DatabaseSync,
  occupantId: string,
  opportunityId: string,
  stage: ApplicationStage,
  nextStep: string,
): Promise<{ id: string }> {
  const existing = db
    .prepare(
      `SELECT id, stage FROM applications
        WHERE occupant_id = ? AND opportunity_id = ?
        ORDER BY created_at ASC LIMIT 1`,
    )
    .get(occupantId, opportunityId) as { id: string; stage: ApplicationStage } | undefined;
  if (!existing) {
    const created = createApplication(db, occupantId, opportunityId, { nextStep });
    for (const step of stagesToward(created.stage, stage)) {
      await transitionOwnedApplication(db, occupantId, created.id, step);
    }
    return { id: created.id };
  }
  const steps = stagesToward(existing.stage, stage);
  let current = existing.stage;
  for (const step of steps) {
    const moved = await transitionOwnedApplication(db, occupantId, existing.id, step);
    current = moved.stage;
  }
  if (steps.length > 0 && current === stage) {
    db.prepare(
      "UPDATE applications SET next_step = ?, updated_at = ? WHERE id = ? AND occupant_id = ?",
    ).run(nextStep, new Date().toISOString(), existing.id, occupantId);
  }
  return { id: existing.id };
}

function ensureInterview(
  db: DatabaseSync,
  occupantId: string,
  applicationId: string,
  interview: NonNullable<JobMailPlan["interview"]>,
): string {
  const existing = db
    .prepare(
      `SELECT id FROM interviews
        WHERE occupant_id = ? AND application_id = ? AND scheduled_at = ?`,
    )
    .get(occupantId, applicationId, interview.scheduledAt) as { id: string } | undefined;
  if (existing) return existing.id;
  return createInterview(db, occupantId, applicationId, interview).id;
}

function ensureOffer(
  db: DatabaseSync,
  occupantId: string,
  applicationId: string,
  offer: NonNullable<JobMailPlan["offer"]>,
): string {
  const existing = db
    .prepare(
      `SELECT id FROM offers
        WHERE occupant_id = ? AND application_id = ?
        ORDER BY created_at ASC LIMIT 1`,
    )
    .get(occupantId, applicationId) as { id: string } | undefined;
  if (existing) return existing.id;
  return createOffer(db, occupantId, applicationId, {
    summary: offer.summary,
    decisionDueAt: offer.decisionDueAt ?? "",
  }).id;
}

async function usableAccessToken(
  db: DatabaseSync,
  connection: ConnectionRow,
): Promise<string> {
  const expires = connection.token_expires_at
    ? Date.parse(connection.token_expires_at)
    : 0;
  if (connection.access_token && expires > Date.now() + 60_000) {
    return connection.access_token;
  }
  if (!connection.refresh_token) {
    rememberError(db, connection, "Gmail refused the connection. Connect it again.");
    throw new MailboxStoreError(
      "scan-failed",
      "Gmail refused the connection. Connect it again.",
    );
  }
  try {
    const tokens = await refreshGmailTokens(connection.refresh_token);
    const now = new Date().toISOString();
    db.prepare(
      `UPDATE mailbox_connections
          SET access_token = ?, refresh_token = ?, token_expires_at = ?,
              scopes = ?, status = 'connected', last_error = '', updated_at = ?
        WHERE id = ?`,
    ).run(
      tokens.accessToken,
      tokens.refreshToken,
      tokens.expiresAt,
      tokens.scope,
      now,
      connection.id,
    );
    return tokens.accessToken;
  } catch (error) {
    throw scanFailure(db, connection, error);
  }
}

function scanFailure(
  db: DatabaseSync,
  connection: ConnectionRow,
  error: unknown,
): MailboxStoreError {
  const refused = error instanceof GmailClientError && (error.code === "access-refused" || error.code === "token-rejected");
  const message = refused
    ? "Gmail refused the connection. Connect it again."
    : "Gmail could not be read.";
  rememberError(db, connection, message);
  return new MailboxStoreError("scan-failed", message);
}

function rememberError(db: DatabaseSync, connection: ConnectionRow, message: string) {
  db.prepare(
    `UPDATE mailbox_connections
        SET status = 'error', last_error = ?, oauth_state = '', updated_at = ?
      WHERE id = ?`,
  ).run(message, new Date().toISOString(), connection.id);
}

function loadConnection(
  db: DatabaseSync,
  occupantId: string,
): ConnectionRow | undefined {
  return db
    .prepare("SELECT * FROM mailbox_connections WHERE occupant_id = ?")
    .get(occupantId) as ConnectionRow | undefined;
}

function present(row: ConnectionRow | undefined): MailboxView | null {
  if (!row) return null;
  const status =
    row.status === "connected" || row.status === "error" ? row.status : "pending";
  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    accountEmail: row.account_email,
    status,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class MailboxStoreError extends Error {
  constructor(
    readonly code: string,
    readonly detail = "",
  ) {
    super(code);
  }
}
