export type OpportunityKind = "role" | "project" | "speaking" | "connection";

export type Opportunity = {
  id: string;
  occupantId: string;
  kind: OpportunityKind;
  title: string;
  organization: string;
  sourceUrl: string;
  location: string;
  fitSummary: string;
  status: "saved" | "pursuing" | "paused" | "closed";
  createdAt: string;
};

export type ApplicationStage =
  | "preparing"
  | "submitted"
  | "screen"
  | "interview"
  | "offer"
  | "accepted"
  | "declined"
  | "withdrawn"
  | "rejected";

export type Application = {
  id: string;
  occupantId: string;
  opportunityId: string;
  resumeRevisionId: string | null;
  stage: ApplicationStage;
  nextStep: string;
  deadline: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Contact = {
  id: string;
  occupantId: string;
  name: string;
  organization: string;
  role: string;
  email: string;
  notes: string;
  createdAt: string;
};

export type CareerPlan = {
  id: string;
  occupantId: string;
  title: string;
  outcome: string;
  horizon: string;
  status: "active" | "completed" | "paused";
  tasks: CareerTask[];
  createdAt: string;
};

export type CareerTask = {
  id: string;
  planId: string;
  title: string;
  dueOn: string | null;
  status: "todo" | "doing" | "done";
};

export type ExternalActionKind = "application" | "message" | "schedule";

export type ExternalAction = {
  id: string;
  occupantId: string;
  kind: ExternalActionKind;
  destination: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  status: "proposed" | "approved" | "completed" | "failed";
  createdAt: string;
};

export type CareerManagementError =
  | "title-required"
  | "organization-required"
  | "transition-invalid"
  | "destination-required"
  | "idempotency-required";

const transitions: Record<ApplicationStage, ApplicationStage[]> = {
  preparing: ["submitted", "withdrawn"],
  submitted: ["screen", "interview", "rejected", "withdrawn"],
  screen: ["interview", "rejected", "withdrawn"],
  interview: ["offer", "rejected", "withdrawn"],
  offer: ["accepted", "declined"],
  accepted: [],
  declined: [],
  withdrawn: [],
  rejected: [],
};

export function prepareOpportunity(
  opportunity: Opportunity,
):
  | { ok: true; value: Opportunity }
  | { ok: false; error: CareerManagementError } {
  if (!opportunity.title.trim()) return { ok: false, error: "title-required" };
  if (!opportunity.organization.trim()) {
    return { ok: false, error: "organization-required" };
  }
  return {
    ok: true,
    value: {
      ...opportunity,
      title: opportunity.title.trim(),
      organization: opportunity.organization.trim(),
    },
  };
}

export function transitionApplication(
  application: Application,
  stage: ApplicationStage,
  updatedAt: string,
):
  | { ok: true; value: Application }
  | { ok: false; error: CareerManagementError } {
  if (!transitions[application.stage].includes(stage)) {
    return { ok: false, error: "transition-invalid" };
  }
  return { ok: true, value: { ...application, stage, updatedAt } };
}

export function prepareExternalAction(
  action: ExternalAction,
):
  | { ok: true; value: ExternalAction }
  | { ok: false; error: CareerManagementError } {
  if (!action.destination.trim()) {
    return { ok: false, error: "destination-required" };
  }
  if (!action.idempotencyKey.trim()) {
    return { ok: false, error: "idempotency-required" };
  }
  return { ok: true, value: action };
}
