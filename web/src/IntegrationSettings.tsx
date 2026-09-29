import { useEffect, useState, type FormEvent } from "react";
import { GmailSettingsForm } from "./GmailSettings";

type IntegrationField = {
  key: string;
  label: string;
  secret: boolean;
  required: boolean;
};

type ListedIntegration = {
  name: string;
  displayName: string;
  description: string;
  available: boolean;
  fields: IntegrationField[];
  configured: boolean;
};

export function IntegrationSettings() {
  const [rows, setRows] = useState<ListedIntegration[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    const response = await fetch("/api/integration-catalog");
    if (!response.ok) {
      setError("Could not load integrations.");
      return;
    }
    const body = (await response.json()) as { integrations?: ListedIntegration[] };
    setRows(body.integrations ?? []);
  }

  function open(row: ListedIntegration) {
    setSelected(row.name);
    setValues({});
    setMessage("");
    setError("");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch(`/api/integration-catalog/${encodeURIComponent(selected)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ values }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(
          payload.error === "integration-incomplete"
            ? "Fill in every field, then save."
            : "This connection is not available yet.",
        );
        return;
      }
      setValues({});
      setMessage("Saved. Proforna can use this connection when you ask.");
      await load();
    } catch {
      setError("Could not save that connection.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!selected) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch(`/api/integration-catalog/${encodeURIComponent(selected)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        setError("Could not remove that connection.");
        return;
      }
      setValues({});
      setMessage("Removed.");
      await load();
    } catch {
      setError("Could not remove that connection.");
    } finally {
      setBusy(false);
    }
  }

  const current = rows?.find((row) => row.name === selected) ?? null;

  return (
    <>
      <h1>Integrations</h1>
      <p className="onboarding-lead">
        Connect an account here. Proforna can use it when you ask. It does not file mail into Opportunities on its own.
      </p>
      {current ? (
        <div className="integration-detail">
          <button type="button" className="integration-back" onClick={() => setSelected(null)}>
            All integrations
          </button>
          {current.name === "gmail" ? (
            <GmailSettingsForm />
          ) : (
            <>
              <h2>{current.displayName}</h2>
              <p className="onboarding-lead">{current.description}</p>
              {current.available ? (
                <form onSubmit={(event) => void save(event)}>
                  {current.fields.map((field) => (
                    <label className="onboarding-field" key={field.key}>
                      <span>{field.label}</span>
                      <input
                        type={field.secret ? "password" : "text"}
                        value={values[field.key] ?? ""}
                        autoComplete="off"
                        onChange={(event) =>
                          setValues((currentValues) => ({
                            ...currentValues,
                            [field.key]: event.target.value,
                          }))
                        }
                      />
                    </label>
                  ))}
                  {current.configured ? (
                    <p className="home-settings-note">Saved. Enter the values again to change them.</p>
                  ) : null}
                  <div className="integration-actions">
                    <button type="submit" disabled={busy}>
                      {current.configured ? "Save changes" : "Save"}
                    </button>
                    {current.configured ? (
                      <button type="button" disabled={busy} onClick={() => void remove()}>
                        Remove
                      </button>
                    ) : null}
                  </div>
                </form>
              ) : (
                <p className="home-settings-note" role="status">
                  This connection is not available yet.
                </p>
              )}
            </>
          )}
        </div>
      ) : (
        <ul className="integration-list">
          {(rows ?? []).map((row) => (
            <li key={row.name}>
              <button type="button" onClick={() => open(row)}>
                <span>{row.displayName}</span>
                <span className="integration-state">
                  {row.configured
                    ? row.name === "gmail"
                      ? "Connected"
                      : "Saved"
                    : row.available
                      ? "Not connected"
                      : "Unavailable"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {message ? <p className="home-settings-note">{message}</p> : null}
      {error ? (
        <p className="home-settings-note" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
