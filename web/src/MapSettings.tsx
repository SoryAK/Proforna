import { useEffect, useState, type FormEvent } from "react";
import type { MapProvider, MapSettings } from "@core/map-settings";

export function MapSettingsForm({ onSaved }: { onSaved?: () => void }) {
  const [provider, setProvider] = useState<MapProvider>("openstreetmap");
  const [apiKey, setApiKey] = useState("");
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
        body: JSON.stringify({ provider, googleMapsApiKey: apiKey }),
      });
      const body = (await response.json()) as { error?: string; settings?: MapSettings };
      if (!response.ok || !body.settings) {
        setError(body.error ?? "Could not save map settings.");
        return;
      }
      setProvider(body.settings.provider);
      setApiKey(body.settings.googleMapsApiKey);
      setMessage(
        body.settings.provider === "google"
          ? "Saved. Career History will use Google Maps."
          : "Saved. Career History will use OpenStreetMap.",
      );
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
        this vault and is not part of a published snapshot.
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
