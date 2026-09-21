import type { ChangeSet } from "./governance";

export type WorklogEntry = {
  id: string;
  occupantId: string;
  occurredOn: string;
  title: string;
  content: string;
  roleId: string | null;
  project: string;
  tags: string[];
  createdAt: string;
};

export type WorklogFactProposal = {
  factType: "achievement" | "skill";
  subjectId: string;
  statement: string;
  evidenceRef: string;
  confidence: "candidate" | "supported";
};

export type WorklogError = "title-required" | "content-required" | "date-invalid";

export function prepareWorklogEntry(
  entry: WorklogEntry,
):
  | { ok: true; value: WorklogEntry }
  | { ok: false; error: WorklogError } {
  if (!entry.title.trim()) return { ok: false, error: "title-required" };
  if (!entry.content.trim()) return { ok: false, error: "content-required" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.occurredOn)) {
    return { ok: false, error: "date-invalid" };
  }
  return {
    ok: true,
    value: {
      ...entry,
      title: entry.title.trim(),
      content: entry.content.trim(),
      project: entry.project.trim(),
      tags: [...new Set(entry.tags.map((tag) => tag.trim()).filter(Boolean))],
    },
  };
}

export function proposeFactsFromWorklog(
  entry: WorklogEntry,
): WorklogFactProposal[] {
  const sentences = entry.content
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 18);
  const achievementSignals =
    /\b(led|built|launched|reduced|increased|improved|cut|saved|migrated|delivered|mentored|resolved|automated)\b/i;
  const metricSignals = /\b\d+(?:\.\d+)?(?:%|x| minutes?| hours?| days?| systems?| people| users?)?\b/i;

  const proposals: WorklogFactProposal[] = [];
  for (const sentence of sentences) {
    if (!achievementSignals.test(sentence)) continue;
    proposals.push({
      factType: "achievement",
      subjectId: entry.roleId ?? "",
      statement: sentence.replace(/\s+/g, " "),
      evidenceRef: entry.id,
      confidence: metricSignals.test(sentence) ? "supported" : "candidate",
    });
  }
  for (const tag of entry.tags) {
    if (!tag.toLowerCase().startsWith("skill:")) continue;
    const skill = tag.slice("skill:".length).trim();
    if (!skill) continue;
    proposals.push({
      factType: "skill",
      subjectId: entry.roleId ?? "",
      statement: skill,
      evidenceRef: entry.id,
      confidence: "candidate",
    });
  }
  return proposals;
}

export function planWorklogFactChangeSet(input: {
  id: string;
  occupantId: string;
  entryTitle: string;
  evidenceId: string;
  proposals: WorklogFactProposal[];
  createdAt: string;
}): ChangeSet | null {
  if (input.proposals.length === 0) return null;
  return {
    id: input.id,
    occupantId: input.occupantId,
    purpose: `Promote facts from ${input.entryTitle.trim()}`,
    destination: "worklog",
    createdAt: input.createdAt,
    operations: input.proposals.map((proposal, index) => ({
      action: "create" as const,
      entityType: "career-fact",
      values: {
        id: `${input.id}:fact:${index}`,
        factType: proposal.factType,
        subjectId: proposal.subjectId,
        value:
          proposal.factType === "skill"
            ? { name: proposal.statement, confidence: proposal.confidence }
            : {
                statement: proposal.statement,
                confidence: proposal.confidence,
              },
        evidenceIds: [input.evidenceId],
      },
    })),
  };
}
