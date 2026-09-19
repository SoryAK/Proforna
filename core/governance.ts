export type ChangeOperation = {
  action: "create" | "supersede" | "transition" | "publish" | "revoke" | "send";
  entityType: string;
  entityId?: string;
  values: Record<string, unknown>;
};

export type ChangeSet = {
  id: string;
  occupantId: string;
  purpose: string;
  destination: string;
  operations: ChangeOperation[];
  createdAt: string;
};

export type Approval = {
  id: string;
  changeSetId: string;
  changeHash: string;
  destination: string;
  approvedBy: string;
  approvedAt: string;
  expiresAt: string | null;
};

export type AuditEvent = {
  id: string;
  occupantId: string;
  eventType: string;
  entityType: string;
  entityId: string;
  changeSetId: string | null;
  approvalId: string | null;
  detail: Record<string, unknown>;
  occurredAt: string;
};

export type GovernanceError =
  | "changes-required"
  | "purpose-required"
  | "destination-required"
  | "approval-missing"
  | "approval-expired"
  | "approval-destination"
  | "approval-content";

export function prepareChangeSet(input: ChangeSet):
  | { ok: true; value: ChangeSet }
  | { ok: false; error: GovernanceError } {
  if (!input.purpose.trim()) return { ok: false, error: "purpose-required" };
  if (!input.destination.trim()) {
    return { ok: false, error: "destination-required" };
  }
  if (input.operations.length === 0) {
    return { ok: false, error: "changes-required" };
  }
  return {
    ok: true,
    value: {
      ...input,
      purpose: input.purpose.trim(),
      destination: input.destination.trim(),
      operations: input.operations.map((operation) => ({
        ...operation,
        entityType: operation.entityType.trim(),
        entityId: operation.entityId?.trim() || undefined,
      })),
    },
  };
}

export async function hashChangeSet(changeSet: ChangeSet): Promise<string> {
  const bytes = new TextEncoder().encode(stableStringify(changeSet));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function createApproval(
  changeSet: ChangeSet,
  input: {
    id: string;
    approvedBy: string;
    approvedAt: string;
    expiresAt?: string | null;
  },
): Promise<Approval> {
  return {
    id: input.id,
    changeSetId: changeSet.id,
    changeHash: await hashChangeSet(changeSet),
    destination: changeSet.destination,
    approvedBy: input.approvedBy,
    approvedAt: input.approvedAt,
    expiresAt: input.expiresAt ?? null,
  };
}

export async function authorizeChangeSet(
  changeSet: ChangeSet,
  approval: Approval | null,
  now: string,
): Promise<{ ok: true } | { ok: false; error: GovernanceError }> {
  if (!approval || approval.changeSetId !== changeSet.id) {
    return { ok: false, error: "approval-missing" };
  }
  if (approval.expiresAt && approval.expiresAt <= now) {
    return { ok: false, error: "approval-expired" };
  }
  if (approval.destination !== changeSet.destination) {
    return { ok: false, error: "approval-destination" };
  }
  if (approval.changeHash !== (await hashChangeSet(changeSet))) {
    return { ok: false, error: "approval-content" };
  }
  return { ok: true };
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`)
    .join(",")}}`;
}
