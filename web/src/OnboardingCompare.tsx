import { useEffect, useState } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { Switch } from "@astryxdesign/core/Switch";
import { RadioList, RadioListItem } from "@astryxdesign/core/RadioList";
import { Heading, Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { formatCareerSpan } from "@core/career-file";
import {
  addHeldRole,
  applySameRole,
  hintHeldRoles,
  hintNextResume,
  hintSetAside,
  followSkillEdits,
  rememberSkills,
  roleFieldDiffs,
  type SkillEdit,
  roleTookFile,
  type HeldRole,
  type HeldSkill,
  type ResumeFieldDiff,
  type ResumeFieldTake,
  type ResumeMatchReason,
  type SetAsideRole,
} from "@core/resume-compare";
import {
  blankOnboardingCheckItem,
  isBlankOnboardingCheckItem,
  nextOnboardingSourceIndex,
  onboardingExtractSummary,
  ONBOARDING_NO_PLACE,
  type OnboardingCheckItem,
} from "@core/onboarding-review";
import type { OnboardingTimelineRow } from "./onboarding-session";
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
        <Text type="label" display="block">Resume</Text>
        <Heading level={1}>
          Nothing new in <em>{fileName}</em>
        </Heading>
        <div className="onboarding-actions" data-split="true">
          <Button className="onboarding-nav" label="Back" variant="ghost" onClick={onBack} />
          <Button
            className="onboarding-nav"
            label={busy ? "Saving…" : "Continue"}
            variant="primary"
            isDisabled={busy}
            onClick={() => onDone(draftHeld, acceptSkills)}
          />
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
          similarTo: role ? role.id : undefined,
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
      <Text type="label" display="block">Resume</Text>
      <Heading level={1}>
        Here's what was <em>extracted.</em>
      </Heading>
      <Text type="supporting" display="block">{fileName}</Text>
      <Text type="supporting" display="block">Compare a role when it might be one you already have. A role this file never mentions stays.</Text>
      <VerifyBoard
        jobs={[...heldCards("job"), ...incomingCards("job")]}
        schools={[...heldCards("school"), ...incomingCards("school")]}
      />
      {error ? (
        <Banner status="error" title={error} container="section" collapsible={false} role="alert" />
      ) : null}
      <div className="onboarding-actions" data-split="true">
        <Button className="onboarding-nav" label="Back" variant="ghost" isDisabled={busy} onClick={onBack} />
        <Button
          className="onboarding-nav"
          label={busy ? "Saving…" : "Continue"}
          variant="primary"
          isDisabled={busy}
          onClick={() => finish(draftHeld, acceptSkills)}
        />
      </div>
      {editIndex != null && draftItems[editIndex] ? (
        <CheckReview
          open
          items={[draftItems[editIndex]]}
          rowIds={[`file-${fileIndex}-${draftItems[editIndex].source}-${draftItems[editIndex].sourceIndex}`]}
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
  const waiting = confirming && choices.some((choice) => !picks[choice.key]);
  const title = confirming ? "Which value stays?" : "Are these the same role?";
  const [showAll, setShowAll] = useState(false);
  return (
    <Dialog
      isOpen
      purpose="form"
      width="min(72rem, calc(100vw - 2.5rem))"
      maxHeight="min(85dvh, 44rem)"
      padding={0}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") event.stopPropagation();
      }}
    >
      <Layout
        padding={4}
        header={<DialogHeader title={title} hasDivider onOpenChange={() => onClose()} style={{ paddingBottom: "0.75rem" }} />}
        content={
          <LayoutContent isScrollable label="Compare roles" padding={4}>
            <VStack gap={3}>
              {confirming ? (
                <VStack gap={3}>
                  <Text type="supporting">Compare</Text>
                  <Text type="supporting">These differ. Choose one for each. Both sets of lines stay on the role.</Text>
                  {choices.map((choice) => (
                    <RadioList
                      key={choice.key}
                      label={choice.label}
                      htmlName={`stay-${choice.key}`}
                      value={picks[choice.key] ?? ""}
                      onChange={(side) => onPick(choice.key, side === "incoming" ? "incoming" : "kept")}
                    >
                      <RadioListItem value="kept" label={choice.kept} />
                      <RadioListItem value="incoming" label={choice.incoming} />
                    </RadioList>
                  ))}
                </VStack>
              ) : (
                <>
                  <HStack justify="between" align="center">
                    <Text type="supporting">Compare</Text>
                    <Switch label="Show all fields" value={showAll} onChange={setShowAll} />
                  </HStack>
                  <div className="onboarding-compare-columns">
                    <CompareColumn item={kept} fileLabel="Kept role" other={incoming} showAll={showAll} />
                    <CompareColumn item={incoming} fileLabel={fileName} other={kept} showAll={showAll} />
                  </div>
                </>
              )}
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider style={{ paddingTop: "0.75rem" }}>
            <HStack gap={2} justify="between">
              <Button
                label={confirming ? "Back" : "Keep different"}
                variant="ghost"
                isDisabled={busy}
                onClick={confirming ? onBack : onKeep}
              />
              <Button
                label={confirming ? "Confirm merge" : "Merge"}
                variant="primary"
                isDisabled={busy || waiting}
                onClick={onMerge}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}

const LINE_PREVIEW = 3;

function changedFields(item: OnboardingCheckItem, other: OnboardingCheckItem | undefined): Set<string> {
  const changed = new Set<string>();
  if (!other) return changed;
  for (const diff of roleFieldDiffs(item, other)) changed.add(diff.field);
  for (const diff of roleFieldDiffs(other, item)) changed.add(diff.field);
  return changed;
}

function CompareLines({ label, lines, otherLines }: { label: string; lines: string[]; otherLines: string[] }) {
  const [open, setOpen] = useState(false);
  const known = new Set(otherLines.map((line) => line.trim().toLowerCase()).filter(Boolean));
  const long = lines.length > LINE_PREVIEW;
  const shown = long && !open ? lines.slice(0, LINE_PREVIEW) : lines;
  const missing = lines.length === 0 && otherLines.some((line) => line.trim());
  return (
    <VStack gap={1}>
      <Text type="supporting">{label}</Text>
      {missing ? (
        <HStack gap={1} align="center">
          <Icon icon="warning" color="warning" size="sm" aria-hidden />
          <Text>Blank</Text>
        </HStack>
      ) : (
        shown.map((line, index) => {
          const different = !known.has(line.trim().toLowerCase());
          return (
            <HStack key={`${index}-${line}`} gap={1} align="center">
              {different ? <Icon icon="warning" color="warning" size="sm" aria-hidden /> : null}
              <Text>{line}</Text>
            </HStack>
          );
        })
      )}
      {lines.length === 0 && !missing ? <Text type="supporting">Blank</Text> : null}
      {long ? (
        <Button
          label={open ? "Collapse" : "Expand"}
          size="sm"
          variant="ghost"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        />
      ) : null}
    </VStack>
  );
}

export function CompareColumn({
  item,
  fileLabel,
  kicker = "Extracted",
  other,
  showAll = true,
}: {
  item: OnboardingCheckItem;
  fileLabel: string;
  kicker?: string;
  other?: OnboardingCheckItem;
  showAll?: boolean;
}) {
  const [workFull, setWorkFull] = useState(false);
  const job = item.kind === "Job";
  const placed = item.lat != null && item.lng != null;
  const comparing = other != null;
  const changed = changedFields(item, other);
  const visible = (field: string) => !comparing || showAll || changed.has(field);
  const mark = (field: string) => (comparing && changed.has(field) ? ({ type: "warning" as const }) : undefined);
  const endMarked = changed.has("endDate") || changed.has("isCurrent");
  const showEnd = visible("endDate") || (comparing && changed.has("isCurrent"));
  const showDates = visible("startDate") || showEnd;
  const showLines = !comparing || showAll || changed.has("description") || changed.has("achievement");
  return (
    <VStack className="onboarding-review-body" data-work={workFull ? "full" : "split"} gap={2}>
      <VStack gap={0}>
        <Text type="supporting">{kicker}</Text>
        <Text type="supporting">{fileLabel}</Text>
      </VStack>
      {workFull && !comparing ? null : (
        <>
          {visible("title") ? (
            <TextInput label={job ? "Title" : "Degree"} value={item.title} isReadOnly status={mark("title")} onChange={() => undefined} />
          ) : null}
          {!job && visible("field") ? (
            <TextInput label="Field" value={item.field} isReadOnly status={mark("field")} onChange={() => undefined} />
          ) : null}
          {visible("org") ? (
            <TextInput label={job ? "Company" : "School"} value={item.org} isReadOnly status={mark("org")} onChange={() => undefined} />
          ) : null}
          {showDates ? (
            <HStack gap={2}>
              {visible("startDate") ? (
                <VStack style={{ flex: 1, minWidth: 0 }}>
                  <TextInput label="Started" value={item.startDate} isReadOnly status={mark("startDate")} onChange={() => undefined} />
                </VStack>
              ) : null}
              {showEnd ? (
                <VStack style={{ flex: 1, minWidth: 0 }}>
                  <TextInput
                    label="Ended"
                    value={item.isCurrent ? "Present" : item.endDate}
                    isReadOnly
                    status={comparing && endMarked ? { type: "warning" as const } : undefined}
                    onChange={() => undefined}
                  />
                </VStack>
              ) : null}
            </HStack>
          ) : null}
          {job && visible("isCurrent") ? (
            <CheckboxInput label="Current role" value={item.isCurrent} isReadOnly onChange={() => undefined} />
          ) : null}
          {visible("place") ? (
            comparing ? (
              <TextInput
                label="Place"
                value={item.place === ONBOARDING_NO_PLACE ? "No place yet" : item.place}
                isReadOnly
                status={mark("place")}
                onChange={() => undefined}
              />
            ) : (
              <HStack gap={2} align="center">
                <Badge label={placed ? "On the map" : "No pin yet"} variant={placed ? "success" : "neutral"} />
                <Text>{item.place === ONBOARDING_NO_PLACE ? "No place yet" : item.place}</Text>
              </HStack>
            )
          ) : null}
        </>
      )}
      {comparing ? (
        showLines ? (
          <CompareLines label={job ? "What you did" : "Description"} lines={workLines(item)} otherLines={other ? workLines(other) : []} />
        ) : null
      ) : job ? (
        <WorkList lines={workLines(item)} expanded={workFull} onToggle={() => setWorkFull((value) => !value)} />
      ) : (
        <TextArea label="Description" value={item.description} isReadOnly onChange={() => undefined} />
      )}
    </VStack>
  );
}

type IdentityChoice = {
  key: string;
  label: string;
  kept: string;
  incoming: string;
  takes: ResumeFieldTake[];
};

export function identityChoices(kept: OnboardingCheckItem, incoming: OnboardingCheckItem): IdentityChoice[] {
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

export function lineTakes(kept: OnboardingCheckItem, incoming: OnboardingCheckItem): ResumeFieldTake[] {
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

export function resumeMatchCopy(reason: ResumeMatchReason, kept: OnboardingCheckItem): string {
  return hintCopy(reason, kept);
}

function hintCopy(reason: ResumeMatchReason, kept: OnboardingCheckItem): string {
  const name = kept.kind === "School" ? cardTitle(kept) : `${cardTitle(kept)} at ${kept.org}`;
  const label = `${name}, ${kept.span}`.replace(/,\s*$/, "");
  if (reason === "promotion") return `May be a later role than ${label}.`;
  if (reason === "employer") return `Same employer as ${label}.`;
  return `Might be the same as ${label}.`;
}

export type ResumeBundle = {
  file: File;
  fileIndex: number;
  name: string;
  skills: string[];
  items: OnboardingCheckItem[];
};

export function AllResumesVerify({
  bundles,
  initialRows,
  initialDeclined,
  editedItems,
  editedFileIndex,
  priorHeld = [],
  asides,
  busy,
  error,
  editSkills = false,
  onBack,
  onSetAside,
  onForgetAside,
  onRows,
  onDone,
  onReviewChange,
  hideHeading = false,
}: {
  bundles: ResumeBundle[];
  initialRows: OnboardingTimelineRow[] | null;
  initialDeclined: string[];
  editedItems: OnboardingCheckItem[];
  editedFileIndex: number;
  priorHeld?: HeldRole[];
  asides: SetAsideRole[];
  busy: boolean;
  error: string | null;
  editSkills?: boolean;
  onBack: () => void;
  onSetAside: (item: OnboardingCheckItem) => void;
  onForgetAside: (id: string) => void;
  onRows: (rows: OnboardingTimelineRow[], declined: string[]) => void;
  onDone: (held: HeldRole[], skills: HeldSkill[]) => void;
  onReviewChange?: (open: boolean) => void;
  hideHeading?: boolean;
}) {
  const [rows, setRows] = useState<OnboardingTimelineRow[]>(
    () => initialRows ?? overlayFileEdits(buildTimeline(bundles), editedItems, editedFileIndex),
  );
  const [prior, setPrior] = useState(priorHeld);
  const [declined, setDeclined] = useState(initialDeclined);
  const [opened, setOpened] = useState<string[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [picks, setPicks] = useState<Record<string, "kept" | "incoming">>({});
  const [skillEdit, setSkillEdit] = useState<SkillEdit | null>(null);
  const [continueWarned, setContinueWarned] = useState(false);
  const visible = rows.filter((row) => !row.removed);
  const summary = onboardingExtractSummary(
    bundles.flatMap((bundle) => bundle.items),
    bundles.length,
  );
  const pair = comparePair(rows, prior, compareId);
  const choices = pair ? identityChoices(pair.earlierItem, pair.later.item) : [];

  useEffect(() => {
    onRows(rows, declined);
  }, [rows, declined, onRows]);

  useEffect(() => {
    const open = editId !== null || compareId !== null;
    onReviewChange?.(open);
    return () => onReviewChange?.(false);
  }, [editId, compareId, onReviewChange]);

  function markOpened(id: string) {
    setOpened((current) => (current.includes(id) ? current : [...current, id]));
  }

  function patch(id: string, item: OnboardingCheckItem) {
    setRows((current) =>
      current.map((row) =>
        row.id === id ? { ...row, item, role: row.role ? { ...row.role, item } : null } : row,
      ),
    );
  }

  function removeRow(id: string) {
    const row = rows.find((item) => item.id === id);
    if (!row || isBlankOnboardingCheckItem(row.item)) {
      setRows((current) => current.filter((item) => item.id !== id));
    } else {
      onSetAside(row.item);
      setRows((current) => current.map((item) => (item.id === id ? { ...item, removed: true } : item)));
    }
    setEditId(null);
    setCompareId(null);
  }

  function keepDifferent(laterId: string) {
    const match = comparePair(rows, prior, laterId);
    if (!match) return;
    const aside = hintSetAside(asides, match.later.item);
    if (aside) onForgetAside(aside.id);
    setDeclined((current) => {
      const key = pairKey(match.earlierId, match.later.id);
      return current.includes(key) ? current : [...current, key];
    });
    setRows((current) =>
      current.map((row) => (row.id === match.later.id ? { ...row, adopted: true } : row)),
    );
    setCompareId(null);
    setConfirming(false);
    setPicks({});
  }

  function adopt(id: string) {
    const row = rows.find((item) => item.id === id);
    if (!row) return;
    const aside = hintSetAside(asides, row.item);
    if (aside) onForgetAside(aside.id);
    setRows((current) => current.map((item) => (item.id === id ? { ...item, adopted: true } : item)));
  }

  function merge() {
    if (!pair) return;
    if (!confirming && choices.length > 0) {
      setConfirming(true);
      return;
    }
    if (choices.some((choice) => !picks[choice.key])) return;
    const takes = [
      ...lineTakes(pair.earlierItem, pair.later.item),
      ...choices.filter((choice) => picks[choice.key] === "incoming").flatMap((choice) => choice.takes),
    ];
    const nextRole = applySameRole(pair.earlierRole, pair.later.item, pair.later.fileIndex, takes);
    const aside = hintSetAside(asides, pair.later.item);
    if (aside) onForgetAside(aside.id);
    if (pair.fromCareer) setPrior((current) => current.map((role) => (role.id === nextRole.id ? nextRole : role)));
    setRows((current) =>
      current.map((row) => {
        if (!pair.fromCareer && row.id === pair.earlierId) return { ...row, item: nextRole.item, role: nextRole, adopted: true };
        if (row.id === pair.later.id) return { ...row, removed: true, adopted: true };
        return row;
      }),
    );
    setCompareId(null);
    setConfirming(false);
    setPicks({});
    setEditId(null);
  }

  function keptRoles(): HeldRole[] {
    let held: HeldRole[] = prior.filter((role) => bundles.some((bundle) => roleTookFile(role, bundle.fileIndex)));
    for (const row of rows) {
      if (row.removed || isBlankOnboardingCheckItem(row.item)) continue;
      if (!row.adopted && hintSetAside(asides, row.item)) continue;
      const role = row.role ?? addHeldRole([], row.item, row.fileIndex)[0];
      if (role) held = [...held, { ...role, item: row.item }];
    }
    return held;
  }

  function foundSkills(held: HeldRole[]): HeldSkill[] {
    let skills: HeldSkill[] = [];
    for (const bundle of bundles) {
      const tookJob = held.some((role) => role.item.source === "job" && roleTookFile(role, bundle.fileIndex));
      skills = rememberSkills(skills, bundle.skills, bundle.fileIndex, tookJob);
    }
    return skills;
  }

  function shownSkills(): HeldSkill[] {
    const found = foundSkills(keptRoles());
    return editSkills ? followSkillEdits(found, skillEdit) : found;
  }

  function finish() {
    onDone(keptRoles(), shownSkills());
  }

  function add(kind: OnboardingCheckItem["kind"]) {
    const item = blankOnboardingCheckItem(kind, nextOnboardingSourceIndex(rows.map((row) => row.item), kind));
    const fileIndex = bundles[0]?.fileIndex ?? 0;
    const row: OnboardingTimelineRow = {
      id: `file-${fileIndex}-${item.source}-${item.sourceIndex}`,
      fileIndex,
      item,
      removed: false,
      adopted: true,
      role: null,
    };
    setRows((current) => [...current, row]);
    markOpened(row.id);
    setEditId(row.id);
  }

  const cards = (section: "job" | "school"): VerifyCard[] =>
    visible
      .filter((row) => row.item.source === section)
      .map((row) => {
        const fileName = bundles.find((bundle) => bundle.fileIndex === row.fileIndex)?.name ?? null;
        const match = matchFor(rows, prior, row, declined);
        const asideHit = !match && hintSetAside(asides, row.item);
        return {
          key: row.id,
          title: cardTitle(row.item),
          meta: cardMeta(row.item, fileName),
          year: yearLabel(row.item),
          start: row.item.startDate,
          opened: opened.includes(row.id),
          hint: match
            ? hintCopy(match.hint.reason, match.earlierItem)
            : asideHit && !row.adopted
              ? "You set this aside before."
              : undefined,
          similarTo: match && !match.fromCareer ? match.earlierId : undefined,
          keepLabel: asideHit && !row.adopted && !match ? "Add this role" : undefined,
          onOpen: () => {
            markOpened(row.id);
            setCompareId(null);
            setEditId(row.id);
          },
          onCompare: match
            ? () => {
                markOpened(row.id);
                setEditId(null);
                setCompareId(row.id);
                setConfirming(false);
                setPicks({});
              }
            : undefined,
          onKeep: asideHit && !row.adopted && !match ? () => adopt(row.id) : undefined,
        };
      });

  const editIndex = visible.findIndex((row) => row.id === editId);
  const unreviewedSimilar = [...cards("job"), ...cards("school")].filter((card) => card.onCompare && !card.opened).length;
  const unopenedCount = visible.filter(
    (row) => !isBlankOnboardingCheckItem(row.item) && !opened.includes(row.id),
  ).length;

  return (
    <>
      {hideHeading ? null : (
        <>
          <Text type="label" display="block">Verify</Text>
          <Heading level={1}>
            Here's what was <em>extracted.</em>
          </Heading>
        </>
      )}
      <Text type="supporting" display="block">{summary}</Text>
      <Text type="supporting" display="block">
        {bundles.length > 1 || prior.length > 0
          ? "Open a job or a school to review it. Compare a role when it might be the same as another."
          : "Open a job or a school to review it against the resume."}
      </Text>
      <VerifyBoard
        jobs={cards("job")}
        schools={cards("school")}
        onAddJob={() => add("Job")}
        onAddSchool={() => add("School")}
      />
      {error ? (
        <Banner status="error" title={error} container="section" collapsible={false} role="alert" />
      ) : null}
      {unopenedCount > 0 ? (
        <Text type="supporting" display="block" role="status">
          {unopenedCount === 1 ? "1 has not been opened." : `${unopenedCount} have not been opened.`} Worth a look before you continue.
        </Text>
      ) : null}
      <div className="onboarding-actions" data-split="true">
        <Button className="onboarding-nav" label="Back" variant="ghost" isDisabled={busy} onClick={onBack} />
        <Button
          className="onboarding-nav"
          label={busy ? "Saving…" : "Continue"}
          variant="primary"
          isDisabled={busy}
          onClick={() => {
            if (unreviewedSimilar > 0) {
              setContinueWarned(true);
              return;
            }
            finish();
          }}
        />
      </div>
      <Dialog
        isOpen={continueWarned}
        purpose="form"
        width={440}
        onOpenChange={(next) => {
          if (!next) setContinueWarned(false);
        }}
      >
        <Layout
          padding={4}
          header={<DialogHeader title="Before you continue" hasDivider onOpenChange={() => setContinueWarned(false)} />}
          content={
            <LayoutContent>
              <Text type="body" display="block">
                {unreviewedSimilar === 1 ? "1 has not been opened." : `${unreviewedSimilar} have not been opened.`} It&apos;s worth a look before you continue.
              </Text>
            </LayoutContent>
          }
          footer={
            <LayoutFooter hasDivider>
              <HStack gap={2} justify="between">
                <Button label="Go back" variant="ghost" onClick={() => setContinueWarned(false)} />
                <Button
                  label="Continue anyways"
                  variant="primary"
                  isDisabled={busy}
                  onClick={() => {
                    setContinueWarned(false);
                    finish();
                  }}
                />
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>
      {editIndex >= 0 ? (
        <CheckReview
          open
          items={visible.map((row) => row.item)}
          rowIds={visible.map((row) => row.id)}
          file={null}
          files={visible.map((row) => bundles.find((bundle) => bundle.fileIndex === row.fileIndex)?.file ?? null)}
          index={editIndex}
          onIndex={(index) => {
            const row = visible[index];
            if (!row) return;
            markOpened(row.id);
            setEditId(row.id);
          }}
          onChange={(index, item) => {
            const row = visible[index];
            if (row) patch(row.id, item);
          }}
          onRemove={(index) => {
            const row = visible[index];
            if (row) removeRow(row.id);
          }}
          onClose={() => {
            setRows((current) => current.filter((row) => !isBlankOnboardingCheckItem(row.item)));
            setEditId(null);
          }}
        />
      ) : null}
      {pair ? (
        <CompareDialog
          fileName={bundles.find((bundle) => bundle.fileIndex === pair.later.fileIndex)?.name ?? "Resume"}
          kept={pair.earlierItem}
          incoming={pair.later.item}
          confirming={confirming}
          choices={choices}
          picks={picks}
          busy={busy}
          onPick={(key, side) => setPicks((current) => ({ ...current, [key]: side }))}
          onClose={() => {
            setCompareId(null);
            setConfirming(false);
            setPicks({});
          }}
          onBack={() => setConfirming(false)}
          onKeep={() => keepDifferent(pair.later.id)}
          onMerge={merge}
        />
      ) : null}
    </>
  );
}

function overlayFileEdits(
  rows: OnboardingTimelineRow[],
  edited: OnboardingCheckItem[],
  fileIndex: number,
): OnboardingTimelineRow[] {
  if (edited.length === 0) return rows;
  return rows.map((row) => {
    if (row.fileIndex !== fileIndex) return row;
    const next = edited.find((item) => item.source === row.item.source && item.sourceIndex === row.item.sourceIndex);
    return next ? { ...row, item: next } : row;
  });
}

function buildTimeline(bundles: ResumeBundle[]): OnboardingTimelineRow[] {
  const rows: OnboardingTimelineRow[] = [];
  for (const bundle of bundles) {
    for (const item of bundle.items) {
      if (isBlankOnboardingCheckItem(item)) continue;
      rows.push({
        id: `file-${bundle.fileIndex}-${item.source}-${item.sourceIndex}`,
        fileIndex: bundle.fileIndex,
        item,
        removed: false,
        adopted: false,
        role: null,
      });
    }
  }
  return rows;
}

function pairKey(earlierId: string, laterId: string): string {
  return `${earlierId}|${laterId}`;
}

function matchFor(
  rows: readonly OnboardingTimelineRow[],
  prior: readonly HeldRole[],
  row: OnboardingTimelineRow,
  declined: readonly string[],
): {
  earlierId: string;
  earlierItem: OnboardingCheckItem;
  earlierRole: HeldRole;
  fromCareer: boolean;
  hint: { reason: ResumeMatchReason };
} | null {
  const index = rows.findIndex((item) => item.id === row.id);
  const earlier = rows.filter((item, itemIndex) => itemIndex < index && !item.removed && item.fileIndex < row.fileIndex);
  const earlierHeld = earlier.flatMap((item) => {
    const role = item.role ?? addHeldRole([], item.item, item.fileIndex)[0];
    return role ? [{ ...role, id: item.id }] : [];
  });
  const hint = hintNextResume(prior, earlierHeld, row.item, declined, row.id);
  if (!hint) return null;
  const career = prior.find((role) => role.id === hint.roleId);
  if (career) {
    return { earlierId: career.id, earlierItem: career.item, earlierRole: career, fromCareer: true, hint };
  }
  const match = earlier.find((item) => item.id === hint.roleId);
  const role = match ? (match.role ?? addHeldRole([], match.item, match.fileIndex)[0]) : undefined;
  if (!match || !role) return null;
  return {
    earlierId: match.id,
    earlierItem: match.item,
    earlierRole: { ...role, id: match.id },
    fromCareer: false,
    hint,
  };
}

function comparePair(rows: readonly OnboardingTimelineRow[], prior: readonly HeldRole[], laterId: string | null) {
  if (!laterId) return null;
  const later = rows.find((row) => row.id === laterId && !row.removed);
  if (!later) return null;
  const match = matchFor(rows, prior, later, []);
  if (!match) return null;
  return { ...match, later };
}
