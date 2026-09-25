import { useEffect, useState, type FormEvent } from "react";
import {
  LIFE_ANCHOR_ICONS,
  type LifeAnchor,
  type LifeAnchorIcon,
} from "@core/life-anchor";
import { usePlaceSuggestions } from "./use-place-suggestions";

const PRESETS: Array<{ label: string; icon: LifeAnchorIcon }> = [
  { label: "Home", icon: "home" },
  { label: "Spouse's work", icon: "work" },
  { label: "Kids' school", icon: "school" },
  { label: "Gym", icon: "gym" },
  { label: "Parent's home", icon: "family" },
];

const ICON_LABELS: Record<LifeAnchorIcon, string> = {
  home: "Home",
  work: "Work",
  school: "School",
  family: "Family",
  gym: "Gym",
  worship: "Worship",
  other: "Other",
};

export function LifeAnchors({
  onChange,
}: {
  onChange: (anchors: LifeAnchor[]) => void;
}) {
  const [anchors, setAnchors] = useState<LifeAnchor[]>([]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [icon, setIcon] = useState<LifeAnchorIcon>("home");
  const [address, setAddress] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [weight, setWeight] = useState(3);
  const [note, setNote] = useState("");
  const suggestions = usePlaceSuggestions(latitude == null ? address : "");

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    const response = await fetch("/api/life-anchors");
    if (!response.ok) return;
    const body = (await response.json()) as { anchors?: LifeAnchor[] };
    const next = body.anchors ?? [];
    setAnchors(next);
    onChange(next);
  }

  function clearForm() {
    setEditingId(null);
    setLabel("");
    setIcon("home");
    setAddress("");
    setLatitude(null);
    setLongitude(null);
    setWeight(3);
    setNote("");
  }

  function toggleForm() {
    if (open) {
      setOpen(false);
      clearForm();
      return;
    }
    clearForm();
    setOpen(true);
  }

  function choosePreset(preset: { label: string; icon: LifeAnchorIcon }) {
    clearForm();
    setLabel(preset.label);
    setIcon(preset.icon);
    setOpen(true);
  }

  function edit(anchor: LifeAnchor) {
    setEditingId(anchor.id);
    setLabel(anchor.label);
    setIcon(anchor.icon);
    setAddress(anchor.address);
    setLatitude(anchor.latitude);
    setLongitude(anchor.longitude);
    setWeight(anchor.weight);
    setNote("");
    setOpen(true);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setNote("");
    const response = await fetch(
      editingId ? `/api/life-anchors/${editingId}` : "/api/life-anchors",
      {
        method: editingId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          label,
          icon,
          address,
          latitude,
          longitude,
          weight,
        }),
      },
    );
    if (!response.ok) {
      setNote("Choose an address the map can place.");
      return;
    }
    clearForm();
    setOpen(false);
    await load();
  }

  async function remove(id: string) {
    const response = await fetch(`/api/life-anchors/${id}`, { method: "DELETE" });
    if (!response.ok) {
      setNote("That anchor could not be removed.");
      return;
    }
    if (editingId === id) {
      clearForm();
      setOpen(false);
    }
    await load();
  }

  return (
    <section className="life-anchors">
      <div className="life-anchors-heading">
        <h2>Life anchors</h2>
        <button type="button" onClick={toggleForm}>
          {open ? "Close" : "Add"}
        </button>
      </div>
      {open ? (
        <form className="compact-career-form life-anchor-fields" onSubmit={(event) => void save(event)}>
          <label>
            Name
            <input
              required
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Home"
            />
          </label>
          <label>
            Kind
            <select
              value={icon}
              onChange={(event) => setIcon(event.target.value as LifeAnchorIcon)}
            >
              {LIFE_ANCHOR_ICONS.map((option) => (
                <option key={option} value={option}>
                  {ICON_LABELS[option]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Address
            <input
              required
              value={address}
              onChange={(event) => {
                setAddress(event.target.value);
                setLatitude(null);
                setLongitude(null);
              }}
              placeholder="Street, city"
            />
          </label>
          {suggestions.length > 0 ? (
            <div className="life-anchor-suggestions">
              {suggestions.map((place) => (
                <button
                  key={`${place.latitude},${place.longitude}`}
                  type="button"
                  onClick={() => {
                    setAddress(place.address);
                    setLatitude(place.latitude);
                    setLongitude(place.longitude);
                  }}
                >
                  {place.label}
                </button>
              ))}
            </div>
          ) : null}
          <label>
            Weight
            <input
              type="number"
              min={1}
              max={5}
              value={weight}
              onChange={(event) => setWeight(Number(event.target.value))}
            />
          </label>
          <button type="submit">{editingId ? "Update anchor" : "Save anchor"}</button>
          {note ? <small>{note}</small> : null}
        </form>
      ) : null}
      <div className="life-anchor-presets">
        {PRESETS.map((preset) => (
          <button key={preset.label} type="button" onClick={() => choosePreset(preset)}>
            {preset.label}
          </button>
        ))}
      </div>
      {anchors.map((anchor) => (
        <p className="life-anchor-row" key={anchor.id}>
          <span>
            {anchor.label}
            <small>
              {anchor.address} · weight {anchor.weight}
            </small>
          </span>
          <span className="life-anchor-actions">
            <button type="button" onClick={() => edit(anchor)}>
              Edit
            </button>
            <button type="button" onClick={() => void remove(anchor.id)}>
              Remove
            </button>
          </span>
        </p>
      ))}
      {!open && note ? <small>{note}</small> : null}
    </section>
  );
}
