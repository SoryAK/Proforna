import { useEffect, useRef, useState } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Divider } from "@astryxdesign/core/Divider";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { RadioIndicator } from "@astryxdesign/core/Indicator";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { List, ListItem } from "@astryxdesign/core/List";
import { ScrollableArea } from "@astryxdesign/core/ScrollableArea";
import { Heading, Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { RichTextEditor, RichTextEditorToolbar, editorStateJSONToMarkdown, markdownToEditorStateJSON } from "@astryxdesign/richtext";
import { CircleMarker, MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { formatCareerSpan } from "@core/career-file";
import {
  blankOnboardingCheckItem,
  isBlankOnboardingCheckItem,
  nextOnboardingSourceIndex,
  onboardingExtractSummary,
  ONBOARDING_NO_PLACE,
  type OnboardingCheckItem,
} from "@core/onboarding-review";
import { classifyResumePreview } from "@core/resume-preview";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { reversePlace, searchPlaces, splitPlaceAddress, type PlaceHit } from "./place-search";
import { usePlaceSuggestions } from "./use-place-suggestions";
import "leaflet/dist/leaflet.css";

GlobalWorkerOptions.workerSrc = workerUrl;

export function CheckOverview({
  items,
  file,
  busy,
  error,
  onChange,
  onBack,
  onContinue,
}: {
  items: OnboardingCheckItem[];
  file: File | null;
  busy: boolean;
  error: string | null;
  onChange: (items: OnboardingCheckItem[]) => void;
  onBack: () => void;
  onContinue: (items: OnboardingCheckItem[]) => void;
}) {
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [openedKeys, setOpenedKeys] = useState<string[]>([]);
  const summary = onboardingExtractSummary(items, 1);

  function updateAt(index: number, next: OnboardingCheckItem) {
    onChange(items.map((row, rowIndex) => (rowIndex === index ? stamped(next) : row)));
  }

  function removeAt(index: number) {
    const next = items.filter((_, rowIndex) => rowIndex !== index);
    onChange(next);
    setReviewOpen(next.length > 0 && reviewOpen);
    if (next.length === 0) return;
    setReviewIndex((current) => Math.min(current, next.length - 1));
  }

  function add(kind: OnboardingCheckItem["kind"]) {
    const item = blankOnboardingCheckItem(kind, nextOnboardingSourceIndex(items, kind));
    const next = [...items, item];
    onChange(next);
    setReviewIndex(next.length - 1);
    setReviewOpen(true);
  }

  function closeReview() {
    const next = items.filter((item) => !isBlankOnboardingCheckItem(item));
    if (next.length !== items.length) {
      onChange(next);
      setReviewIndex((current) => Math.min(current, Math.max(next.length - 1, 0)));
    }
    setReviewOpen(false);
  }

  useEffect(() => {
    if (!reviewOpen) return;
    const item = items[reviewIndex];
    if (!item) return;
    const key = checkItemKey(item);
    setOpenedKeys((current) => (current.includes(key) ? current : [...current, key]));
  }, [reviewOpen, reviewIndex, items]);

  function continueOn() {
    const next = items.filter((item) => !isBlankOnboardingCheckItem(item));
    if (next.length !== items.length) onChange(next);
    onContinue(next);
  }

  const unopenedCount = items.filter(
    (item) => !isBlankOnboardingCheckItem(item) && !openedKeys.includes(checkItemKey(item)),
  ).length;

  return (
    <>
      <Text type="label" display="block">Verify</Text>
      <Heading level={1}>
        Here's what was <em>extracted.</em>
      </Heading>
      <Text type="supporting" display="block">{summary}</Text>
      <Text type="supporting" display="block">Open a job or a school to review it against the resume.</Text>
      <VerifyBoard
        jobs={sectionCards(items, "Job", openedKeys, false, file?.name ?? null, (index) => {
          setReviewIndex(index);
          setReviewOpen(true);
        })}
        schools={sectionCards(items, "School", openedKeys, false, file?.name ?? null, (index) => {
          setReviewIndex(index);
          setReviewOpen(true);
        })}
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
          onClick={continueOn}
        />
      </div>
      <ReviewCarousel
        open={reviewOpen}
        items={items}
        file={file}
        index={reviewIndex}
        onIndex={setReviewIndex}
        onChange={updateAt}
        onRemove={removeAt}
        onClose={closeReview}
      />
    </>
  );
}

function ReviewCarousel({
  open,
  items,
  file,
  files,
  index,
  onIndex,
  onChange,
  onRemove,
  onClose,
}: {
  open: boolean;
  items: OnboardingCheckItem[];
  file: File | null;
  files?: Array<File | null>;
  index: number;
  onIndex: (index: number) => void;
  onChange: (index: number, item: OnboardingCheckItem) => void;
  onRemove: (index: number) => void;
  onClose: () => void;
}) {
  const item = items[index];
  const slideFile = files?.[index] ?? file;
  return (
    <Dialog
      isOpen={open && Boolean(item)}
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
      {item ? (
        <ReviewSlide
          item={item}
          file={slideFile}
          index={index}
          total={items.length}
          onChange={(next) => onChange(index, next)}
          onRemove={() => onRemove(index)}
          onPrevious={() => onIndex(Math.max(0, index - 1))}
          onNext={() => {
            if (index + 1 >= items.length) onClose();
            else onIndex(index + 1);
          }}
          onClose={onClose}
        />
      ) : null}
    </Dialog>
  );
}

function ReviewSlide({
  item,
  file,
  index,
  total,
  onChange,
  onRemove,
  onPrevious,
  onNext,
  onClose,
}: {
  item: OnboardingCheckItem;
  file: File | null;
  index: number;
  total: number;
  onChange: (item: OnboardingCheckItem) => void;
  onRemove: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const [streetOpen, setStreetOpen] = useState(false);
  useEffect(() => {
    setStreetOpen(false);
  }, [index, item.org]);
  const placed = item.lat != null && item.lng != null;
  const job = item.kind === "Job";
  const prompt = placePrompt(item.kind);
  const last = index + 1 >= total;
  return (
    <Layout
      padding={4}
      header={
        <DialogHeader
          title={`Verify ${headerTitle(item)}`}
          hasDivider
          onOpenChange={() => onClose()}
          style={{ paddingBottom: "0.75rem" }}
        />
      }
      content={
        <LayoutContent isScrollable label="Review role" padding={4}>
          <VStack gap={3}>
            <Text type="supporting" display="block">
              {index + 1} of {total}
            </Text>
            <div className="onboarding-review-compare" data-side-by-side={file ? "true" : undefined}>
              {file ? (
                <section className="onboarding-review-source" aria-label="Uploaded resume">
                  <ResumePreview file={file} paged />
                </section>
              ) : null}
              <VStack className="onboarding-review-body" gap={2}>
                <Text type="supporting">{item.sourceIndex < 0 ? "Added" : "Extracted"}</Text>
                <>
                    <TextInput
                      label={item.kind === "School" ? "Degree" : "Title"}
                      value={item.title}
                      onChange={(title) => onChange({ ...item, title })}
                    />
                    {item.kind === "School" ? (
                      <TextInput label="Field" value={item.field} onChange={(field) => onChange({ ...item, field })} />
                    ) : null}
                    <TextInput
                      label={item.kind === "School" ? "School" : "Company"}
                      value={item.org}
                      onChange={(org) => onChange({ ...item, org })}
                    />
                    <HStack gap={2}>
                      <VStack style={{ flex: 1, minWidth: 0 }}>
                        <TextInput
                          label="Started"
                          value={item.startDate}
                          placeholder="YYYY-MM"
                          onChange={(startDate) => onChange({ ...item, startDate })}
                        />
                      </VStack>
                      <VStack style={{ flex: 1, minWidth: 0 }}>
                        <TextInput
                          label="Ended"
                          value={item.isCurrent ? "" : item.endDate}
                          placeholder={item.isCurrent ? "Present" : "YYYY-MM"}
                          isDisabled={item.isCurrent}
                          onChange={(endDate) => onChange({ ...item, endDate })}
                        />
                      </VStack>
                    </HStack>
                    {item.kind === "Job" ? (
                      <CheckboxInput
                        label="Current role"
                        value={item.isCurrent}
                        onChange={(isCurrent) => onChange({ ...item, isCurrent })}
                      />
                    ) : null}
                    <HStack gap={2} align="center" justify="between">
                      <HStack gap={2} align="center">
                        <Badge label={placed ? "On the map" : "No pin yet"} variant={placed ? "success" : "neutral"} />
                        <Text>{item.place}</Text>
                      </HStack>
                      <Button
                        label={streetOpen ? "Close" : placed ? "Change" : prompt.add}
                        variant="ghost"
                        size="sm"
                        onClick={() => setStreetOpen((open) => !open)}
                      />
                    </HStack>
                    {streetOpen ? (
                      <RolePlacePicker
                        key={`${index}-${item.source}-${item.sourceIndex}`}
                        seed={item.place}
                        searching={streetOpen}
                        pinned={placed ? [item.lat as number, item.lng as number] : null}
                        prompt={prompt}
                        onChoose={(place, lat, lng) => {
                          onChange({ ...item, place, lat, lng });
                          setStreetOpen(false);
                        }}
                      />
                    ) : null}
                  </>
                <DutyEditor
                  key={`${item.source}-${item.sourceIndex}`}
                  item={item}
                  label={job ? "What you did" : "Description"}
                  onChange={onChange}
                />
              </VStack>
            </div>
          </VStack>
        </LayoutContent>
      }
      footer={
        <LayoutFooter hasDivider style={{ paddingTop: "0.75rem" }}>
          <HStack gap={2} justify="between">
            <Button label="Previous" variant="ghost" isDisabled={index === 0} onClick={onPrevious} />
            <HStack gap={2}>
              <Button label="Not this one" variant="ghost" onClick={onRemove} />
              <Button label={last ? "Done" : "Next"} variant="primary" onClick={onNext} />
            </HStack>
          </HStack>
        </LayoutFooter>
      }
    />
  );
}

export type VerifyCard = {
  key: string;
  title: string;
  meta: string;
  year: string;
  start: string;
  opened: boolean;
  stateLabel?: string;
  pending?: boolean;
  hint?: string;
  /** Key of the other row in this list that this one might match. */
  similarTo?: string;
  keepLabel?: string;
  onOpen?: () => void;
  onCompare?: () => void;
  onKeep?: () => void;
  onAside?: () => void;
};

const COUNT_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

function countWord(count: number): string {
  return COUNT_WORDS[count] ?? String(count);
}

function isInternshipTitle(title: string): boolean {
  return /\bintern(ship)?\b/i.test(title);
}

function pairKind(earlier: VerifyCard, later: VerifyCard, section: "job" | "school"): "job" | "school" | "internship" {
  if (section === "school") return "school";
  if (isInternshipTitle(earlier.title) && isInternshipTitle(later.title)) return "internship";
  return "job";
}

function similarityReviewLine(jobs: VerifyCard[], schools: VerifyCard[]): string | null {
  const counts = { job: 0, school: 0, internship: 0 };
  const countSection = (cards: VerifyCard[], section: "job" | "school") => {
    for (const block of verifyBlocks(cards)) {
      if (!block.link || block.link.opened) continue;
      counts[pairKind(block.cards[0], block.cards[1], section)] += 2;
    }
  };
  countSection(jobs, "job");
  countSection(schools, "school");
  const parts = [
    counts.job ? `${countWord(counts.job)} job ${counts.job === 1 ? "role" : "roles"}` : "",
    counts.school ? `${countWord(counts.school)} ${counts.school === 1 ? "school" : "schools"}` : "",
    counts.internship ? `${countWord(counts.internship)} ${counts.internship === 1 ? "internship" : "internships"}` : "",
  ].filter(Boolean);
  if (parts.length === 0) return null;
  const subject = parts.length === 1 ? parts[0] : parts.length === 2 ? `${parts[0]} and ${parts[1]}` : `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
  const total = counts.job + counts.school + counts.internship;
  const claim = total === 1 ? "has a high similarity and needs" : "have high similarities and need";
  return `${subject.charAt(0).toUpperCase()}${subject.slice(1)} ${claim} to be reviewed.`;
}

export function VerifyBoard({
  jobs,
  schools,
  onAddJob,
  onAddSchool,
}: {
  jobs: VerifyCard[];
  schools: VerifyCard[];
  onAddJob?: () => void;
  onAddSchool?: () => void;
}) {
  const reviewLine = similarityReviewLine(jobs, schools);
  return (
    <div className="onboarding-verify">
      {reviewLine ? (
        <Text type="supporting" role="status">
          {reviewLine}
        </Text>
      ) : null}
      <VerifySection heading="Jobs" cards={jobs} addLabel="Add job" onAdd={onAddJob} />
      <VerifySection heading="Schools" cards={schools} addLabel="Add school" onAdd={onAddSchool} />
    </div>
  );
}

function verifyBlocks(cards: VerifyCard[]): Array<{ key: string; cards: VerifyCard[]; link: VerifyCard | null }> {
  const byKey = new Map(cards.map((card) => [card.key, card]));
  const consumed = new Set<string>();
  const blocks: Array<{ key: string; cards: VerifyCard[]; link: VerifyCard | null }> = [];
  for (const card of cards) {
    if (consumed.has(card.key)) continue;
    const later = cards.find((item) => !consumed.has(item.key) && item.similarTo === card.key && item.onCompare);
    const earlier = card.similarTo && !consumed.has(card.similarTo) ? byKey.get(card.similarTo) : undefined;
    if (later) {
      consumed.add(card.key);
      consumed.add(later.key);
      blocks.push({ key: card.key, cards: [card, later], link: later });
    } else if (earlier && card.onCompare) {
      consumed.add(card.key);
      consumed.add(earlier.key);
      blocks.push({ key: earlier.key, cards: [earlier, card], link: card });
    } else {
      consumed.add(card.key);
      blocks.push({ key: card.key, cards: [card], link: null });
    }
  }
  return blocks;
}

function openCompare(card: VerifyCard, event: { preventDefault?: () => void; stopPropagation: () => void }) {
  event.preventDefault?.();
  event.stopPropagation();
  card.onCompare?.();
}

function needsLook(card: VerifyCard): boolean {
  return Boolean(card.onCompare) && !card.opened && !card.stateLabel;
}

function VerifyRow({ card, mark }: { card: VerifyCard; mark?: "circle" }) {
  const flagged = mark !== "circle" && needsLook(card);
  const badge = card.stateLabel ? (
    <Badge label={card.stateLabel} variant="neutral" />
  ) : flagged ? (
    <Badge
      label="Needs a look"
      variant="warning"
      role={card.onCompare ? "button" : undefined}
      tabIndex={card.onCompare ? 0 : undefined}
      aria-label={card.hint ? `Needs a look. ${card.hint}` : "Needs a look. Not opened."}
      onClick={card.onCompare ? (event) => openCompare(card, event) : undefined}
      onKeyDown={
        card.onCompare
          ? (event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              openCompare(card, event);
            }
          : undefined
      }
    />
  ) : (
    <span role="img" aria-label={card.opened ? "Opened" : "Not opened"}>
      <RadioIndicator state={card.opened ? "checked" : "unchecked"} size="sm" />
    </span>
  );
  return (
    <VStack gap={1}>
      <List density="compact" edge="padded" aria-label={card.title}>
        <ListItem
          itemKey={card.key}
          label={card.title}
          description={card.meta}
          isSelected={Boolean(card.pending)}
          onClick={card.onOpen}
          endContent={badge}
        />
      </List>
      {card.onKeep || card.onAside || (card.hint && !card.onCompare) || (mark !== "circle" && card.onCompare) ? (
        <HStack gap={2} wrap="wrap" vAlign="center">
          {card.hint && !card.onCompare ? <Text type="supporting">{card.hint}</Text> : null}
          {mark !== "circle" && card.onCompare ? (
            <Button label="Do a full comparison" size="sm" variant="secondary" onClick={() => card.onCompare?.()} />
          ) : null}
          {card.onKeep ? (
            <Button label={card.keepLabel ?? "Keep as its own role"} size="sm" variant="ghost" onClick={card.onKeep} />
          ) : null}
          {card.onAside ? <Button label="Not this one" size="sm" variant="ghost" onClick={card.onAside} /> : null}
        </HStack>
      ) : null}
    </VStack>
  );
}

function VerifyLink({
  link,
  earlier,
  later,
  summary,
  startOpen = false,
}: {
  link: VerifyCard;
  earlier: VerifyCard;
  later: VerifyCard;
  summary: string;
  startOpen?: boolean;
}) {
  const [expanded, setExpanded] = useState(startOpen);
  const rootRef = useRef<HTMLElement>(null);
  const openedOnArrival = useRef(false);
  useEffect(() => {
    if (!startOpen || openedOnArrival.current) return;
    openedOnArrival.current = true;
    setExpanded(true);
  }, [startOpen]);
  useEffect(() => {
    if (!expanded) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (event.target instanceof Element && event.target.closest("dialog, [role='dialog']")) return;
      setExpanded(false);
    };
    const onPointer = (event: PointerEvent) => {
      const root = rootRef.current;
      const target = event.target;
      if (!(target instanceof Node) || root?.contains(target)) return;
      if (target instanceof Element && target.closest("dialog, [role='dialog']")) return;
      setExpanded(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [expanded]);
  return (
    <VStack ref={rootRef} gap={1}>
      <List density="compact" edge="padded" aria-label={summary}>
        <ListItem
          itemKey={link.key}
          label={summary}
          isSelected
          aria-expanded={expanded}
          onClick={() => setExpanded((open) => !open)}
          startContent={<Icon icon="warning" color="warning" size="sm" aria-hidden />}
          endContent={<Badge label={needsLook(link) ? "Needs a look" : "Similar"} variant="warning" />}
        />
      </List>
      {expanded ? (
        <VStack gap={1}>
          <VerifyRow card={earlier} mark="circle" />
          <VerifyRow card={later} mark="circle" />
          <Button label="Do a full comparison" size="sm" variant="secondary" onClick={() => link.onCompare?.()} />
        </VStack>
      ) : null}
    </VStack>
  );
}

function VerifySection({
  heading,
  cards,
  addLabel,
  onAdd,
}: {
  heading: string;
  cards: VerifyCard[];
  addLabel?: string;
  onAdd?: () => void;
}) {
  const ordered = [...cards].sort((left, right) => left.start.localeCompare(right.start) || left.title.localeCompare(right.title));
  const blocks = verifyBlocks(ordered).sort((left, right) => Number(Boolean(right.link)) - Number(Boolean(left.link)));
  const onlyPair = blocks.length === 1 && Boolean(blocks[0]?.link);
  return (
    <VStack as="section" aria-label={heading} className="onboarding-verify-section" gap={2}>
      <HStack justify="between" align="center" width="100%">
        <Heading level={2}>{heading}</Heading>
        {onAdd && addLabel ? <Button label={addLabel} icon={<Icon icon={Plus} />} onClick={onAdd} /> : null}
      </HStack>
      <Card variant="muted">
        <ScrollableArea label={heading} padding={3} style={{ maxHeight: "18rem" }}>
          {cards.length === 0 ? <Text type="supporting">None extracted.</Text> : null}
          <VStack gap={0}>
            {blocks.map((block, index) => (
              <VStack key={block.key} gap={1}>
                {index > 0 ? <Divider /> : null}
                {block.link ? (
                  <VerifyLink
                    link={block.link}
                    earlier={block.cards[0]}
                    later={block.cards[1]}
                    summary={heading === "Schools" ? "Two similar schools" : "Two similar roles"}
                    startOpen={onlyPair}
                  />
                ) : (
                  <VerifyRow card={block.cards[0]} />
                )}
              </VStack>
            ))}
          </VStack>
        </ScrollableArea>
      </Card>
    </VStack>
  );
}

export function WorkList({
  lines,
  expanded,
  onToggle,
  onChange,
}: {
  lines: string[];
  expanded: boolean;
  onToggle: () => void;
  onChange?: (lines: string[]) => void;
}) {
  return (
    <div className="onboarding-did">
      <HStack justify="between" align="center">
        <Text type="supporting">What you did</Text>
        <Button label={expanded ? "Collapse" : "Expand"} variant="ghost" size="sm" aria-expanded={expanded} onClick={onToggle} />
      </HStack>
      <ul className="onboarding-did-lines">
        {lines.map((line, index) => (
          <li key={index}>
            {onChange ? (
              <textarea
                rows={1}
                value={line}
                aria-label={`What you did, line ${index + 1}`}
                onChange={(event) => {
                  const next = [...lines];
                  next[index] = event.target.value;
                  onChange(next);
                }}
              />
            ) : (
              line
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CheckReview(props: {
  open: boolean;
  items: OnboardingCheckItem[];
  file: File | null;
  files?: Array<File | null>;
  index: number;
  onIndex: (index: number) => void;
  onChange: (index: number, item: OnboardingCheckItem) => void;
  onRemove: (index: number) => void;
  onClose: () => void;
}) {
  return <ReviewCarousel {...props} />;
}

function sectionCards(
  items: OnboardingCheckItem[],
  kind: OnboardingCheckItem["kind"],
  openedKeys: string[],
  pointOut: boolean,
  fileName: string | null,
  onOpen: (index: number) => void,
): VerifyCard[] {
  return items.flatMap((item, index) => {
    if (item.kind !== kind) return [];
    const opened = openedKeys.includes(checkItemKey(item));
    return [
      {
        key: checkItemKey(item),
        title: cardTitle(item),
        meta: cardMeta(item, fileName),
        year: yearLabel(item),
        start: item.startDate,
        opened,
        pending: pointOut && !opened && !isBlankOnboardingCheckItem(item),
        onOpen: () => onOpen(index),
      },
    ];
  });
}

export function cardTitle(item: OnboardingCheckItem): string {
  if (item.kind === "School") return item.org.trim() || (item.sourceIndex < 0 ? "New school" : "School");
  return item.title.trim() || (item.sourceIndex < 0 ? "New job" : "Role");
}

export function cardMeta(item: OnboardingCheckItem, fileName?: string | null): string {
  const detail = item.kind === "School" ? [item.title, item.field].filter((part) => part.trim()).join(", ") : item.org.trim();
  return [detail, item.span.trim(), fileName?.trim()].filter(Boolean).join(" · ");
}

export function yearLabel(item: OnboardingCheckItem): string {
  const start = item.startDate.slice(0, 4);
  if (item.isCurrent) return start ? `${start} – Present` : "Present";
  const end = item.endDate.slice(0, 4);
  if (start && end && start !== end) return `${start} – ${end}`;
  return start || item.span.trim() || "Undated";
}

export function workLines(item: OnboardingCheckItem): string[] {
  return [item.description, ...item.achievements]
    .flatMap((line) => line.split("\n"))
    .map((line) => line.trim())
    .filter(Boolean);
}

function withWorkLines(item: OnboardingCheckItem, lines: string[]): OnboardingCheckItem {
  const description = (lines[0] ?? "").trim();
  const achievements = lines.slice(1);
  return {
    ...item,
    description,
    achievements,
    lines: [description, ...achievements.map((line) => line.trim())].filter(Boolean),
  };
}

function dutyMarkdown(item: OnboardingCheckItem): string {
  return workLines(item).join("\n\n");
}

function linesFromDutyMarkdown(markdown: string): string[] {
  return markdown
    .split("\n")
    .map((line) => line.replace(/^[-*]\s+/, "").trim())
    .filter(Boolean);
}

function DutyEditor({
  item,
  label,
  onChange,
}: {
  item: OnboardingCheckItem;
  label: string;
  onChange: (item: OnboardingCheckItem) => void;
}) {
  const itemRef = useRef(item);
  itemRef.current = item;
  return (
    <RichTextEditor
      label={label}
      width="100%"
      minHeight="8rem"
      defaultValue={markdownToEditorStateJSON(dutyMarkdown(item))}
      toolbar={<RichTextEditorToolbar />}
      onChange={(state) => {
        const current = itemRef.current;
        const markdown = editorStateJSONToMarkdown(JSON.stringify(state.toJSON()));
        const nextLines = linesFromDutyMarkdown(markdown);
        if (nextLines.join("\n") === workLines(current).join("\n")) return;
        onChange(withWorkLines(current, nextLines));
      }}
    />
  );
}

function checkItemKey(item: OnboardingCheckItem): string {
  return `${item.source}-${item.sourceIndex}`;
}

function headerTitle(item: OnboardingCheckItem): string {
  if (item.kind === "School") {
    const name = [item.title, item.field]
      .map((part) => part.trim())
      .filter(Boolean)
      .join(", ");
    return name || (item.sourceIndex < 0 ? "New school" : "School");
  }
  return item.title.trim() || (item.sourceIndex < 0 ? "New job" : "Role");
}

function placePrompt(kind: OnboardingCheckItem["kind"]): {
  add: string;
  label: string;
  empty: string;
  hint: string;
} {
  if (kind === "School") {
    return {
      add: "Add a place",
      label: "Campus or city",
      empty: "Campus or city",
      hint: "Type a campus or city, or click the map.",
    };
  }
  return {
    add: "Add a street",
    label: "Street or place",
    empty: "Street, city",
    hint: "Type a street, or click the map.",
  };
}

function stamped(item: OnboardingCheckItem): OnboardingCheckItem {
  return {
    ...item,
    span: formatCareerSpan(item.startDate, item.isCurrent ? "" : item.endDate, item.isCurrent),
    endDate: item.isCurrent ? "" : item.endDate,
    place: item.place.trim() || ONBOARDING_NO_PLACE,
  };
}

export function ResumePreview({ file, paged = false }: { file: File; paged?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const [textPreview, setTextPreview] = useState<string | null>(null);
  const [pdfNote, setPdfNote] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [page, setPage] = useState(0);
  const kind = classifyResumePreview(file);
  const showPager = paged && pageCount > 1;

  useEffect(() => {
    if (kind !== "pdf") return;
    const target = host.current;
    if (!target) return;
    let cancel = false;
    setPage(0);
    setPageCount(0);
    setPdfNote("Reading the resume…");
    const taskPromise = file.arrayBuffer().then((buffer) => getDocument({ data: new Uint8Array(buffer) }));
    void taskPromise
      .then(async (task) => {
        try {
          const doc = await task.promise;
          if (cancel) return;
          target.replaceChildren();
          for (let number = 1; number <= doc.numPages; number += 1) {
            if (cancel) break;
            const pageView = await doc.getPage(number);
            const unscaled = pageView.getViewport({ scale: 1 });
            const width = target.clientWidth || unscaled.width;
            const scale = Math.min(2, ((width - 2) / unscaled.width) * (window.devicePixelRatio || 1));
            const viewport = pageView.getViewport({ scale });
            const canvas = document.createElement("canvas");
            canvas.width = Math.floor(viewport.width);
            canvas.height = Math.floor(viewport.height);
            if (paged && number === 1) canvas.dataset.active = "true";
            await pageView.render({ canvas, viewport }).promise;
            if (!cancel) target.appendChild(canvas);
          }
          if (!cancel) {
            setPageCount(doc.numPages);
            setPdfNote(null);
          }
        } catch {
          if (!cancel) setPdfNote("The resume could not be shown here.");
        }
      })
      .catch(() => {
        if (!cancel) setPdfNote("The resume could not be shown here.");
      });
    return () => {
      cancel = true;
      void taskPromise.then((task) => task.destroy()).catch(() => undefined);
    };
  }, [file, kind, paged]);

  useEffect(() => {
    const target = host.current;
    if (!target || !paged) return;
    target.querySelectorAll("canvas").forEach((canvas, index) => {
      if (index === page) canvas.dataset.active = "true";
      else delete canvas.dataset.active;
    });
    target.scrollTop = 0;
  }, [page, pageCount, paged]);

  useEffect(() => {
    if (kind !== "text") return;
    let cancel = false;
    void file.text().then((text) => {
      if (!cancel) setTextPreview(text);
    });
    return () => {
      cancel = true;
    };
  }, [file, kind]);

  return (
    <div className="onboarding-preview" data-paged={paged ? "true" : undefined}>
      {kind === "pdf" ? (
        <>
          <div className="onboarding-preview-pages" ref={host} data-paging={showPager ? "true" : undefined} />
          {pdfNote ? <p className="onboarding-preview-fallback">{pdfNote}</p> : null}
          {showPager ? (
            <HStack className="onboarding-preview-pager" gap={2} align="center" justify="between">
              <Button
                label="Previous page"
                variant="ghost"
                size="sm"
                isIconOnly
                icon={<Icon icon={ChevronLeft} size="sm" />}
                isDisabled={page === 0}
                onClick={() => setPage((current) => Math.max(0, current - 1))}
              />
              <Text type="supporting">
                {page + 1} of {pageCount}
              </Text>
              <Button
                label="Next page"
                variant="ghost"
                size="sm"
                isIconOnly
                icon={<Icon icon={ChevronRight} size="sm" />}
                isDisabled={page + 1 >= pageCount}
                onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
              />
            </HStack>
          ) : null}
        </>
      ) : null}
      {kind === "text" ? <pre className="onboarding-preview-text">{textPreview ?? "Reading…"}</pre> : null}
      {kind === "other" ? (
        <p className="onboarding-preview-fallback">{file.name} cannot be shown here. You can still continue.</p>
      ) : null}
    </div>
  );
}

function RolePlacePicker({
  seed,
  searching,
  pinned,
  prompt,
  onChoose,
}: {
  seed: string;
  searching: boolean;
  pinned: [number, number] | null;
  prompt: { label: string; empty: string; hint: string };
  onChoose: (place: string, lat: number, lng: number) => void;
}) {
  const [query, setQuery] = useState("");
  const hits = usePlaceSuggestions(query);
  const [center, setCenter] = useState<[number, number] | null>(pinned);
  const [looking, setLooking] = useState(false);
  useEffect(() => {
    if (pinned) return;
    const place = seed.trim();
    if (place.length < 3 || place === ONBOARDING_NO_PLACE) return;
    let cancel = false;
    void searchPlaces(place).then((result) => {
      const hit = result?.places[0];
      if (!cancel && hit) setCenter([hit.latitude, hit.longitude]);
    });
    return () => {
      cancel = true;
    };
  }, [pinned, seed]);

  function choose(hit: PlaceHit) {
    setQuery("");
    setCenter([hit.latitude, hit.longitude]);
    onChoose(splitPlaceAddress(hit.address).label, hit.latitude, hit.longitude);
  }

  async function drop(lat: number, lng: number) {
    setLooking(true);
    setQuery("");
    setCenter([lat, lng]);
    const result = await reversePlace(lat, lng);
    setLooking(false);
    const hit = result?.place ?? result?.places[0];
    if (!hit) return;
    onChoose(splitPlaceAddress(hit.address || hit.label).label, hit.latitude, hit.longitude);
  }

  return (
    <div>
      {searching ? (
        <>
          <label className="onboarding-field">
            <span>{prompt.label}</span>
            <input
              value={query}
              autoComplete="off"
              placeholder={seed === ONBOARDING_NO_PLACE ? prompt.empty : seed}
              role="combobox"
              aria-expanded={hits.length > 0}
              aria-autocomplete="list"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          {hits.length > 0 ? (
            <ul className="onboarding-suggest" role="listbox">
              {hits.map((hit) => (
                <li key={`${hit.address}-${hit.latitude}`}>
                  <button type="button" onClick={() => choose(hit)}>
                    {hit.address}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="onboarding-quiet">{prompt.hint}</p>
        </>
      ) : (
        <p className="onboarding-quiet">{pinned ? "Click the map to move it." : "Click the map to pin it."}</p>
      )}
      <div className="onboarding-role-map">
        <MapContainer center={center ?? [39.8283, -98.5795]} zoom={center ? 12 : 4} scrollWheelZoom={false}>
          <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <MapFrame center={center} />
          <MapDrop onDrop={(lat, lng) => void drop(lat, lng)} />
          {pinned ? (
            <CircleMarker
              center={pinned}
              radius={8}
              pathOptions={{ color: "#f2d19b", fillColor: "#c4a574", fillOpacity: 1, weight: 2 }}
            />
          ) : null}
        </MapContainer>
      </div>
      {looking ? <p className="onboarding-quiet">Looking up that spot.</p> : null}
    </div>
  );
}

function MapFrame({ center }: { center: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (!center) return;
    map.setView(center, 12);
  }, [map, center]);
  return null;
}

function MapDrop({ onDrop }: { onDrop: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(event) {
      onDrop(event.latlng.lat, event.latlng.lng);
    },
  });
  return null;
}
