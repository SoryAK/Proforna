import type { DatabaseSync } from "node:sqlite";
import {
  presentOccupantNotices,
  type OccupantNotice,
} from "../core/index";
import { listUnreadInboundThreads } from "./conversation";

export function listOccupantNotices(
  db: DatabaseSync,
  occupantId: string,
): OccupantNotice[] {
  const proposedChangeSets = db
    .prepare(
      `SELECT id, purpose, destination, created_at AS createdAt
         FROM change_sets
        WHERE occupant_id = ? AND status = 'proposed'`,
    )
    .all(occupantId) as Array<{
    id: string;
    purpose: string;
    destination: string;
    createdAt: string;
  }>;
  return presentOccupantNotices({
    // Access requests are answered in Requests, which counts them on its own
    // button, so the notices bell doesn't repeat them.
    accessRequests: [],
    proposedChangeSets,
    inboundThreads: listUnreadInboundThreads(db, occupantId),
  });
}
