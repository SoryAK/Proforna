import { useEffect, useState } from "react";
import { CircleMarker, MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { ONBOARDING_NO_PLACE, type OnboardingCheckItem } from "@core/onboarding-review";
import { YesNo } from "./onboarding-offer";
import { reversePlace, searchPlaces, splitPlaceAddress, type PlaceHit } from "./place-search";
import { usePlaceSuggestions } from "./use-place-suggestions";
import "leaflet/dist/leaflet.css";

export function RoleCheck({
  items,
  index,
  pinPlaces,
  onPinPlaces,
  onPlace,
  onDrop,
  onBack,
  onNext,
}: {
  items: OnboardingCheckItem[];
  index: number;
  pinPlaces: "each" | "skip" | null;
  onPinPlaces: (value: "each" | "skip") => void;
  onPlace: (index: number, place: string, lat: number, lng: number) => void;
  onDrop: () => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const item = items[index];
  const [streetOpen, setStreetOpen] = useState(false);
  useEffect(() => {
    setStreetOpen(false);
  }, [index, item?.org]);
  if (!item) return null;
  const placed = item.lat != null && item.lng != null;
  const firstUnpinned = items.findIndex((row) => row.lat == null);
  const askingForStreets = pinPlaces === null && index === firstUnpinned;
  const searching = (pinPlaces === "each" && !placed) || streetOpen;
  return (
    <>
      <p className="onboarding-kicker">
        Check {index + 1} of {items.length}
      </p>
      <h1>
        Did this get <em>{item.org}</em> right?
      </h1>
      <p className="onboarding-meta">
        <span>
          {item.kind} · {item.title}
        </span>
        {item.span ? <span>{item.span}</span> : null}
      </p>
      <div className="onboarding-place">
        <span className="onboarding-pin" data-set={placed ? "true" : "false"} aria-hidden="true" />
        <div>
          <strong>{item.place}</strong>
          <span>{placed ? "On the map" : "No pin yet"}</span>
        </div>
        {!placed && pinPlaces === "skip" && !streetOpen ? (
          <button type="button" className="onboarding-place-action" onClick={() => setStreetOpen(true)}>
            Add a street
          </button>
        ) : null}
        {placed ? (
          <button type="button" className="onboarding-place-action" onClick={() => setStreetOpen((open) => !open)}>
            {streetOpen ? "Close" : "Change"}
          </button>
        ) : null}
      </div>
      {askingForStreets ? (
        <div className="onboarding-pin-ask">
          <p>Add a street for each role?</p>
          <YesNo value={null} onYes={() => onPinPlaces("each")} onNo={() => onPinPlaces("skip")} />
        </div>
      ) : null}
      {searching || placed ? (
        <RolePlacePicker
          key={`${index}-${item.org}`}
          seed={item.place}
          searching={searching}
          pinned={placed ? [item.lat as number, item.lng as number] : null}
          onChoose={(place, lat, lng) => {
            onPlace(index, place, lat, lng);
            setStreetOpen(false);
          }}
        />
      ) : null}
      <RoleNotes lines={item.lines} />
      <div className="onboarding-actions" data-split="true">
        <button type="button" className="onboarding-btn onboarding-btn-ghost" onClick={onBack}>
          Back
        </button>
        <div className="onboarding-action-pair">
          <button type="button" className="onboarding-btn onboarding-btn-ghost" onClick={onDrop}>
            Not this one
          </button>
          <button
            type="button"
            className="onboarding-btn onboarding-btn-solid"
            disabled={askingForStreets}
            onClick={onNext}
          >
            Looks right
          </button>
        </div>
      </div>
    </>
  );
}

function RoleNotes({ lines }: { lines: string[] }) {
  const [open, setOpen] = useState(false);
  if (lines.length === 0) return <p className="onboarding-quiet">No duties were read from the file.</p>;
  const long = lines.length > 1 || lines[0].length > 140;
  return (
    <div className="onboarding-notes">
      <p className={open ? "onboarding-quiet" : "onboarding-quiet onboarding-note-clamp"}>{lines[0]}</p>
      {long ? (
        <button
          type="button"
          className="onboarding-notes-toggle"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          {open ? "Hide the notes" : `${lines.length} notes from the file`}
        </button>
      ) : null}
      {open && lines.length > 1 ? (
        <ul className="onboarding-work">
          {lines.slice(1).map((line, lineIndex) => (
            <li key={`${lineIndex}-${line.slice(0, 24)}`}>{line}</li>
          ))}
        </ul>
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
