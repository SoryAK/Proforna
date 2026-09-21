import { presentInboundMessageNotice } from "./conversation";

export type OccupantNoticeKind =
  | "access-request"
  | "proposed-change"
  | "inbound-message";

export type OccupantNoticeHref =
  | "opportunities"
  | "worklog"
  | "history"
  | "resumes"
  | "network";

export type OccupantNotice = {
  id: string;
  kind: OccupantNoticeKind;
  title: string;
  detail: string;
  href: OccupantNoticeHref;
  createdAt: string;
};

export function noticeHrefForDestination(
  destination: string,
): OccupantNoticeHref {
  const dest = destination.trim().toLowerCase();
  if (
    dest.startsWith("relay:") ||
    dest.startsWith("work-map") ||
    dest === "history"
  ) {
    return "history";
  }
  if (
    dest.startsWith("application:") ||
    dest.startsWith("opportunity") ||
    dest === "opportunities"
  ) {
    return "opportunities";
  }
  if (
    dest.startsWith("contact") ||
    dest === "network" ||
    dest.includes("@")
  ) {
    return "network";
  }
  if (
    dest.startsWith("resume") ||
    dest === "studio" ||
    dest === "resumes"
  ) {
    return "resumes";
  }
  return "worklog";
}

export function presentOccupantNotices(input: {
  accessRequests: Array<{
    id: string;
    requesterName: string;
    requesterEmail: string;
    message: string;
    createdAt: string;
  }>;
  proposedChangeSets: Array<{
    id: string;
    purpose: string;
    destination: string;
    createdAt: string;
  }>;
  inboundThreads?: Array<{
    contactId: string;
    contactName: string;
    preview: string;
    createdAt: string;
  }>;
}): OccupantNotice[] {
  const notices: OccupantNotice[] = [
    ...input.accessRequests.map((request) => ({
      id: request.id,
      kind: "access-request" as const,
      title: `${request.requesterName} asked to view the Work Map`,
      detail: request.message.trim() || request.requesterEmail,
      href: "opportunities" as const,
      createdAt: request.createdAt,
    })),
    ...input.proposedChangeSets.map((changeSet) => ({
      id: changeSet.id,
      kind: "proposed-change" as const,
      title: changeSet.purpose,
      detail: "Waiting for approval",
      href: noticeHrefForDestination(changeSet.destination),
      createdAt: changeSet.createdAt,
    })),
    ...(input.inboundThreads ?? []).map(presentInboundMessageNotice),
  ];
  return notices.sort((left, right) => {
    if (left.createdAt !== right.createdAt) {
      return left.createdAt < right.createdAt ? 1 : -1;
    }
    return left.id < right.id ? 1 : -1;
  });
}
