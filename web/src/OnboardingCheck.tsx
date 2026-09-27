import { useEffect, useRef, useState } from "react";
import { CircleMarker, MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { formatCareerSpan } from "@core/career-file";
import {
  blankOnboardingCheckItem,
  isBlankOnboardingCheckItem,
  nextOnboardingSourceIndex,
  ONBOARDING_NO_PLACE,
  type OnboardingCheckItem,
} from "@core/onboarding-review";
import { classifyResumePreview } from "@core/resume-preview";
import { reversePlace, searchPlaces, splitPlaceAddress, type PlaceHit } from "./place-search";
import { usePlaceSuggestions } from "./use-place-suggestions";
import "leaflet/dist/leaflet.css";

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
  const jobs = items.filter((item) => item.kind === "Job").length;
  const schools = items.filter((item) => item.kind === "School").length;
  const summary = [
    jobs > 0 ? `${jobs} ${jobs === 1 ? "job" : "jobs"}` : "",
    schools > 0 ? `${schools} ${schools === 1 ? "school" : "schools"}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

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

  function continueOn() {
    const next = items.filter((item) => !isBlankOnboardingCheckItem(item));
    if (next.length !== items.length) onChange(next);
    onContinue(next);
  }

  return (
    <>
      <p className="onboarding-kicker">Verify</p>
      <h1>
        Here's what was <em>extracted.</em>
      </h1>
      {summary ? <p className="onboarding-meta">{summary}</p> : null}
      <ul className="onboarding-roster">
        {items.map((item) => (
          <li key={`${item.source}-${item.sourceIndex}`}>
            <div className="onboarding-place">
              <div>
                <strong>{headerTitle(item)}</strong>
                <span>{headerDetail(item)}</span>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <div className="onboarding-verify-actions">
        <button type="button" className="onboarding-verify-btn" onClick={() => add("Job")}>
          Add a job
        </button>
        <button type="button" className="onboarding-verify-btn" onClick={() => add("School")}>
          Add a school
        </button>
        <button type="button" className="onboarding-verify-btn" onClick={() => setReviewOpen(true)}>
          Review each one
        </button>
      </div>
      {error ? (
        <p className="onboarding-alert" role="alert">
          {error}
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
  index,
  onIndex,
  onChange,
  onRemove,
  onClose,
}: {
  open: boolean;
  items: OnboardingCheckItem[];
  file: File | null;
  index: number;
  onIndex: (index: number) => void;
  onChange: (index: number, item: OnboardingCheckItem) => void;
  onRemove: (index: number) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const item = items[index];
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open) {
      if (!node.open) node.showModal();
      return;
    }
    if (node.open) node.close();
  }, [open]);
  return (
    <dialog
      ref={dialog}
      className="onboarding-review"
      data-compare={file ? "true" : undefined}
      onClose={onClose}
      aria-labelledby="onboarding-review-title"
    >
      {item ? (
        <ReviewSlide
          item={item}
          file={file}
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
  useEffect(() => {
    setStreetOpen(false);
  }, [index, item.org]);
  const placed = item.lat != null && item.lng != null;
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
        <div className="onboarding-review-body">
          <p className="onboarding-kicker">{item.sourceIndex < 0 ? "Added" : "Extracted"}</p>
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
        {item.kind === "Job" ? (
          <>
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
                {streetOpen ? "Close" : placed ? "Change" : "Add a street"}
              </button>
            </div>
            {streetOpen || placed ? (
              <RolePlacePicker
                key={`${index}-${item.sourceIndex}`}
                seed={item.place}
                searching={streetOpen || !placed}
                pinned={placed ? [item.lat as number, item.lng as number] : null}
                onChoose={(place, lat, lng) => {
                  onChange({ ...item, place, lat, lng });
                  setStreetOpen(false);
                }}
              />
            ) : null}
          </>
        ) : (
          <label className="onboarding-field">
            <span>Place</span>
            <input
              value={item.place === ONBOARDING_NO_PLACE ? "" : item.place}
              onChange={(event) => onChange({ ...item, place: event.target.value })}
            />
          </label>
        )}
        <label className="onboarding-field">
          <span>Description</span>
          <textarea
            value={item.description}
            onChange={(event) => onChange({ ...item, description: event.target.value })}
          />
        </label>
        {item.kind === "Job" ? (
          <label className="onboarding-field">
            <span>Achievements</span>
            <textarea
              value={item.achievements.join("\n")}
              placeholder="One on each line"
              onChange={(event) =>
                onChange({ ...item, achievements: event.target.value.split("\n") })
              }
            />
          </label>
        ) : null}
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

function headerDetail(item: OnboardingCheckItem): string {
  return [item.kind, item.org.trim(), item.span.trim()].filter(Boolean).join(" · ");
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
  const [textPreview, setTextPreview] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const kind = classifyResumePreview(file);

  useEffect(() => {
    if (kind === "pdf") {
      const url = URL.createObjectURL(file);
      setPdfUrl(url);
      setTextPreview(null);
      return () => URL.revokeObjectURL(url);
    }
    if (kind === "text") {
      setPdfUrl(null);
      let cancel = false;
      void file.text().then((text) => {
        if (!cancel) setTextPreview(text);
      });
      return () => {
        cancel = true;
      };
    }
    setPdfUrl(null);
    setTextPreview(null);
  }, [file, kind]);

  return (
    <div className="onboarding-preview">
      {kind === "pdf" && pdfUrl ? (
        <iframe className="onboarding-preview-frame" title="Resume preview" src={pdfUrl} />
      ) : null}
      {kind === "text" ? (
        <pre className="onboarding-preview-text">{textPreview ?? "Reading…"}</pre>
      ) : null}
      {kind === "other" ? (
        <p className="onboarding-preview-fallback">
          {file.name} cannot be shown here. You can still continue.
        </p>
      ) : null}
    </div>
  );
}

function RolePlacePicker({
  seed,
  searching,
  pinned,
  onChoose,
}: {
  seed: string;
  searching: boolean;
  pinned: [number, number] | null;
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
            <span>Street or place</span>
            <input
              value={query}
              autoComplete="off"
              placeholder={seed === ONBOARDING_NO_PLACE ? "Street, city" : seed}
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
          <p className="onboarding-quiet">Type a street, or click the map.</p>
        </>
      ) : (
        <p className="onboarding-quiet">Click the map to move it.</p>
      )}
      <div className="onboarding-role-map">
        <MapContainer center={center ?? [39.8283, -98.5795]} zoom={center ? 12 : 4} scrollWheelZoom={false}>
          <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <MapFrame center={center} />
          <MapDrop onDrop={(lat, lng) => void drop(lat, lng)} />
          {center ? (
            <CircleMarker
              center={center}
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
