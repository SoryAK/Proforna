import type { DatabaseSync } from "node:sqlite";
import {
  presentOccupantNotices,
  type OccupantNotice,
} from "../core/index";

export function listOccupantNotices(
  db: DatabaseSync,
  occupantId: string,
): OccupantNotice[] {
  const accessRequests = db
    .prepare(
      `SELECT r.id AS id,
              r.requester_name AS requesterName,
              r.requester_email AS requesterEmail,
              r.message AS message,
              r.created_at AS createdAt
         FROM projection_access_requests r
         JOIN interactive_projections p ON p.id = r.projection_id
        WHERE p.occupant_id = ? AND r.status = 'new'`,
    )
    .all(occupantId) as Array<{
    id: string;
    requesterName: string;
    requesterEmail: string;
    message: string;
    createdAt: string;
  }>;
  const proposedChangeSets = db
    .prepare(
      `SELECT id, purpose, created_at AS createdAt
         FROM change_sets
        WHERE occupant_id = ? AND status = 'proposed'`,
    )
    .all(occupantId) as Array<{
    id: string;
    purpose: string;
    createdAt: string;
  }>;
  return presentOccupantNotices({ accessRequests, proposedChangeSets });
}
