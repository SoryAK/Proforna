import { useState, type FormEvent } from "react";
import type { Residence } from "@core/residence";

type Draft = {
  id: string | null;
  label: string;
  address: string;
  startDate: string;
  endDate: string;
  latitude: number | null;
  longitude: number | null;
};

const EMPTY_DRAFT: Draft = {
  id: null,
  label: "",
  address: "",
  startDate: "",
  endDate: "",
  latitude: null,
  longitude: null,
};

export function HomesPanel({
  residences,
  activeId,
  onChanged,
}: {
  residences: Residence[];
  activeId: string | null;
  onChanged: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const openHome = residences.find((residence) => !residence.endDate) ?? null;

  function beginAdd() {
    setMessage("");
    setDraft(EMPTY_DRAFT);
  }

  function beginEdit(residence: Residence) {
    setMessage("");
    setDraft({
      id: residence.id,
      label: residence.label,
      address: residence.address,
      startDate: residence.startDate ?? "",
      endDate: residence.endDate ?? "",
      latitude: residence.latitude,
      longitude: residence.longitude,
    });
  }

  async function saveHome(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setBusy(true);
    setMessage("");
    const addressChanged =
      draft.id != null &&
      draft.address.trim() !==
        residences.find((residence) => residence.id === draft.id)?.address;
    const body = {
      label: draft.label,
      address: draft.address,
      startDate: draft.startDate,
      endDate: draft.endDate,
      ...(draft.id && !addressChanged
        ? { latitude: draft.latitude, longitude: draft.longitude }
        : {}),
    };
    try {
      const response = await fetch(
        draft.id ? `/api/residences/${draft.id}` : "/api/residences",
        {
          method: draft.id ? "PUT" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const saved = (await response.json()) as {
        error?: string;
        residence?: Residence;
      };
      if (!response.ok || !saved.residence) {
        setMessage(homeError(saved.error));
        return;
      }
      setDraft(null);
      setMessage(
        saved.residence.latitude == null
          ? "Saved. The map pin appears when that address can be placed."
          : "",
      );
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function removeHome(id: string) {
    setMessage("");
    const response = await fetch(`/api/residences/${id}`, { method: "DELETE" });
    if (!response.ok) {
      setMessage("Could not remove that home.");
      return;
    }
    if (draft?.id === id) setDraft(null);
    await onChanged();
  }

  const closesOpenHome =
    draft != null &&
    !draft.endDate &&
    openHome != null &&
    openHome.id !== draft.id;

  return (
    <section className="homes-block" aria-label="Homes">
      <header>
        <button type="button" onClick={() => (draft ? setDraft(null) : beginAdd())}>
          {draft ? "Close" : "Add a home"}
        </button>
      </header>
      <p className="homes-hint">
        Homes stay on this machine. A published resume does not include them.
      </p>
      {residences.length === 0 ? (
        <p className="homes-empty">Add the places you have lived.</p>
      ) : (
        <ul>
          {residences.map((residence) => (
            <li
              className={residence.id === activeId ? "is-active" : ""}
              key={residence.id}
            >
              <div>
                <strong>{residence.label}</strong>
                <span>{residence.address}</span>
                <small>{homeSpan(residence)}</small>
                {!residence.startDate ? (
                  <small>No start month, so this home covers every role.</small>
                ) : null}
                {residence.latitude == null ? (
                  <small>Not on the map yet.</small>
                ) : null}
              </div>
              <div className="homes-actions">
                <button type="button" onClick={() => beginEdit(residence)}>
                  Edit
                </button>
                <button type="button" onClick={() => void removeHome(residence.id)}>
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {draft ? (
        <form onSubmit={(event) => void saveHome(event)}>
          <label>
            Label
            <input
              required
              value={draft.label}
              onChange={(event) =>
                setDraft({ ...draft, label: event.target.value })
              }
              placeholder="Clifton apartment"
            />
          </label>
          <label>
            Address
            <input
              required
              value={draft.address}
              autoComplete="street-address"
              onChange={(event) =>
                setDraft({ ...draft, address: event.target.value })
              }
              placeholder="Street, city"
            />
          </label>
          <div className="homes-dates">
            <label>
              Start
              <input
                type="month"
                value={draft.startDate}
                onChange={(event) =>
                  setDraft({ ...draft, startDate: event.target.value })
                }
              />
            </label>
            <label>
              End
              <input
                type="month"
                value={draft.endDate}
                onChange={(event) =>
                  setDraft({ ...draft, endDate: event.target.value })
                }
              />
            </label>
          </div>
          <p className="homes-hint">
            {closesOpenHome
              ? `Leave the end blank only if you live here now. That closes ${openHome.label}.`
              : "Leave the end blank if you live here now. A past home needs an end month."}
          </p>
          <button className="is-primary" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save home"}
          </button>
        </form>
      ) : null}
      {message ? (
        <p className={message.startsWith("Saved") ? "homes-hint" : "homes-message"}>
          {message}
        </p>
      ) : null}
    </section>
  );
}

function homeSpan(residence: Residence): string {
  if (!residence.startDate && !residence.endDate) return "Now";
  if (!residence.endDate) return `${residence.startDate ?? "Start"} – Present`;
  return `${residence.startDate ?? "Start"} – ${residence.endDate}`;
}

function homeError(code: string | undefined): string {
  if (code === "dates-invalid") return "Check the start and end months.";
  if (code === "label-required") return "A label is required.";
  return "Could not save that home.";
}
