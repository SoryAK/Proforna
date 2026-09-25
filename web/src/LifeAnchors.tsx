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

export function LifeAnchors({
  onChange,
}: {
  onChange: (anchors: LifeAnchor[]) => void;
}) {
  const [anchors, setAnchors] = useState<LifeAnchor[]>([]);
  const [open, setOpen] = useState(false);
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

  function choosePreset(preset: { label: string; icon: LifeAnchorIcon }) {
    setLabel(preset.label);
    setIcon(preset.icon);
    setOpen(true);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setNote("");
    const response = await fetch("/api/life-anchors", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        label,
        icon,
        address,
        latitude,
        longitude,
        weight,
      }),
    });
    if (!response.ok) {
      setNote("Choose an address the map can place.");
      return;
    }
    setLabel("");
    setAddress("");
    setLatitude(null);
    setLongitude(null);
    setWeight(3);
    setOpen(false);
    await load();
  }

  async function remove(id: string) {
    await fetch(`/api/life-anchors/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <section className="life-anchors">
      <div className="life-anchors-heading">
        <h2>Life anchors</h2>
        <button type="button" onClick={() => setOpen((value) => !value)}>
          {open ? "Close" : "Add"}
        </button>
      </div>
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
          <button type="button" onClick={() => void remove(anchor.id)}>
            Remove
          </button>
        </p>
      ))}
      {open ? (
        <form className="compact-career-form" onSubmit={(event) => void save(event)}>
          <input
            required
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Name"
          />
          <select
            value={icon}
            onChange={(event) => setIcon(event.target.value as LifeAnchorIcon)}
          >
            {LIFE_ANCHOR_ICONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <input
            required
            value={address}
            onChange={(event) => {
              setAddress(event.target.value);
              setLatitude(null);
              setLongitude(null);
            }}
            placeholder="Address"
          />
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
          <button type="submit">Save anchor</button>
          {note ? <small>{note}</small> : null}
        </form>
      ) : null}
    </section>
  );
}
