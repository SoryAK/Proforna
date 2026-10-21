import { useEffect, useRef, useState } from "react";
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
      <p className="onboarding-kicker">Verify</p>
      <h1>
        Here's what was <em>extracted.</em>
      </h1>
      <p className="onboarding-meta">{summary}</p>
      <p className="onboarding-meta">Open a job or a school to review it against the resume.</p>
      <VerifyBoard
        jobs={sectionCards(items, "Job", openedKeys, false, file?.name ?? null, (index) => {
          setReviewIndex(index);
          setReviewOpen(true);
        })}
        schools={sectionCards(items, "School", openedKeys, false, file?.name ?? null, (index) => {
          setReviewIndex(index);
          setReviewOpen(true);
        })}
      />
      <div className="onboarding-verify-actions">
        <button type="button" className="onboarding-verify-btn" onClick={() => add("Job")}>
          Add a job
        </button>
        <button type="button" className="onboarding-verify-btn" onClick={() => add("School")}>
          Add a school
        </button>
        <button
          type="button"
          className="onboarding-verify-btn"
          disabled={items.length === 0}
          onClick={() => {
            setReviewIndex(0);
            setReviewOpen(true);
          }}
        >
          Review each one
        </button>
      </div>
      {error ? (
        <p className="onboarding-alert" role="alert">
          {error}
        </p>
      ) : null}
      {unopenedCount > 0 ? (
        <p className="onboarding-quiet" role="status">
          {unopenedCount === 1 ? "1 has not been opened." : `${unopenedCount} have not been opened.`} Worth a look before you continue.
        </p>
      ) : null}
      <div className="onboarding-actions" data-split="true">
        <button type="button" className="onboarding-btn onboarding-btn-ghost" disabled={busy} onClick={onBack}>
          Back
        </button>
        <button type="button" className="onboarding-btn onboarding-btn-solid" disabled={busy} onClick={continueOn}>
          {busy ? "Saving…" : "Continue"}
        </button>
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
  const dialog = useRef<HTMLDialogElement>(null);
  const item = items[index];
  const slideFile = files?.[index] ?? file;
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open) {
      if (!node.open) node.showModal();
      setShown(true);
      return;
    }
    setShown(false);
    if (node.open) node.close();
  }, [open]);
  return (
    <dialog
      ref={dialog}
      className="onboarding-review"
      data-compare={slideFile ? "true" : undefined}
      onClose={onClose}
      aria-labelledby="onboarding-review-title"
    >
      {shown && item ? (
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
    </dialog>
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
  const [workFull, setWorkFull] = useState(false);
  useEffect(() => {
    setStreetOpen(false);
    setWorkFull(false);
  }, [index, item.org]);
  const placed = item.lat != null && item.lng != null;
  const job = item.kind === "Job";
  const prompt = placePrompt(item.kind);
  const last = index + 1 >= total;
  return (
    <>
      <div className="onboarding-review-head">
        <p className="onboarding-kicker">
          {index + 1} of {total}
        </p>
        <button type="button" className="onboarding-btn onboarding-btn-ghost" onClick={onClose}>
          Close
        </button>
      </div>
      <h2 id="onboarding-review-title">
        Verify <em>{headerTitle(item)}</em>
      </h2>
      <div className="onboarding-review-compare">
        {file ? (
          <section className="onboarding-review-source" aria-label="Uploaded resume">
            <h3>Resume</h3>
            <ResumePreview file={file} />
          </section>
        ) : null}
        <div className="onboarding-review-body" data-work={workFull ? "full" : "split"}>
          <p className="onboarding-kicker">{item.sourceIndex < 0 ? "Added" : "Extracted"}</p>
        {workFull ? null : (
        <>
        <label className="onboarding-field">
          <span>{item.kind === "School" ? "Degree" : "Title"}</span>
          <input
            value={item.title}
            onChange={(event) => onChange({ ...item, title: event.target.value })}
          />
        </label>
        {item.kind === "School" ? (
          <label className="onboarding-field">
            <span>Field</span>
            <input value={item.field} onChange={(event) => onChange({ ...item, field: event.target.value })} />
          </label>
        ) : null}
        <label className="onboarding-field">
          <span>{item.kind === "School" ? "School" : "Company"}</span>
          <input value={item.org} onChange={(event) => onChange({ ...item, org: event.target.value })} />
        </label>
        <div className="onboarding-field-row">
          <label className="onboarding-field">
            <span>Started</span>
            <input
              value={item.startDate}
              placeholder="YYYY-MM"
              onChange={(event) => onChange({ ...item, startDate: event.target.value })}
            />
          </label>
          <label className="onboarding-field">
            <span>Ended</span>
            <input
              value={item.isCurrent ? "" : item.endDate}
              placeholder={item.isCurrent ? "Present" : "YYYY-MM"}
              disabled={item.isCurrent}
              onChange={(event) => onChange({ ...item, endDate: event.target.value })}
            />
          </label>
        </div>
        {item.kind === "Job" ? (
          <label className="onboarding-current">
            <input
              type="checkbox"
              checked={item.isCurrent}
              onChange={(event) => onChange({ ...item, isCurrent: event.target.checked })}
            />
            Current role
          </label>
        ) : null}
        <div className="onboarding-place">
          <span className="onboarding-pin" data-set={placed ? "true" : "false"} aria-hidden="true" />
          <div>
            <strong>{item.place}</strong>
            <span>{placed ? "On the map" : "No pin yet"}</span>
          </div>
          <button
            type="button"
            className="onboarding-place-action"
            onClick={() => setStreetOpen((open) => !open)}
          >
            {streetOpen ? "Close" : placed ? "Change" : prompt.add}
          </button>
        </div>
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
        )}
        {job ? (
          <WorkList
            lines={workLines(item)}
            expanded={workFull}
            onToggle={() => setWorkFull((value) => !value)}
            onChange={(lines) => onChange(withWorkLines(item, lines))}
          />
        ) : (
          <label className="onboarding-field">
            <span>Description</span>
            <textarea
              value={item.description}
              onChange={(event) => onChange({ ...item, description: event.target.value })}
            />
          </label>
        )}
        </div>
      </div>
      <div className="onboarding-actions" data-split="true">
        <button
          type="button"
          className="onboarding-btn onboarding-btn-ghost"
          disabled={index === 0}
          onClick={onPrevious}
        >
          Previous
        </button>
        <div className="onboarding-action-pair">
          <button type="button" className="onboarding-btn onboarding-btn-ghost" onClick={onRemove}>
            Not this one
          </button>
          <button type="button" className="onboarding-btn onboarding-btn-solid" onClick={onNext}>
            {last ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </>
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
  keepLabel?: string;
  onOpen?: () => void;
  onCompare?: () => void;
  onKeep?: () => void;
  onAside?: () => void;
};

export function VerifyBoard({ jobs, schools }: { jobs: VerifyCard[]; schools: VerifyCard[] }) {
  return (
    <div className="onboarding-verify">
      <VerifySection heading="Jobs" cards={jobs} />
      <VerifySection heading="Schools" cards={schools} />
    </div>
  );
}

function VerifySection({ heading, cards }: { heading: string; cards: VerifyCard[] }) {
  const ordered = [...cards].sort((left, right) => left.start.localeCompare(right.start) || left.title.localeCompare(right.title));
  const years = [...new Set(ordered.map((card) => card.year))];
  return (
    <section className="onboarding-verify-section" aria-label={heading}>
      <h2>{heading}</h2>
      <div className="onboarding-verify-box" tabIndex={0}>
        {cards.length === 0 ? <p className="onboarding-meta">None extracted.</p> : null}
        <ol className="onboarding-verify-rail">
          {years.map((year) => (
            <li key={year}>
              <span className="onboarding-verify-year">{year}</span>
              {ordered
                .filter((card) => card.year === year)
                .map((card) => (
                  <div key={card.key}>
                    {card.onOpen ? (
                      <button
                        type="button"
                        className="onboarding-verify-row"
                        data-opened={card.opened ? "true" : "false"}
                        data-pending={card.pending ? "true" : undefined}
                        onClick={card.onOpen}
                      >
                        <VerifyRowText card={card} />
                      </button>
                    ) : (
                      <div className="onboarding-verify-row" data-opened={card.opened ? "true" : "false"}>
                        <VerifyRowText card={card} />
                      </div>
                    )}
                    {card.hint || card.onCompare || card.onKeep || card.onAside ? (
                      <div className="onboarding-verify-hint">
                        {card.hint ? <p>{card.hint}</p> : null}
                        <div className="onboarding-verify-hint-actions">
                          {card.onCompare ? (
                            <button type="button" className="onboarding-btn onboarding-btn-solid" onClick={card.onCompare}>
                              Compare
                            </button>
                          ) : null}
                          {card.onKeep ? (
                            <button type="button" className="onboarding-btn onboarding-btn-ghost" onClick={card.onKeep}>
                              {card.keepLabel ?? "Keep as its own role"}
                            </button>
                          ) : null}
                          {card.onAside ? (
                            <button type="button" className="onboarding-btn onboarding-btn-ghost" onClick={card.onAside}>
                              Not this one
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function VerifyRowText({ card }: { card: VerifyCard }) {
  return (
    <>
      <strong>{card.title}</strong>
      <span className="onboarding-verify-meta">{card.meta}</span>
      <span className="onboarding-roster-state" data-opened={card.opened ? "true" : "false"}>
        {card.stateLabel ?? (card.opened ? "Opened" : "Not opened")}
      </span>
    </>
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
    <div className="onboarding-field onboarding-did">
      <div className="onboarding-field-head">
        <span>What you did</span>
        <button type="button" className="onboarding-field-toggle" aria-expanded={expanded} onClick={onToggle}>
          {expanded ? "Collapse" : "Expand"}
        </button>
      </div>
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

export function ResumePreview({ file }: { file: File }) {
  const host = useRef<HTMLDivElement>(null);
  const [textPreview, setTextPreview] = useState<string | null>(null);
  const [pdfNote, setPdfNote] = useState<string | null>(null);
  const kind = classifyResumePreview(file);

  useEffect(() => {
    if (kind !== "pdf") return;
    const target = host.current;
    if (!target) return;
    let cancel = false;
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
            const page = await doc.getPage(number);
            const unscaled = page.getViewport({ scale: 1 });
            const width = target.clientWidth || unscaled.width;
            const scale = Math.min(2, ((width - 2) / unscaled.width) * (window.devicePixelRatio || 1));
            const viewport = page.getViewport({ scale });
            const canvas = document.createElement("canvas");
            canvas.width = Math.floor(viewport.width);
            canvas.height = Math.floor(viewport.height);
            await page.render({ canvas, viewport }).promise;
            if (!cancel) target.appendChild(canvas);
          }
          if (!cancel) setPdfNote(null);
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
  }, [file, kind]);

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
    <div className="onboarding-preview">
      {kind === "pdf" ? (
        <>
          <div className="onboarding-preview-pages" ref={host} />
          {pdfNote ? <p className="onboarding-preview-fallback">{pdfNote}</p> : null}
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
