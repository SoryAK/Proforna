import { useEffect, useRef, useState } from "react";
import { formatCareerSpan } from "@core/career-file";
import {
  addHeldRole,
  applySameRole,
  hintHeldRoles,
  hintSetAside,
  roleFieldDiffs,
  type HeldRole,
  type ResumeFieldDiff,
  type ResumeFieldTake,
  type ResumeMatchReason,
  type SetAsideRole,
} from "@core/resume-compare";
import { isBlankOnboardingCheckItem, ONBOARDING_NO_PLACE, type OnboardingCheckItem } from "@core/onboarding-review";
import { CheckReview, VerifyBoard, WorkList, cardMeta, cardTitle, workLines, yearLabel, type VerifyCard } from "./OnboardingCheck";

export function ResumeCompare({
  items,
  file,
  fileName,
  fileIndex,
  held,
  asides,
  busy,
  error,
  onBack,
  onSetAside,
  onForgetAside,
  onDone,
}: {
  items: OnboardingCheckItem[];
  file: File | null;
  fileName: string;
  fileIndex: number;
  held: HeldRole[];
  asides: SetAsideRole[];
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onSetAside: (item: OnboardingCheckItem) => void;
  onForgetAside: (id: string) => void;
  onDone: (held: HeldRole[], acceptSkills: boolean) => void;
}) {
  const incoming = items.filter((item) => !isBlankOnboardingCheckItem(item));
  const [draftItems, setDraftItems] = useState(incoming);
  const [draftHeld, setDraftHeld] = useState(held);
  const [settled, setSettled] = useState<number[]>([]);
  const [acceptSkills, setAcceptSkills] = useState(false);
  const [compareIndex, setCompareIndex] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [picks, setPicks] = useState<Record<string, "kept" | "incoming">>({});
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [seen, setSeen] = useState<number[]>([]);
  const open = draftItems
    .map((item, index) => ({ item, index }))
    .filter((row) => !settled.includes(row.index));
  const pair =
    compareIndex == null
      ? null
      : (() => {
          const item = draftItems[compareIndex];
          const hint = item ? hintHeldRoles(draftHeld, item)[0] : null;
          const role = hint ? draftHeld.find((row) => row.id === hint.roleId) : null;
          if (!item || !hint || !role) return null;
          return { index: compareIndex, item, kept: role, reason: hint.reason };
        })();
  const choices = pair ? identityChoices(pair.kept.item, pair.item) : [];
  function settle(index: number, nextHeld: HeldRole[], skills: boolean) {
    setDraftHeld(nextHeld);
    if (skills) setAcceptSkills(true);
    setSettled((current) => (current.includes(index) ? current : [...current, index]));
    setCompareIndex(null);
    setConfirming(false);
    setPicks({});
    setEditIndex(null);
  }

  function keepDifferent(index: number, item: OnboardingCheckItem) {
    const aside = hintSetAside(asides, item);
    if (aside) onForgetAside(aside.id);
    settle(index, addHeldRole(draftHeld, item, fileIndex), item.source === "job");
  }

  function aside(index: number, item: OnboardingCheckItem) {
    onSetAside(item);
    settle(index, draftHeld, false);
  }

  function merge() {
    if (!pair) return;
    if (!confirming && choices.length > 0) {
      setConfirming(true);
      return;
    }
    if (choices.some((choice) => !picks[choice.key])) return;
    const takes = [
      ...lineTakes(pair.kept.item, pair.item),
      ...choices.filter((choice) => picks[choice.key] === "incoming").flatMap((choice) => choice.takes),
    ];
    const nextRole = applySameRole(pair.kept, pair.item, fileIndex, takes);
    const nextHeld = draftHeld.map((role) => (role.id === pair.kept.id ? nextRole : role));
    const asideHit = hintSetAside(asides, pair.item);
    if (asideHit) onForgetAside(asideHit.id);
    settle(pair.index, nextHeld, pair.item.source === "job");
  }

  function finish(nextHeld: HeldRole[], skills: boolean) {
    let heldNow = nextHeld;
    let tookSkills = skills;
    for (const row of open) {
      if (hintSetAside(asides, row.item)) continue;
      heldNow = addHeldRole(heldNow, row.item, fileIndex);
      if (row.item.source === "job") tookSkills = true;
    }
    onDone(heldNow, tookSkills);
  }

  if (incoming.length === 0) {
    return (
      <>
        <p className="onboarding-kicker">Resume</p>
        <h1>
          Nothing new in <em>{fileName}</em>
        </h1>
        <div className="onboarding-actions" data-split="true">
          <button type="button" className="onboarding-btn onboarding-btn-ghost" onClick={onBack}>
            Back
          </button>
          <button type="button" className="onboarding-btn onboarding-btn-solid" disabled={busy} onClick={() => onDone(draftHeld, acceptSkills)}>
            {busy ? "Saving…" : "Continue"}
          </button>
        </div>
      </>
    );
  }

  const heldCards = (section: "job" | "school"): VerifyCard[] =>
    draftHeld
      .filter((role) => role.item.source === section)
      .map((role) => ({
        key: role.id,
        title: cardTitle(role.item),
        meta: cardMeta(role.item),
        year: yearLabel(role.item),
        start: role.item.startDate,
        opened: false,
        stateLabel: "Kept",
      }));

  const incomingCards = (section: "job" | "school"): VerifyCard[] =>
    open
      .filter((row) => row.item.source === section)
      .map((row) => {
        const hint = hintHeldRoles(draftHeld, row.item)[0];
        const role = hint ? draftHeld.find((kept) => kept.id === hint.roleId) : null;
        const asideHit = hintSetAside(asides, row.item);
        return {
          key: `file-${row.index}`,
          title: cardTitle(row.item),
          meta: cardMeta(row.item, fileName),
          year: yearLabel(row.item),
          start: row.item.startDate,
          opened: seen.includes(row.index),
          hint: role ? hintCopy(hint?.reason ?? "employer", role.item) : asideHit ? "You set this aside before." : undefined,
          keepLabel: asideHit && !role ? "Add this role" : undefined,
          onOpen: () => {
            setSeen((current) => (current.includes(row.index) ? current : [...current, row.index]));
            setEditIndex(row.index);
          },
          onCompare: role
            ? () => {
                setSeen((current) => (current.includes(row.index) ? current : [...current, row.index]));
                setEditIndex(null);
                setCompareIndex(row.index);
                setConfirming(false);
                setPicks({});
              }
            : undefined,
          onKeep: asideHit && !role ? () => keepDifferent(row.index, row.item) : undefined,
        };
      });

  return (
    <>
      <p className="onboarding-kicker">Resume</p>
      <h1>
        Here's what was <em>extracted.</em>
      </h1>
      <p className="onboarding-meta">{fileName}</p>
      <p className="onboarding-meta">Compare a role when it might be one you already have. A role this file never mentions stays.</p>
      <VerifyBoard
        jobs={[...heldCards("job"), ...incomingCards("job")]}
        schools={[...heldCards("school"), ...incomingCards("school")]}
      />
      {error ? (
        <p className="onboarding-alert" role="alert">
          {error}
        </p>
      ) : null}
      <div className="onboarding-actions" data-split="true">
        <button type="button" className="onboarding-btn onboarding-btn-ghost" disabled={busy} onClick={onBack}>
          Back
        </button>
        <button type="button" className="onboarding-btn onboarding-btn-solid" disabled={busy} onClick={() => finish(draftHeld, acceptSkills)}>
          {busy ? "Saving…" : "Continue"}
        </button>
      </div>
      {editIndex != null && draftItems[editIndex] ? (
        <CheckReview
          open
          items={[draftItems[editIndex]]}
          file={file}
          index={0}
          onIndex={() => undefined}
          onChange={(_index, item) => setDraftItems((current) => current.map((row, index) => (index === editIndex ? item : row)))}
          onRemove={() => aside(editIndex, draftItems[editIndex])}
          onClose={() => setEditIndex(null)}
        />
      ) : null}
      {pair ? (
        <CompareDialog
          fileName={fileName}
          kept={pair.kept.item}
          incoming={pair.item}
          confirming={confirming}
          choices={choices}
          picks={picks}
          busy={busy}
          onPick={(key, side) => setPicks((current) => ({ ...current, [key]: side }))}
          onClose={() => {
            setCompareIndex(null);
            setConfirming(false);
            setPicks({});
          }}
          onBack={() => setConfirming(false)}
          onKeep={() => keepDifferent(pair.index, pair.item)}
          onMerge={merge}
        />
      ) : null}
    </>
  );
}

function CompareDialog({
  fileName,
  kept,
  incoming,
  confirming,
  choices,
  picks,
  busy,
  onPick,
  onClose,
  onBack,
  onKeep,
  onMerge,
}: {
  fileName: string;
  kept: OnboardingCheckItem;
  incoming: OnboardingCheckItem;
  confirming: boolean;
  choices: IdentityChoice[];
  picks: Record<string, "kept" | "incoming">;
  busy: boolean;
  onPick: (key: string, side: "kept" | "incoming") => void;
  onClose: () => void;
  onBack: () => void;
  onKeep: () => void;
  onMerge: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (!node.open) node.showModal();
  }, []);
  const waiting = confirming && choices.some((choice) => !picks[choice.key]);
  return (
    <dialog ref={dialog} className="onboarding-review" data-compare="true" onClose={onClose} aria-labelledby="onboarding-compare-title">
      <div className="onboarding-review-head">
        <p className="onboarding-kicker">Compare</p>
        <button type="button" className="onboarding-btn onboarding-btn-ghost" onClick={onClose}>
          Close
        </button>
      </div>
      <h2 id="onboarding-compare-title">{confirming ? "Which value stays?" : "Are these the same role?"}</h2>
      {confirming ? (
        <div className="onboarding-review-body">
          <p className="onboarding-meta">These differ. Choose one for each. Both sets of lines stay on the role.</p>
          {choices.map((choice) => (
            <fieldset key={choice.key} className="onboarding-stay">
              <legend>{choice.label}</legend>
              <button type="button" aria-pressed={picks[choice.key] === "kept"} onClick={() => onPick(choice.key, "kept")}>
                {choice.kept}
              </button>
              <button type="button" aria-pressed={picks[choice.key] === "incoming"} onClick={() => onPick(choice.key, "incoming")}>
                {choice.incoming}
              </button>
            </fieldset>
          ))}
        </div>
      ) : (
        <div className="onboarding-compare-columns">
          <CompareColumn item={kept} fileLabel="Kept role" />
          <CompareColumn item={incoming} fileLabel={fileName} />
        </div>
      )}
      <div className="onboarding-actions" data-split="true">
        <button type="button" className="onboarding-btn onboarding-btn-ghost" disabled={busy} onClick={confirming ? onBack : onKeep}>
          {confirming ? "Back" : "Keep different"}
        </button>
        <button type="button" className="onboarding-btn onboarding-btn-solid" disabled={busy || waiting} onClick={onMerge}>
          {confirming ? "Confirm merge" : "Merge"}
        </button>
      </div>
    </dialog>
  );
}

function CompareColumn({ item, fileLabel }: { item: OnboardingCheckItem; fileLabel: string }) {
  const [workFull, setWorkFull] = useState(false);
  const job = item.kind === "Job";
  const placed = item.lat != null && item.lng != null;
  return (
    <div className="onboarding-review-body" data-work={workFull ? "full" : "split"}>
      <p className="onboarding-kicker">Extracted</p>
      <p className="onboarding-meta">{fileLabel}</p>
      {workFull ? null : (
        <>
          <label className="onboarding-field">
            <span>{job ? "Title" : "Degree"}</span>
            <input readOnly value={item.title} />
          </label>
          {job ? null : (
            <label className="onboarding-field">
              <span>Field</span>
              <input readOnly value={item.field} />
            </label>
          )}
          <label className="onboarding-field">
            <span>{job ? "Company" : "School"}</span>
            <input readOnly value={item.org} />
          </label>
          <div className="onboarding-field-row">
            <label className="onboarding-field">
              <span>Started</span>
              <input readOnly value={item.startDate} />
            </label>
            <label className="onboarding-field">
              <span>Ended</span>
              <input readOnly value={item.isCurrent ? "Present" : item.endDate} />
            </label>
          </div>
          {job ? (
            <label className="onboarding-current">
              <input type="checkbox" checked={item.isCurrent} readOnly />
              Current role
            </label>
          ) : null}
          <div className="onboarding-place">
            <span className="onboarding-pin" data-set={placed ? "true" : "false"} aria-hidden="true" />
            <div>
              <strong>{item.place === ONBOARDING_NO_PLACE ? "No place yet" : item.place}</strong>
              <span>{placed ? "On the map" : "No pin yet"}</span>
            </div>
          </div>
        </>
      )}
      {job ? (
        <WorkList lines={workLines(item)} expanded={workFull} onToggle={() => setWorkFull((value) => !value)} />
      ) : (
        <label className="onboarding-field">
          <span>Description</span>
          <textarea readOnly value={item.description} />
        </label>
      )}
    </div>
  );
}

type IdentityChoice = {
  key: string;
  label: string;
  kept: string;
  incoming: string;
  takes: ResumeFieldTake[];
};

function identityChoices(kept: OnboardingCheckItem, incoming: OnboardingCheckItem): IdentityChoice[] {
  const diffs = roleFieldDiffs(kept, incoming);
  const choices: IdentityChoice[] = [];
  for (const diff of diffs) {
    if (diff.field === "description" || diff.field === "achievement" || diff.field === "startDate" || diff.field === "endDate" || diff.field === "isCurrent") continue;
    choices.push({
      key: diff.field,
      label: choiceLabel(diff, incoming),
      kept: textOf(diff, "kept"),
      incoming: textOf(diff, "incoming"),
      takes: [{ field: diff.field }],
    });
  }
  if (diffs.some((diff) => diff.field === "startDate" || diff.field === "endDate" || diff.field === "isCurrent")) {
    const takes: ResumeFieldTake[] = [];
    if (kept.startDate !== incoming.startDate) takes.push({ field: "startDate" });
    if (kept.isCurrent !== incoming.isCurrent) takes.push({ field: "isCurrent" });
    else if (!incoming.isCurrent && kept.endDate !== incoming.endDate) takes.push({ field: "endDate" });
    choices.push({
      key: "dates",
      label: "Dates",
      kept: formatCareerSpan(kept.startDate, kept.isCurrent ? "" : kept.endDate, kept.isCurrent),
      incoming: formatCareerSpan(incoming.startDate, incoming.isCurrent ? "" : incoming.endDate, incoming.isCurrent),
      takes,
    });
  }
  return choices;
}

function lineTakes(kept: OnboardingCheckItem, incoming: OnboardingCheckItem): ResumeFieldTake[] {
  const takes: ResumeFieldTake[] = [];
  for (const diff of roleFieldDiffs(kept, incoming)) {
    if (diff.field === "achievement") takes.push({ field: "achievement", text: diff.incoming });
    if (diff.field === "description" && diff.incoming.trim()) takes.push({ field: "achievement", text: diff.incoming.trim() });
  }
  return takes;
}

function choiceLabel(diff: ResumeFieldDiff, item: OnboardingCheckItem): string {
  if (diff.field === "org") return item.kind === "School" ? "School" : "Company";
  if (diff.field === "field") return "Field";
  if (diff.field === "place") return "Place";
  return item.kind === "School" ? "Degree" : "Title";
}

function textOf(diff: ResumeFieldDiff, side: "kept" | "incoming"): string {
  if (diff.field === "achievement" || diff.field === "isCurrent") return "";
  const text = side === "kept" ? diff.kept : diff.incoming;
  return text || "Blank";
}

function hintCopy(reason: ResumeMatchReason, kept: OnboardingCheckItem): string {
  const name = kept.kind === "School" ? cardTitle(kept) : `${cardTitle(kept)} at ${kept.org}`;
  const label = `${name}, ${kept.span}`.replace(/,\s*$/, "");
  if (reason === "promotion") return `May be a later role than ${label}.`;
  if (reason === "employer") return `Same employer as ${label}.`;
  return `Might be the same as ${label}.`;
}
