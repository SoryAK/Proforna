import { useEffect, useState, type FormEvent } from "react";
import {
  DEFAULT_MAP_ICONS,
  MAP_ICON_CHOICES,
  MAP_THEMES,
  type MapPinIcons,
  type MapPinKind,
  type MapProvider,
  type MapSettings,
  type MapThemeId,
} from "@core/map-settings";

const KINDS: Array<{ kind: MapPinKind; label: string }> = [
  { kind: "job", label: "Jobs" },
  { kind: "internship", label: "Internships" },
  { kind: "school", label: "Schools" },
];

export function MapSettingsForm({ onSaved }: { onSaved?: () => void }) {
  const [provider, setProvider] = useState<MapProvider>("openstreetmap");
  const [apiKey, setApiKey] = useState("");
  const [theme, setTheme] = useState<MapThemeId>("kind");
  const [icons, setIcons] = useState<MapPinIcons>(DEFAULT_MAP_ICONS);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [lookupStatus, setLookupStatus] = useState<"ok" | "unavailable" | "unused" | "">("");

  useEffect(() => {
    void fetch("/api/maps")
      .then(async (response) => {
        const body = (await response.json()) as { settings?: MapSettings };
        if (!body.settings) return;
        setProvider(body.settings.provider);
        setApiKey(body.settings.googleMapsApiKey);
        setTheme(body.settings.theme);
        setIcons(body.settings.icons);
      })
      .catch(() => setError("Could not load map settings."));
    void refreshLookup(setLookupStatus);
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/maps", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider, googleMapsApiKey: apiKey, theme, icons }),
      });
      const body = (await response.json()) as { error?: string; settings?: MapSettings };
      if (!response.ok || !body.settings) {
        setError(body.error ?? "Could not save map settings.");
        return;
      }
      setProvider(body.settings.provider);
      setApiKey(body.settings.googleMapsApiKey);
      setTheme(body.settings.theme);
      setIcons(body.settings.icons);
      setMessage("Saved. Career History uses this map, theme, and pin marks.");
      onSaved?.();
      void refreshLookup(setLookupStatus);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>Maps</h1>
      <p className="onboarding-lead">
        OpenStreetMap is the default and needs no key. A Google key draws Career
        History on Google Maps and looks up addresses and locations. Enable the
        Maps JavaScript API and the Geocoding API for that key. The key stays in
        this vault and is not part of a published snapshot. Pin colors and marks
        stay with this map.
      </p>
      <form className="onboarding-form" onSubmit={(event) => void save(event)}>
        <label className="onboarding-field">
          <span>Provider</span>
          <select
            value={provider}
            onChange={(event) =>
              setProvider(event.target.value === "google" ? "google" : "openstreetmap")
            }
          >
            <option value="openstreetmap">OpenStreetMap</option>
            <option value="google">Google Maps</option>
          </select>
        </label>
        {provider === "google" ? (
          <label className="onboarding-field">
            <span>Google Maps API key</span>
            <input
              type="password"
              autoComplete="off"
              value={apiKey}
              placeholder="Maps JavaScript API key"
              onChange={(event) => setApiKey(event.target.value)}
            />
          </label>
        ) : null}
        <fieldset className="map-pin-settings">
          <legend>Theme</legend>
          <div className="map-theme-row">
            {(Object.values(MAP_THEMES)).map((item) => (
              <button
                aria-pressed={theme === item.id}
                className="map-theme"
                key={item.id}
                onClick={() => setTheme(item.id)}
                type="button"
              >
                <span
                  className="map-theme-swatch"
                  style={{ background: item.disc, boxShadow: `inset 0 0 0 2px ${item.ring}` }}
                >
                  {icons.job}
                </span>
                <span
                  className="map-theme-swatch"
                  style={{ background: item.disc, boxShadow: `inset 0 0 0 2px ${item.currentRing}` }}
                >
                  {icons.internship}
                </span>
                <span className="map-theme-swatch" style={{ background: item.disc }}>
                  {icons.school}
                </span>
                {item.label}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="map-pin-settings">
          <legend>Icons</legend>
          {KINDS.map(({ kind, label }) => (
            <div className="map-icon-row" key={kind}>
              <span>{label}</span>
              {MAP_ICON_CHOICES[kind].map((mark) => (
                <button
                  aria-label={`${label} ${mark}`}
                  aria-pressed={icons[kind] === mark}
                  className="map-icon-choice"
                  key={mark}
                  onClick={() => setIcons((current) => ({ ...current, [kind]: mark }))}
                  type="button"
                >
                  {mark}
                </button>
              ))}
              <input
                aria-label={`${label} icon`}
                maxLength={8}
                onChange={(event) =>
                  setIcons((current) => ({ ...current, [kind]: event.target.value }))
                }
                value={icons[kind]}
              />
            </div>
          ))}
        </fieldset>
        {error ? <p className="onboarding-error">{error}</p> : null}
        {message ? <p className="home-settings-note">{message}</p> : null}
        {lookupStatus === "unavailable" ? (
          <p className="home-settings-note">
            Google could not look up addresses. OpenStreetMap is looking them
            up until the Geocoding API is enabled. The map still uses Google.
          </p>
        ) : lookupStatus === "ok" ? (
          <p className="home-settings-note">Address lookup is using Google.</p>
        ) : null}
        <button className="onboarding-continue" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
      </form>
    </>
  );
}

function refreshLookup(
  setLookupStatus: (status: "ok" | "unavailable" | "unused" | "") => void,
) {
  return fetch("/api/maps/lookup-status")
    .then(async (response) => {
      const body = (await response.json()) as { googleLookup?: "ok" | "unavailable" | "unused" };
      setLookupStatus(body.googleLookup ?? "unused");
    })
    .catch(() => setLookupStatus(""));
}
