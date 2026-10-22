import { useEffect, useMemo, useRef, useState } from "react";
import { careerHistoryIdentityKey, type CareerHistoryIdentity } from "@core/career-history";
import {
  applySameRole,
  heldFromCareer,
  hintHeldRoles,
  roleFieldDiffs,
  type ResumeFieldDiff,
  type ResumeMatchReason,
} from "@core/resume-compare";
import { ONBOARDING_NO_PLACE, type OnboardingCheckItem } from "@core/onboarding-review";
import { EMPTY_WORK_MAP_DETAILS, type WorkMapRole } from "@core/work-map";
import { CompareColumn, identityChoices, lineTakes, resumeMatchCopy } from "./OnboardingCompare";
import "./onboarding.css";

export type ReviewDraft = {
  localId: string;
  sourceRoleId: string | null;
  matchesId: string;
  kind: "job" | "internship" | "school";
  title: string;
  organization: string;
  locationLabel: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  description: string;
  achievements: string[];
};

type ReviewFields = Omit<ReviewDraft, "localId" | "sourceRoleId" | "matchesId">;

export type MergeRequest = {
  keeperRoleId: string | null;
  keeperDraft: ReviewDraft | null;
  keeperPatch: ReviewFields | null;
  dropRoleIds: string[];
  dropDraftIds: string[];
};

type MatchConfidence = "identical" | "likely" | "possible" | "partial";

type MatchRow = {
  key: string;
  copyId: string;
  matchesId: string;
  draft: ReviewDraft | null;
  identical: boolean;
  confidence: MatchConfidence;
  summary: string;
};

type MatchGroup = {
  id: string;
  representativeId: string;
  members: MatchRow[];
};

type BulkMode =
  | { scope: "groups"; action: "identical" | "delete" | "merge" }
  | { scope: "matches"; groupId: string; action: "snooze" | "delete" | "merge" };

const CONFIDENCE_RANK: Record<MatchConfidence, number> = {
  identical: 3,
  likely: 2,
  possible: 1,
  partial: 0,
};

const CONFIDENCE_LABEL: Record<MatchConfidence, string> = {
  identical: "Identical",
  likely: "Likely the same",
  possible: "Possible match",
  partial: "Partial match",
};

const SNOOZE_STORAGE = "proforna-duplicate-snoozes";
const DISTINCT_STORAGE = "proforna-duplicate-distinct";

export function duplicateReviewCount(
  roles: WorkMapRole[],
  drafts: ReviewDraft[],
  listedPairs: Array<{ id: string; matchesId: string }>,
): { active: number; total: number } {
  const groups = omitDistinct(
    buildMatchGroups(buildRows(roles, drafts, listedPairs), roles),
    new Set(readDistinct()),
  );
  const snoozed = new Set(readSnoozes());
  const count = (items: MatchGroup[]) => items.reduce((sum, group) => sum + group.members.length, 0);
  return { active: count(splitGroups(groups, snoozed, false)), total: count(groups) };
}

export function DuplicateReview({
  roles,
  drafts,
  listedPairs,
  notice,
  onClose,
  onChangeDraft,
  onDiscardDraft,
  onCommitDraft,
  onBulkDelete,
  onMerge,
}: {
  roles: WorkMapRole[];
  drafts: ReviewDraft[];
  listedPairs: Array<{ id: string; matchesId: string }>;
  notice: string | null;
  focusId?: string | null;
  onClose: () => void;
  onChangeDraft: (localId: string, patch: Partial<ReviewFields>) => void;
  onDiscardDraft: (localId: string) => void;
  onCommitDraft: (draft: ReviewDraft) => void;
  onBulkDelete: (roleIds: string[], draftIds: string[]) => Promise<void> | void;
  onMerge: (request: MergeRequest) => Promise<void> | void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  const [sortBy, setSortBy] = useState<"sure" | "unsure">("sure");
  const [snoozed, setSnoozed] = useState<string[]>(readSnoozes);
  const [distinct, setDistinct] = useState<string[]>(readDistinct);
  const [reviewingGroupId, setReviewingGroupId] = useState<string | null>(null);
  const [openedGroupId, setOpenedGroupId] = useState<string | null>(null);
  const [bulk, setBulk] = useState<BulkMode | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<MatchRow[] | null>(null);
  const [mergeRows, setMergeRows] = useState<MatchRow[] | null>(null);
  const [keeperValue, setKeeperValue] = useState<string | null>(null);
  const [stayPicks, setStayPicks] = useState<Record<string, "kept" | "incoming">>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const node = dialogRef.current;
    if (!node?.open) node?.showModal();
  }, []);

  useEffect(() => {
    localStorage.setItem(SNOOZE_STORAGE, JSON.stringify(snoozed));
  }, [snoozed]);

  useEffect(() => {
    localStorage.setItem(DISTINCT_STORAGE, JSON.stringify(distinct));
  }, [distinct]);

  const rows = useMemo(
    () => buildRows(roles, drafts, listedPairs),
    [roles, drafts, listedPairs],
  );
  const distinctSet = useMemo(() => new Set(distinct), [distinct]);
  const grouped = useMemo(
    () => omitDistinct(buildMatchGroups(rows, roles), distinctSet),
    [rows, roles, distinctSet],
  );
  const snoozedSet = useMemo(() => new Set(snoozed), [snoozed]);
  const activeGroups = useMemo(
    () => sortMatchGroups(splitGroups(grouped, snoozedSet, false), sortBy),
    [grouped, snoozedSet, sortBy],
  );
  const restingGroups = useMemo(
    () => sortMatchGroups(splitGroups(grouped, snoozedSet, true), sortBy),
    [grouped, snoozedSet, sortBy],
  );
  const sorted = activeGroups.flatMap((group) => group.members);
  const resting = restingGroups.flatMap((group) => group.members);
  const picked = pickedKey
    ? grouped.flatMap((group) => group.members).find((row) => row.key === pickedKey) ?? null
    : null;

  useEffect(() => {
    if (!reviewingGroupId) return;
    const alive = [...activeGroups, ...restingGroups].some((group) => group.id === reviewingGroupId);
    if (!alive) {
      setReviewingGroupId(null);
      setPickedKey(null);
    }
  }, [reviewingGroupId, activeGroups, restingGroups]);

  const reviewGroup =
    [...activeGroups, ...restingGroups].find((group) => group.members.some((member) => member.key === picked?.key)) ??
    [...activeGroups, ...restingGroups].find((group) => group.id === reviewingGroupId) ??
    null;
  const reviewIndex =
    picked && reviewGroup ? reviewGroup.members.findIndex((member) => member.key === picked.key) : -1;
  const duplicateCount = activeGroups.reduce((sum, group) => sum + group.members.length, 0);
  const identicalKeys = sorted.filter((row) => row.identical).map((row) => row.key);
  const selectedRows = sorted.filter((row) => checked.has(row.key));
  const comparison = picked ? comparisonFor(picked, roles) : null;

  function requestClose() {
    const node = dialogRef.current;
    if (node?.open) node.close();
    else onClose();
  }

  function toggleChecked(key: string) {
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function snoozeKeys(keys: string[]) {
    if (keys.length === 0) return;
    setHint(null);
    setSnoozed((current) => [...new Set([...current, ...keys])]);
    setChecked((current) => {
      const next = new Set(current);
      for (const key of keys) next.delete(key);
      return next;
    });
    setPendingDelete(null);
    setMergeRows(null);
    setKeeperValue(null);
  }

  function wakeKeys(keys: string[]) {
    setSnoozed((current) => current.filter((item) => !keys.includes(item)));
    if (keys[0]) setPickedKey(keys[0]);
  }

  function openReview(key: string) {
    const group = [...activeGroups, ...restingGroups].find((item) =>
      item.members.some((member) => member.key === key),
    );
    setHint(null);
    setPendingDelete(null);
    setMergeRows(null);
    setKeeperValue(null);
    setReviewingGroupId(group?.id ?? null);
    setPickedKey(key);
  }

  function leaveReview() {
    setPickedKey(null);
    setReviewingGroupId(null);
    setPendingDelete(null);
    setMergeRows(null);
    setKeeperValue(null);
    setStayPicks({});
  }

  function startReview(group: MatchGroup) {
    const first = group.members[0];
    if (first) openReview(first.key);
  }

  function openGroup(id: string) {
    const next = openedGroupId === id ? null : id;
    setOpenedGroupId(next);
    setBulk((mode) => (mode?.scope === "matches" && mode.groupId !== next ? null : mode));
  }

  function activateGroups(action: "identical" | "delete" | "merge") {
    setHint(null);
    if (bulk?.scope === "groups" && bulk.action === action) {
      if (action === "delete" && selectedRows.length > 0) {
        askDelete(selectedRows);
        return;
      }
      if (action === "merge" && selectedRows.length > 0) {
        askMerge(selectedRows);
        return;
      }
      setBulk(null);
      setChecked(new Set());
      return;
    }
    setBulk({ scope: "groups", action });
    setChecked(action === "identical" ? new Set(identicalKeys) : new Set());
  }

  function activateGroup(group: MatchGroup, action: "snooze" | "delete" | "merge") {
    const selected = group.members.filter((row) => checked.has(row.key));
    if (bulk?.scope === "matches" && bulk.groupId === group.id && bulk.action === action) {
      if (selected.length === 0) {
        setBulk(null);
        return;
      }
      if (action === "snooze") snoozeKeys(selected.map((row) => row.key));
      else if (action === "delete") askDelete(selected);
      else askMerge(selected);
      setBulk(null);
      return;
    }
    setChecked((current) => {
      const next = new Set(current);
      for (const row of group.members) next.delete(row.key);
      return next;
    });
    setBulk({ scope: "matches", groupId: group.id, action });
    setHint(null);
  }

  const bulkMessage = bulk
    ? bulk.scope === "groups"
      ? bulk.action === "identical"
        ? "Select identical is on. Choose the groups."
        : `${bulk.action === "delete" ? "Delete" : "Merge"} is on. Choose the groups.`
      : `${bulk.action === "snooze" ? "Snooze" : bulk.action === "delete" ? "Delete" : "Merge"} is on for this group. Choose the matches.`
    : null;

  function stepReview(delta: number) {
    if (!reviewGroup || reviewIndex < 0) return;
    const next = reviewGroup.members[reviewIndex + delta];
    if (next) setPickedKey(next.key);
  }

  function classifyDifferent(row: MatchRow) {
    const group = grouped.find((item) => item.members.some((member) => member.key === row.key));
    const index = group?.members.findIndex((member) => member.key === row.key) ?? -1;
    const next = group && index >= 0 ? (group.members[index + 1] ?? group.members[index - 1] ?? null) : null;
    setDistinct((current) => [...new Set([...current, row.key])]);
    setSnoozed((current) => current.filter((item) => item !== row.key));
    setChecked((current) => {
      const following = new Set(current);
      following.delete(row.key);
      return following;
    });
    setPendingDelete((current) => {
      const remaining = current?.filter((item) => item.key !== row.key) ?? null;
      return remaining && remaining.length > 0 ? remaining : null;
    });
    setMergeRows(null);
    setKeeperValue(null);
    setStayPicks({});
    setHint("Marked as a different role. It left this group.");
    if (next) setPickedKey(next.key);
    else leaveReview();
  }

  function toggleGroup(keys: string[]) {
    setHint(null);
    setChecked((current) => {
      const allOn = keys.length > 0 && keys.every((key) => current.has(key));
      const next = new Set(current);
      for (const key of keys) {
        if (allOn) next.delete(key);
        else next.add(key);
      }
      return next;
    });
  }

  function askDelete(target: MatchRow[]) {
    if (target.length === 0) {
      setHint("Select a group to delete its matches.");
      return;
    }
    setHint(null);
    setMergeRows(null);
    setKeeperValue(null);
    setPendingDelete(target);
  }

  function askMerge(target: MatchRow[]) {
    if (target.length === 0) {
      setHint("Select one group to merge.");
      return;
    }
    const representatives = new Set(target.map((row) => row.matchesId));
    if (representatives.size !== 1) {
      setHint("Those matches are grouped under more than one role. Select one group, then choose which role to keep.");
      return;
    }
    setHint(null);
    setPendingDelete(null);
    setMergeRows(target);
    setKeeperValue(null);
    setStayPicks({});
  }

  async function confirmDelete() {
    if (!pendingDelete || busy) return;
    const roleIds = pendingDelete.filter((row) => !row.draft).map((row) => row.copyId);
    const draftIds = pendingDelete.flatMap((row) => (row.draft ? [row.draft.localId] : []));
    setBusy(true);
    try {
      await onBulkDelete(roleIds, draftIds);
      setChecked((current) => {
        const next = new Set(current);
        for (const row of pendingDelete) next.delete(row.key);
        return next;
      });
      setPendingDelete(null);
      if (pickedKey) {
        const nextKey = neighborAfter(grouped, reviewingGroupId, pendingDelete);
        if (nextKey) setPickedKey(nextKey);
        else leaveReview();
      }
    } finally {
      setBusy(false);
    }
  }

  async function confirmMerge() {
    if (!mergeRows || !keeperValue || busy) return;
    const candidates = mergeCandidates(mergeRows, roles);
    const keeperDraft = keeperValue.startsWith("draft:")
      ? drafts.find((draft) => `draft:${draft.localId}` === keeperValue) ?? null
      : null;
    const keeperRoleId = keeperValue.startsWith("role:") ? keeperValue.slice("role:".length) : null;
    if (!keeperDraft && !keeperRoleId) return;
    const dropRoleIds = candidates
      .filter((candidate) => candidate.value.startsWith("role:") && candidate.value !== keeperValue)
      .map((candidate) => candidate.value.slice("role:".length));
    const dropDraftIds = candidates
      .filter((candidate) => candidate.value.startsWith("draft:") && candidate.value !== keeperValue)
      .map((candidate) => candidate.value.slice("draft:".length));
    setBusy(true);
    try {
      await onMerge({ keeperRoleId, keeperDraft, keeperPatch: null, dropRoleIds, dropDraftIds });
      setChecked(new Set());
      setMergeRows(null);
      setKeeperValue(null);
      setStayPicks({});
      if (pickedKey) {
        const nextKey = neighborAfter(grouped, reviewingGroupId, mergeRows);
        if (nextKey) setPickedKey(nextKey);
        else leaveReview();
      }
    } finally {
      setBusy(false);
    }
  }

  async function confirmStayMerge(rows: MatchRow[] | null = mergeRows) {
    if (!picked || !comparison || !rows || busy) return;
    const choices = identityChoices(comparison.kept, comparison.incoming);
    if (choices.some((choice) => !stayPicks[choice.key])) return;
    const keptRole = roles.find((role) => role.id === picked.matchesId);
    const held = keptRole ? heldFor(keptRole)[0] : null;
    if (!keptRole || !held) return;
    const takes = [
      ...lineTakes(comparison.kept, comparison.incoming),
      ...choices.filter((choice) => stayPicks[choice.key] === "incoming").flatMap((choice) => choice.takes),
    ];
    const next = applySameRole(held, comparison.incoming, 0, takes);
    const keeperPatch: ReviewFields = {
      kind: keptRole.kind,
      title: next.item.title,
      organization: next.item.org,
      locationLabel: next.item.place === ONBOARDING_NO_PLACE ? "" : next.item.place,
      startDate: next.item.startDate,
      endDate: next.item.isCurrent ? "" : next.item.endDate,
      isCurrent: next.item.isCurrent,
      description: next.item.description,
      achievements: [...next.item.achievements],
    };
    setBusy(true);
    try {
      await onMerge({
        keeperRoleId: keptRole.id,
        keeperDraft: null,
        keeperPatch,
        dropRoleIds: picked.draft || picked.copyId === keptRole.id ? [] : [picked.copyId],
        dropDraftIds: picked.draft ? [picked.draft.localId] : [],
      });
      setChecked((current) => {
        const nextChecked = new Set(current);
        nextChecked.delete(picked.key);
        return nextChecked;
      });
      setMergeRows(null);
      setStayPicks({});
      const nextKey = neighborAfter(grouped, reviewingGroupId, rows);
      if (nextKey) setPickedKey(nextKey);
      else leaveReview();
    } finally {
      setBusy(false);
    }
  }

  function cancelMerge() {
    setMergeRows(null);
    setKeeperValue(null);
    setStayPicks({});
  }

  const mergeChoices = mergeRows ? mergeCandidates(mergeRows, roles) : [];
  const stayChoices = picked && comparison ? identityChoices(comparison.kept, comparison.incoming) : [];
  const stayMerge = Boolean(
    picked && comparison && stayChoices.length > 0 && mergeRows?.length === 1 && mergeRows[0]?.key === picked.key,
  );

  return (
    <dialog
      ref={dialogRef}
      className="onboarding-review"
      data-compare={picked && comparison ? "true" : undefined}
      aria-labelledby="duplicate-review-title"
      onClose={onClose}
    >
      <div className="onboarding-review-head">
        <p className="onboarding-kicker">Career History</p>
        <button type="button" className="onboarding-btn onboarding-btn-ghost" aria-label="Close review duplicates" onClick={requestClose}>
          Close
        </button>
      </div>
      <h2 id="duplicate-review-title">
        {stayMerge ? "Which value stays?" : mergeRows ? "Choose the role to keep" : "Review duplicates"}
      </h2>
      {(picked && comparison) || mergeRows ? null : (
        <p className="history-review-total">
          {duplicateCount} potential {duplicateCount === 1 ? "duplicate" : "duplicates"}
        </p>
      )}
      {(picked && comparison) || mergeRows ? null : (
        <p className="history-review-lead">
          These groups may be the same role. Open a group or a match to compare it with the role already in Career History. Delete, merge, and snooze still apply to a whole group from this list.
        </p>
      )}
      {(picked && comparison) || mergeRows ? null : (
      <div className="history-review-toolbar">
        <label>
          Sort
          <select
            aria-label="Sort duplicates"
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value === "unsure" ? "unsure" : "sure")}
          >
            <option value="sure">Most sure first</option>
            <option value="unsure">Least sure first</option>
          </select>
        </label>
        <button
          type="button"
          aria-label="Select identical groups"
          aria-pressed={bulk?.scope === "groups" && bulk.action === "identical"}
          disabled={identicalKeys.length === 0 || busy}
          onClick={() => activateGroups("identical")}
        >
          Select identical
        </button>
        <button
          type="button"
          className="is-danger"
          aria-label="Delete groups"
          aria-pressed={bulk?.scope === "groups" && bulk.action === "delete"}
          disabled={busy}
          onClick={() => activateGroups("delete")}
        >
          {bulk?.scope === "groups" && bulk.action === "delete" && selectedRows.length > 0
            ? `Delete ${selectedRows.length}`
            : "Delete"}
        </button>
        <button
          type="button"
          aria-label="Merge groups"
          aria-pressed={bulk?.scope === "groups" && bulk.action === "merge"}
          disabled={busy}
          onClick={() => activateGroups("merge")}
        >
          {bulk?.scope === "groups" && bulk.action === "merge" && selectedRows.length > 0
            ? `Merge ${selectedRows.length}`
            : "Merge"}
        </button>
      </div>
      )}
      {(picked && comparison) || mergeRows ? null : bulkMessage ? (
        <p className="history-review-select-status" role="status">
          {bulkMessage}
        </p>
      ) : null}
      {picked && comparison && !stayMerge ? null : notice ? (
        <p className="role-save-message is-alert" role="alert">
          {notice}
        </p>
      ) : null}
      {picked && comparison && !stayMerge ? null : hint ? (
        <p className="role-save-message is-alert" role="status">
          {hint}
        </p>
      ) : null}
      {stayMerge && picked && comparison ? (
        <StayMerge
          kept={comparison.kept}
          incoming={comparison.incoming}
          picks={stayPicks}
          busy={busy}
          onPick={(key, side) => setStayPicks((current) => ({ ...current, [key]: side }))}
          onBack={cancelMerge}
          onConfirm={() => void confirmStayMerge()}
        />
      ) : picked && comparison ? (
        <div className="history-review-dialog is-review">
          <div className="history-review-review-bar">
            {reviewGroup && reviewIndex >= 0 ? (
              <p className="history-review-compare-line">
                {reviewGroup.members.length > 1
                  ? `Match ${reviewIndex + 1} of ${reviewGroup.members.length}, compared with ${roleName(roles.find((role) => role.id === reviewGroup.representativeId))}.`
                  : `Compared with ${roleName(roles.find((role) => role.id === reviewGroup.representativeId))}.`}
                {notice ? ` ${notice}` : ""}
                {hint ? ` ${hint}` : ""}
              </p>
            ) : null}
            <div className="role-form-actions history-review-action-row">
              <button type="button" disabled={busy} onClick={leaveReview}>
                All groups
              </button>
              {reviewGroup && reviewIndex >= 0 && reviewGroup.members.length > 1 ? (
                <>
                  <button type="button" disabled={reviewIndex <= 0 || busy} onClick={() => stepReview(-1)}>
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={reviewIndex >= reviewGroup.members.length - 1 || busy}
                    onClick={() => stepReview(1)}
                  >
                    Next
                  </button>
                </>
              ) : null}
              <button type="button" className="is-danger" disabled={busy} onClick={() => askDelete([picked])}>
                Delete
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (identityChoices(comparison.kept, comparison.incoming).length === 0) {
                    void confirmStayMerge([picked]);
                    return;
                  }
                  askMerge([picked]);
                }}
              >
                Merge
              </button>
              <button type="button" disabled={busy} onClick={() => classifyDifferent(picked)}>
                Different role
              </button>
              <button type="button" disabled={busy} onClick={() => snoozeKeys([picked.key])}>
                Snooze
              </button>
            </div>
            <ReviewDecisions
              busy={busy}
              draft={null}
              keeperValue={null}
              mergeChoices={[]}
              pendingDelete={pendingDelete}
              onCancelDelete={() => setPendingDelete(null)}
              onCancelMerge={cancelMerge}
              onChangeDraft={onChangeDraft}
              onCommitDraft={onCommitDraft}
              onConfirmDelete={() => void confirmDelete()}
              onConfirmMerge={() => void confirmMerge()}
              onDiscardDraft={onDiscardDraft}
              onKeeper={setKeeperValue}
            />
          </div>
          <p className="history-review-summary">
            <span className="history-review-confidence" data-level={picked.confidence}>
              {CONFIDENCE_LABEL[picked.confidence]}
            </span>{" "}
            {comparison.summary}
          </p>
          <div className="onboarding-compare-columns">
            <CompareColumn item={comparison.kept} fileLabel="Already in Career History" kicker="Listed" />
            <CompareColumn
              item={comparison.incoming}
              fileLabel={picked.draft ? "Not saved yet" : picked.identical ? "Also listed" : "Partial match"}
              kicker="This copy"
            />
          </div>
          {comparison.lines.length > 0 ? (
            <ul className="history-review-diffs">
              {comparison.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : (
            <p>Nothing differs.</p>
          )}
          <ReviewDecisions
            busy={busy}
            draft={picked.draft}
            keeperValue={null}
            mergeChoices={[]}
            pendingDelete={null}
            onCancelDelete={() => setPendingDelete(null)}
            onCancelMerge={cancelMerge}
            onChangeDraft={onChangeDraft}
            onCommitDraft={onCommitDraft}
            onConfirmDelete={() => void confirmDelete()}
            onConfirmMerge={() => void confirmMerge()}
            onDiscardDraft={onDiscardDraft}
            onKeeper={setKeeperValue}
          />
        </div>
      ) : mergeChoices.length > 0 ? (
        <div className="history-review-dialog is-review">
          <ReviewDecisions
            busy={busy}
            draft={null}
            keeperValue={keeperValue}
            mergeChoices={mergeChoices}
            pendingDelete={null}
            onCancelDelete={() => setPendingDelete(null)}
            onCancelMerge={cancelMerge}
            onChangeDraft={onChangeDraft}
            onCommitDraft={onCommitDraft}
            onConfirmDelete={() => void confirmDelete()}
            onConfirmMerge={() => void confirmMerge()}
            onDiscardDraft={onDiscardDraft}
            onKeeper={setKeeperValue}
          />
        </div>
      ) : (
        <div className="history-review-dialog is-list">
          <div className="history-review-list">
            {activeGroups.length === 0 && restingGroups.length === 0 ? (
              <p>No suspected duplicates.</p>
            ) : activeGroups.length === 0 ? (
              <p>Every current match is snoozed. Open a group below when you want to look again.</p>
            ) : (
              <MatchGroupList
                groups={activeGroups}
                roles={roles}
                checked={checked}
                busy={busy}
                mode="active"
                openedId={openedGroupId}
                bulk={bulk}
                onOpenGroup={openGroup}
                onPick={openReview}
                onToggle={toggleChecked}
                onToggleGroup={toggleGroup}
                onReview={startReview}
                onGroupAction={activateGroup}
                onWakeGroup={() => undefined}
              />
            )}
            {restingGroups.length > 0 ? (
              <section className="history-review-snoozed" aria-label="Snoozed matches">
                <h3>Snoozed</h3>
                <MatchGroupList
                  groups={restingGroups}
                  roles={roles}
                  checked={checked}
                  busy={busy}
                  mode="snoozed"
                  openedId={openedGroupId}
                  bulk={bulk}
                  onOpenGroup={openGroup}
                  onPick={openReview}
                  onToggle={toggleChecked}
                  onToggleGroup={toggleGroup}
                  onReview={startReview}
                  onGroupAction={activateGroup}
                  onWakeGroup={wakeKeys}
                />
              </section>
            ) : null}
          </div>
          <ReviewDecisions
            busy={busy}
            draft={null}
            keeperValue={keeperValue}
            mergeChoices={mergeChoices}
            pendingDelete={pendingDelete}
            onCancelDelete={() => setPendingDelete(null)}
            onCancelMerge={cancelMerge}
            onChangeDraft={onChangeDraft}
            onCommitDraft={onCommitDraft}
            onConfirmDelete={() => void confirmDelete()}
            onConfirmMerge={() => void confirmMerge()}
            onDiscardDraft={onDiscardDraft}
            onKeeper={setKeeperValue}
          />
        </div>
      )}
    </dialog>
  );
}

function StayMerge({
  kept,
  incoming,
  picks,
  busy,
  onPick,
  onBack,
  onConfirm,
}: {
  kept: OnboardingCheckItem;
  incoming: OnboardingCheckItem;
  picks: Record<string, "kept" | "incoming">;
  busy: boolean;
  onPick: (key: string, side: "kept" | "incoming") => void;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const choices = identityChoices(kept, incoming);
  const waiting = choices.some((choice) => !picks[choice.key]);
  return (
    <div className="history-review-dialog is-review">
      <div className="onboarding-review-body">
        <p className="onboarding-meta">These differ. Choose one for each. Both sets of lines stay on the role.</p>
        {choices.map((choice) => (
          <fieldset key={choice.key} className="onboarding-stay">
            <legend>{choice.label}</legend>
            <button
              type="button"
              aria-pressed={picks[choice.key] === "kept"}
              aria-label={`Keep the listed ${choice.label}: ${choice.kept}`}
              onClick={() => onPick(choice.key, "kept")}
            >
              {choice.kept}
            </button>
            <button
              type="button"
              aria-pressed={picks[choice.key] === "incoming"}
              aria-label={`Keep this copy's ${choice.label}: ${choice.incoming}`}
              onClick={() => onPick(choice.key, "incoming")}
            >
              {choice.incoming}
            </button>
          </fieldset>
        ))}
      </div>
      <div className="onboarding-actions" data-split="true">
        <button type="button" className="onboarding-btn onboarding-btn-ghost" disabled={busy} onClick={onBack}>
          Back
        </button>
        <button type="button" className="onboarding-btn onboarding-btn-solid" disabled={busy || waiting} onClick={onConfirm}>
          {busy ? "Merging…" : "Confirm merge"}
        </button>
      </div>
    </div>
  );
}

function ReviewDecisions({
  busy,
  draft,
  keeperValue,
  mergeChoices,
  pendingDelete,
  onCancelDelete,
  onCancelMerge,
  onChangeDraft,
  onCommitDraft,
  onConfirmDelete,
  onConfirmMerge,
  onDiscardDraft,
  onKeeper,
}: {
  busy: boolean;
  draft: ReviewDraft | null;
  keeperValue: string | null;
  mergeChoices: MergeChoice[];
  pendingDelete: MatchRow[] | null;
  onCancelDelete: () => void;
  onCancelMerge: () => void;
  onChangeDraft: (localId: string, patch: Partial<ReviewFields>) => void;
  onCommitDraft: (draft: ReviewDraft) => void;
  onConfirmDelete: () => void;
  onConfirmMerge: () => void;
  onDiscardDraft: (localId: string) => void;
  onKeeper: (value: string) => void;
}) {
  return (
    <>
      {pendingDelete ? (
        <div className="history-review-confirm" role="group" aria-label="Confirm delete">
          <p>
            {pendingDelete.every((row) => row.identical)
              ? `Delete ${pendingDelete.length} identical ${pendingDelete.length === 1 ? "copy" : "copies"}? The roles they match stay listed.`
              : `Delete ${pendingDelete.length} selected ${pendingDelete.length === 1 ? "match" : "matches"}? The representative role for each group stays listed.`}
          </p>
          <div className="role-form-actions">
            <button type="button" className="is-danger" disabled={busy} onClick={onConfirmDelete}>
              {busy ? "Deleting…" : "Delete"}
            </button>
            <button type="button" disabled={busy} onClick={onCancelDelete}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      {mergeChoices.length > 0 ? (
        <fieldset className="history-review-keeper" disabled={busy}>
          <legend>Choose the role to keep</legend>
          <p>The other copies are removed. Nothing is chosen until you pick.</p>
          {mergeChoices.map((choice) => (
            <label key={choice.value}>
              <input
                type="radio"
                name="duplicate-keeper"
                value={choice.value}
                checked={keeperValue === choice.value}
                onChange={() => onKeeper(choice.value)}
              />
              <span>
                <strong>{choice.name}</strong>
                <span>{choice.note}</span>
              </span>
            </label>
          ))}
          <div className="role-form-actions">
            <button type="button" disabled={!keeperValue || busy} onClick={onConfirmMerge}>
              {busy ? "Merging…" : "Merge into the role you chose"}
            </button>
            <button type="button" disabled={busy} onClick={onCancelMerge}>
              Cancel
            </button>
          </div>
        </fieldset>
      ) : null}
      {draft ? (
        <form
          className="role-form"
          onSubmit={(event) => {
            event.preventDefault();
            onCommitDraft(draft);
          }}
        >
          <h3>Edit this copy</h3>
          <DraftFields draft={draft} onChangeDraft={onChangeDraft} />
          <div className="role-form-actions">
            <button type="submit">Save to history</button>
            <button type="button" onClick={() => onDiscardDraft(draft.localId)}>
              Discard
            </button>
          </div>
        </form>
      ) : null}
    </>
  );
}

function MatchGroupList({
  groups,
  roles,
  checked,
  busy,
  mode,
  openedId,
  bulk,
  onOpenGroup,
  onPick,
  onToggle,
  onToggleGroup,
  onReview,
  onGroupAction,
  onWakeGroup,
}: {
  groups: MatchGroup[];
  roles: WorkMapRole[];
  checked: Set<string>;
  busy: boolean;
  mode: "active" | "snoozed";
  openedId: string | null;
  bulk: BulkMode | null;
  onOpenGroup: (id: string) => void;
  onPick: (key: string) => void;
  onToggle: (key: string) => void;
  onToggleGroup: (keys: string[]) => void;
  onReview: (group: MatchGroup) => void;
  onGroupAction: (group: MatchGroup, action: "snooze" | "delete" | "merge") => void;
  onWakeGroup: (keys: string[]) => void;
}) {
  return (
    <ul className="history-review-pairs">
      {groups.map((group) => {
        const representative = roles.find((role) => role.id === group.representativeId);
        const keys = group.members.map((member) => member.key);
        const allOn = keys.length > 0 && keys.every((key) => checked.has(key));
        const someOn = keys.some((key) => checked.has(key));
        const confidence = headlineConfidence(group);
        const name = roleName(representative);
        const line = groupRoleLine(group, roles);
        const opened = openedId === group.id;
        const showGroupCheck = mode === "active" && bulk?.scope === "groups";
        const showMemberCheck = mode === "active" && bulk?.scope === "matches" && bulk.groupId === group.id;
        const chosen = group.members.filter((row) => checked.has(row.key)).length;
        return (
          <li
            key={group.id}
            className="history-review-group"
            data-open={opened ? "true" : undefined}
            data-checks={showGroupCheck ? "groups" : showMemberCheck ? "matches" : undefined}
          >
            <div className="history-review-pick">
              {showGroupCheck ? (
                <GroupCheck
                  checked={allOn}
                  indeterminate={!allOn && someOn}
                  label={`Select ${name}`}
                  onChange={() => onToggleGroup(keys)}
                />
              ) : null}
              <button
                type="button"
                className="history-review-card-pick"
                aria-expanded={opened}
                aria-label={`${name}. ${line}`}
                onClick={() => onOpenGroup(group.id)}
              >
                <span className="history-review-name">
                  <strong>{name}</strong>
                  <span className="history-review-confidence" data-level={confidence}>
                    {CONFIDENCE_LABEL[confidence]}
                  </span>
                </span>
                <span className="history-review-role">{line}</span>
              </button>
            </div>
            {opened ? (
              <div className="history-review-group-actions">
                {mode === "active" ? (
                  <>
                    <button type="button" aria-label={`Review ${name}`} disabled={busy} onClick={() => onReview(group)}>
                      Review
                    </button>
                    <button
                      type="button"
                      aria-label={`Snooze ${name}`}
                      aria-pressed={showMemberCheck && bulk?.action === "snooze"}
                      disabled={busy}
                      onClick={() => onGroupAction(group, "snooze")}
                    >
                      {showMemberCheck && bulk?.action === "snooze" && chosen > 0 ? `Snooze ${chosen}` : "Snooze"}
                    </button>
                    <button
                      type="button"
                      aria-label={`Merge ${name}`}
                      aria-pressed={showMemberCheck && bulk?.action === "merge"}
                      disabled={busy}
                      onClick={() => onGroupAction(group, "merge")}
                    >
                      {showMemberCheck && bulk?.action === "merge" && chosen > 0 ? `Merge ${chosen}` : "Merge"}
                    </button>
                    <button
                      type="button"
                      className="is-danger"
                      aria-label={`Delete ${name}`}
                      aria-pressed={showMemberCheck && bulk?.action === "delete"}
                      disabled={busy}
                      onClick={() => onGroupAction(group, "delete")}
                    >
                      {showMemberCheck && bulk?.action === "delete" && chosen > 0 ? `Delete ${chosen}` : "Delete"}
                    </button>
                  </>
                ) : (
                  <button type="button" aria-label={`Review ${name} again`} disabled={busy} onClick={() => onWakeGroup(keys)}>
                    Review again
                  </button>
                )}
              </div>
            ) : null}
            <ul className="history-review-pairs history-review-members">
              {group.members.map((row) => (
                <MatchListItem
                  key={row.key}
                  row={row}
                  roles={roles}
                  representativeName={name}
                  checked={checked.has(row.key)}
                  showCheck={showMemberCheck}
                  snoozed={mode === "snoozed"}
                  onPick={() => onPick(row.key)}
                  onToggle={() => onToggle(row.key)}
                />
              ))}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}

function GroupCheck({
  checked,
  indeterminate,
  label,
  onChange,
}: {
  checked: boolean;
  indeterminate: boolean;
  label: string;
  onChange: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <label>
      <input ref={ref} type="checkbox" checked={checked} aria-label={label} onChange={onChange} />
    </label>
  );
}

function MatchListItem({
  row,
  roles,
  representativeName,
  checked,
  showCheck,
  snoozed,
  onPick,
  onToggle,
}: {
  row: MatchRow;
  roles: WorkMapRole[];
  representativeName: string;
  checked: boolean;
  showCheck: boolean;
  snoozed: boolean;
  onPick: () => void;
  onToggle: () => void;
}) {
  const title = rowTitle(row, roles);
  const match = roles.find((role) => role.id === row.matchesId);
  return (
    <li className="history-review-member">
      {showCheck ? (
        <input type="checkbox" checked={checked} aria-label={`Select ${title}`} onChange={onToggle} />
      ) : null}
      <button type="button" className="history-review-member-pick" aria-label={`Review ${title}`} onClick={onPick}>
        <strong>{title}</strong>
        <span>
          {snoozed ? "Set aside. " : row.draft ? "Not saved. " : row.identical ? "Already listed. " : "Partial. "}
          Matches {roleName(match) || representativeName}.
        </span>
      </button>
    </li>
  );
}

function groupRoleLine(group: MatchGroup, roles: WorkMapRole[]): string {
  const role = roles.find((item) => item.id === group.representativeId);
  const count = `${group.members.length} ${group.members.length === 1 ? "match" : "matches"}`;
  const draft = group.members.find((member) => member.draft)?.draft;
  const title = role?.title || draft?.title || role?.organization || "Untitled role";
  const start = monthValue(role?.startDate ?? draft?.startDate ?? "");
  const end = role?.isCurrent || draft?.isCurrent ? "Present" : monthValue(role?.endDate ?? draft?.endDate ?? "");
  const dates = start || end ? `${start || "Start"} – ${end || "End"}` : "";
  return [title, count, dates].filter(Boolean).join(" · ");
}

function DraftFields({
  draft,
  onChangeDraft,
}: {
  draft: ReviewDraft;
  onChangeDraft: (localId: string, patch: Partial<ReviewFields>) => void;
}) {
  return (
    <>
      <label>
        Title
        <input
          value={draft.title}
          onChange={(event) => onChangeDraft(draft.localId, { title: event.target.value })}
        />
      </label>
      <label>
        Organization
        <input
          value={draft.organization}
          onChange={(event) => onChangeDraft(draft.localId, { organization: event.target.value })}
        />
      </label>
      <label>
        Place
        <input
          value={draft.locationLabel}
          onChange={(event) => onChangeDraft(draft.localId, { locationLabel: event.target.value })}
        />
      </label>
      <div className="role-form-pair">
        <label>
          Start
          <input
            type="month"
            value={monthValue(draft.startDate)}
            onChange={(event) => onChangeDraft(draft.localId, { startDate: event.target.value })}
          />
        </label>
        <label>
          End
          <input
            type="month"
            value={monthValue(draft.endDate)}
            onChange={(event) => onChangeDraft(draft.localId, { endDate: event.target.value })}
          />
        </label>
      </div>
      <label className="role-check">
        <input
          type="checkbox"
          checked={draft.isCurrent}
          onChange={(event) => onChangeDraft(draft.localId, { isCurrent: event.target.checked })}
        />
        Current role
      </label>
      <label>
        What the role involved
        <textarea
          rows={4}
          value={draft.description}
          onChange={(event) => onChangeDraft(draft.localId, { description: event.target.value })}
        />
      </label>
      <label>
        Achievements, one per line
        <textarea
          rows={4}
          value={draft.achievements.join("\n")}
          onChange={(event) =>
            onChangeDraft(draft.localId, {
              achievements: event.target.value
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean),
            })
          }
        />
      </label>
    </>
  );
}

function omitDistinct(groups: MatchGroup[], distinct: Set<string>): MatchGroup[] {
  return groups
    .map((group) => ({
      ...group,
      members: group.members.filter((member) => !distinct.has(member.key)),
    }))
    .filter((group) => group.members.length > 0);
}

function neighborAfter(groups: MatchGroup[], reviewingGroupId: string | null, removed: MatchRow[]): string | null {
  const group =
    groups.find((item) => item.id === reviewingGroupId) ??
    groups.find((item) => item.members.some((member) => removed.some((row) => row.key === member.key)));
  if (!group) return null;
  const gone = new Set(removed.map((row) => row.key));
  const index = group.members.findIndex((member) => gone.has(member.key));
  const stay = group.members.filter((member) => !gone.has(member.key));
  if (stay.length === 0 || index < 0) return null;
  return stay[Math.min(index, stay.length - 1)]?.key ?? null;
}

function splitGroups(groups: MatchGroup[], snoozed: Set<string>, resting: boolean): MatchGroup[] {
  return groups
    .map((group) => ({
      ...group,
      members: group.members.filter((member) => snoozed.has(member.key) === resting),
    }))
    .filter((group) => group.members.length > 0);
}

function sortMatchGroups(groups: MatchGroup[], sortBy: "sure" | "unsure"): MatchGroup[] {
  const headline = (group: MatchGroup) =>
    Math.max(...group.members.map((member) => CONFIDENCE_RANK[member.confidence]));
  return [...groups]
    .map((group) => ({
      ...group,
      members: [...group.members].sort((left, right) => compareConfidence(left, right, sortBy)),
    }))
    .sort((left, right) => {
      const delta = headline(right) - headline(left);
      const ordered = sortBy === "sure" ? delta : -delta;
      if (ordered !== 0) return ordered;
      return left.representativeId.localeCompare(right.representativeId);
    });
}

function headlineConfidence(group: MatchGroup): MatchConfidence {
  return group.members.reduce<MatchConfidence>(
    (best, row) => (CONFIDENCE_RANK[row.confidence] > CONFIDENCE_RANK[best] ? row.confidence : best),
    group.members[0].confidence,
  );
}

function buildMatchGroups(rows: MatchRow[], roles: WorkMapRole[]): MatchGroup[] {
  if (rows.length === 0) return [];
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    const current = parent.get(id) ?? id;
    if (current === id) {
      parent.set(id, id);
      return id;
    }
    const root = find(current);
    parent.set(id, root);
    return root;
  };
  const union = (left: string, right: string) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent.set(leftRoot, rightRoot);
  };
  for (const row of rows) union(row.copyId, row.matchesId);
  const byRoot = new Map<string, MatchRow[]>();
  for (const row of rows) {
    const root = find(row.copyId);
    const list = byRoot.get(root) ?? [];
    list.push(row);
    byRoot.set(root, list);
  }
  const order = new Map(roles.map((role, index) => [role.id, index]));
  const roleIds = new Set(roles.map((role) => role.id));
  const groups: MatchGroup[] = [];
  for (const edges of byRoot.values()) {
    const ids = new Set<string>();
    for (const edge of edges) {
      ids.add(edge.copyId);
      ids.add(edge.matchesId);
    }
    const representativeId = chooseRepresentative([...ids], edges, roleIds, order);
    const members: MatchRow[] = [];
    const seen = new Set<string>();
    for (const id of ids) {
      if (id === representativeId) continue;
      const member = orientMember(id, representativeId, edges, roles);
      if (!member || seen.has(member.key)) continue;
      seen.add(member.key);
      members.push(member);
    }
    if (members.length === 0) continue;
    groups.push({ id: representativeId, representativeId, members });
  }
  return groups;
}

function chooseRepresentative(
  ids: string[],
  edges: MatchRow[],
  roleIds: Set<string>,
  order: Map<string, number>,
): string {
  const keepers = new Set(edges.filter((edge) => edge.identical).map((edge) => edge.matchesId));
  const listed = ids.filter((id) => roleIds.has(id));
  const keeperChoices = listed.filter((id) => keepers.has(id));
  const choices = keeperChoices.length > 0 ? keeperChoices : listed.length > 0 ? listed : ids;
  return [...choices].sort((left, right) => {
    const keeperDelta = Number(keepers.has(right)) - Number(keepers.has(left));
    if (keeperDelta !== 0) return keeperDelta;
    const seenDelta =
      edges.filter((edge) => edge.matchesId === right).length -
      edges.filter((edge) => edge.matchesId === left).length;
    if (seenDelta !== 0) return seenDelta;
    return (order.get(left) ?? Number.MAX_SAFE_INTEGER) - (order.get(right) ?? Number.MAX_SAFE_INTEGER);
  })[0];
}

function orientMember(
  memberId: string,
  representativeId: string,
  edges: MatchRow[],
  roles: WorkMapRole[],
): MatchRow | null {
  const representative = roles.find((role) => role.id === representativeId);
  if (!representative) return null;
  const draft =
    edges.find((edge) => edge.draft && (edge.copyId === memberId || edge.draft.localId === memberId))?.draft ??
    null;
  const member = roles.find((role) => role.id === memberId) ?? null;
  if (!draft && !member) return null;
  const incoming = draft ? draftCheckItem(draft) : roleCheckItem(member!);
  const hint = hintHeldRoles(heldFor(representative), incoming)[0];
  const identical = draft
    ? draftMatches(draft, representative, roles)
    : careerHistoryIdentityKey(identityOf(member!)) === careerHistoryIdentityKey(identityOf(representative));
  return {
    key: pairKey(memberId, representativeId),
    copyId: memberId,
    matchesId: representativeId,
    draft,
    identical,
    confidence: confidenceFor(identical, hint?.reason),
    summary: summaryFor(identical, hint?.reason, roleCheckItem(representative)),
  };
}

function buildRows(
  roles: WorkMapRole[],
  drafts: ReviewDraft[],
  listedPairs: Array<{ id: string; matchesId: string }>,
): MatchRow[] {
  const rows: MatchRow[] = [];
  const seen = new Set<string>();
  const held = heldFromCareer({
    jobs: roles.filter((role) => role.kind !== "school").map(careerJob),
    schools: roles.filter((role) => role.kind === "school").map(careerSchool),
  });

  function add(row: Omit<MatchRow, "key">) {
    const key = pairKey(row.copyId, row.matchesId);
    if (seen.has(key) || row.copyId === row.matchesId) return;
    seen.add(key);
    rows.push({ ...row, key });
  }

  for (const draft of drafts) {
    const match = roles.find((role) => role.id === draft.matchesId);
    if (!match) continue;
    const incoming = draftCheckItem(draft);
    const hint = hintHeldRoles(heldFor(match), incoming)[0];
    const identical = draftMatches(draft, match, roles);
    add({
      copyId: draft.localId,
      matchesId: draft.matchesId,
      draft,
      identical,
      confidence: confidenceFor(identical, hint?.reason),
      summary: summaryFor(identical, hint?.reason, roleCheckItem(match)),
    });
  }

  for (const pair of listedPairs) {
    const copy = roles.find((role) => role.id === pair.id);
    const match = roles.find((role) => role.id === pair.matchesId);
    if (!copy || !match) continue;
    const hint = hintHeldRoles(heldFor(match), roleCheckItem(copy))[0];
    add({
      copyId: pair.id,
      matchesId: pair.matchesId,
      draft: null,
      identical: true,
      confidence: "identical",
      summary: summaryFor(true, hint?.reason, roleCheckItem(match)),
    });
  }

  for (const role of roles) {
    const incoming = roleCheckItem(role);
    const hints = hintHeldRoles(
      held.filter((item) => item.id !== role.id),
      incoming,
    );
    for (const hint of hints) {
      const match = roles.find((item) => item.id === hint.roleId);
      if (!match) continue;
      add({
        copyId: role.id,
        matchesId: hint.roleId,
        draft: null,
        identical: false,
        confidence: confidenceFor(false, hint.reason),
        summary: summaryFor(false, hint.reason, roleCheckItem(match)),
      });
    }
  }

  return rows;
}

function confidenceFor(identical: boolean, reason: ResumeMatchReason | undefined): MatchConfidence {
  if (identical) return "identical";
  if (reason === "employer-and-dates") return "likely";
  if (reason === "promotion") return "possible";
  return "partial";
}

function summaryFor(
  identical: boolean,
  reason: ResumeMatchReason | undefined,
  kept: OnboardingCheckItem,
): string {
  if (reason) return resumeMatchCopy(reason, kept);
  if (identical) return "These match a role already in Career History.";
  return "This copy shares some of a role already in Career History.";
}

function compareConfidence(left: MatchRow, right: MatchRow, sortBy: "sure" | "unsure"): number {
  const delta = CONFIDENCE_RANK[right.confidence] - CONFIDENCE_RANK[left.confidence];
  const ordered = sortBy === "sure" ? delta : -delta;
  if (ordered !== 0) return ordered;
  return left.summary.localeCompare(right.summary);
}

function comparisonFor(row: MatchRow, roles: WorkMapRole[]) {
  const keptRole = roles.find((role) => role.id === row.matchesId) ?? null;
  const incomingRole = row.draft ? null : roles.find((role) => role.id === row.copyId) ?? null;
  const kept = keptRole ? roleCheckItem(keptRole) : null;
  const incoming = row.draft ? draftCheckItem(row.draft) : incomingRole ? roleCheckItem(incomingRole) : null;
  if (!keptRole || !kept || !incoming) return null;
  const diffs = roleFieldDiffs(kept, incoming);
  return {
    kept,
    incoming,
    summary: row.summary,
    lines: diffs.map(diffLine).filter((line): line is string => Boolean(line)),
  };
}

type MergeChoice = { value: string; name: string; note: string };

function mergeCandidates(rows: MatchRow[], roles: WorkMapRole[]): MergeChoice[] {
  const choices: MergeChoice[] = [];
  const seen = new Set<string>();
  const matchesId = rows[0]?.matchesId;
  const match = roles.find((role) => role.id === matchesId);
  if (match) {
    const value = `role:${match.id}`;
    seen.add(value);
    choices.push({ value, name: roleLine(match), note: "Already in Career History" });
  }
  for (const row of rows) {
    if (row.draft) {
      const value = `draft:${row.draft.localId}`;
      if (seen.has(value)) continue;
      seen.add(value);
      choices.push({ value, name: roleLine(row.draft), note: "Not saved yet" });
      continue;
    }
    const role = roles.find((item) => item.id === row.copyId);
    if (!role) continue;
    const value = `role:${role.id}`;
    if (seen.has(value)) continue;
    seen.add(value);
    choices.push({ value, name: roleLine(role), note: "Listed copy" });
  }
  return choices;
}

function draftMatches(draft: ReviewDraft, match: WorkMapRole, roles: WorkMapRole[]): boolean {
  const source = draft.sourceRoleId ? roles.find((role) => role.id === draft.sourceRoleId) : null;
  const draftIdentity: CareerHistoryIdentity = {
    id: draft.localId,
    kind: draft.kind,
    title: draft.title,
    organization: draft.organization,
    locationLabel: draft.locationLabel,
    startDate: draft.startDate,
    endDate: draft.endDate,
    isCurrent: draft.isCurrent,
    description: draft.description,
    achievements: draft.achievements,
    locations: (source?.locations ?? []).map((location) => ({
      address: location.address,
      latitude: location.latitude,
      longitude: location.longitude,
    })),
  };
  return careerHistoryIdentityKey(draftIdentity) === careerHistoryIdentityKey(identityOf(match));
}

function identityOf(role: WorkMapRole): CareerHistoryIdentity {
  return {
    id: role.id,
    kind: role.kind,
    title: role.title,
    organization: role.organization,
    locationLabel: role.locationLabel,
    startDate: role.startDate,
    endDate: role.endDate,
    isCurrent: role.isCurrent,
    description: role.description,
    achievements: role.achievements,
    locations: role.locations.map((location) => ({
      address: location.address,
      latitude: location.latitude,
      longitude: location.longitude,
    })),
  };
}

function heldFor(role: WorkMapRole) {
  return heldFromCareer({
    jobs: role.kind === "school" ? [] : [careerJob(role)],
    schools: role.kind === "school" ? [careerSchool(role)] : [],
  });
}

function pairKey(left: string, right: string): string {
  return [left, right].sort().join("|");
}

function readSnoozes(): string[] {
  return readStored(SNOOZE_STORAGE);
}

function readDistinct(): string[] {
  return readStored(DISTINCT_STORAGE);
}

function readStored(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function diffLine(diff: ResumeFieldDiff): string | null {
  if (diff.field === "achievement") return `Line only on this copy: ${diff.incoming}`;
  if (diff.field === "isCurrent") {
    return `Current role: ${diff.kept ? "Yes" : "No"} on the listed role, ${diff.incoming ? "Yes" : "No"} on this copy`;
  }
  const label =
    diff.field === "org"
      ? "Organization"
      : diff.field === "title"
        ? "Title"
        : diff.field === "field"
          ? "Field"
          : diff.field === "place"
            ? "Place"
            : diff.field === "startDate"
              ? "Start"
              : diff.field === "endDate"
                ? "End"
                : "Description";
  return `${label}: ${diff.kept || "Blank"} on the listed role, ${diff.incoming || "Blank"} on this copy`;
}

function roleCheckItem(role: WorkMapRole): OnboardingCheckItem {
  return heldFor(role)[0].item;
}

function draftCheckItem(draft: ReviewDraft): OnboardingCheckItem {
  return roleCheckItem({
    ...draftRole(draft),
    locations: [],
    media: [],
    linkedEvidence: [],
    claims: [],
    evidenceIds: [],
    factId: null,
    factVersion: null,
    details: EMPTY_WORK_MAP_DETAILS,
  });
}

function draftRole(draft: ReviewDraft): Pick<
  WorkMapRole,
  | "id"
  | "kind"
  | "title"
  | "organization"
  | "locationLabel"
  | "startDate"
  | "endDate"
  | "isCurrent"
  | "description"
  | "achievements"
> {
  return {
    id: draft.localId,
    kind: draft.kind,
    title: draft.title,
    organization: draft.organization,
    locationLabel: draft.locationLabel,
    startDate: draft.startDate,
    endDate: draft.endDate,
    isCurrent: draft.isCurrent,
    description: draft.description,
    achievements: draft.achievements,
  };
}

function careerJob(role: WorkMapRole) {
  return {
    id: role.id,
    title: role.title,
    company: role.organization,
    location: role.locationLabel,
    startDate: role.startDate,
    endDate: role.endDate,
    isCurrent: role.isCurrent,
    description: role.description,
    achievements: role.achievements,
  };
}

function careerSchool(role: WorkMapRole) {
  return {
    id: role.id,
    institution: role.organization,
    degree: role.title,
    field: "",
    location: role.locationLabel,
    startDate: role.startDate,
    endDate: role.endDate,
    description: role.description,
  };
}

function roleName(role: WorkMapRole | undefined): string {
  if (!role) return "a listed role";
  return role.organization || role.title || "Untitled role";
}

function rowTitle(row: MatchRow, roles: WorkMapRole[]): string {
  if (row.draft) return row.draft.organization || row.draft.title || "Untitled role";
  return roleName(roles.find((role) => role.id === row.copyId));
}

function roleLine(role: Pick<WorkMapRole, "organization" | "title" | "startDate" | "endDate" | "isCurrent">): string {
  const name = role.organization || role.title || "Untitled role";
  const title = role.title && role.organization ? role.title : "";
  const start = monthValue(role.startDate);
  const end = role.isCurrent ? "Present" : monthValue(role.endDate);
  const when = start || end ? `${start || "Start"} – ${end || "End"}` : "";
  return [name, title, when].filter(Boolean).join(", ");
}

function monthValue(value: string): string {
  return /^(\d{4})-(\d{2})/.test(value) ? value.slice(0, 7) : "";
}
