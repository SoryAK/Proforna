import { useEffect, useMemo, useState, type FormEvent } from "react";
import { GmailSettingsForm } from "./GmailSettings";
import "./home.css";

type IntegrationField = {
  key: string;
  label: string;
  secret: boolean;
  required: boolean;
  setupUrl: string | null;
};

type ListedIntegration = {
  name: string;
  displayName: string;
  description: string;
  available: boolean;
  fields: IntegrationField[];
  configured: boolean;
  enabled: boolean;
  signIn: boolean;
};

export function IntegrationSettings({ nested = false }: { nested?: boolean }) {
  const [rows, setRows] = useState<ListedIntegration[] | null>(null);
  const [query, setQuery] = useState("");
  const [openName, setOpenName] = useState<string | null>(null);
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

  function toggleOpen(row: ListedIntegration) {
    setOpenName((current) => (current === row.name ? null : row.name));
    setValues({});
    setMessage("");
    setError("");
  }

  function connectRow(row: ListedIntegration) {
    if (row.signIn) {
      void startSignIn(row);
      return;
    }
    const url = setupHref(row);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    setOpenName(row.name);
    if (openName !== row.name) {
      setValues({});
      setMessage("");
      setError("");
    }
  }

  async function startSignIn(row: ListedIntegration) {
    const popup = openSignInWindow();
    if (!popup) {
      setError("The sign-in window was blocked. Allow popups for Proforna, then try Connect again.");
      return;
    }
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch(`/api/sign-in/${encodeURIComponent(row.name)}`, { method: "POST" });
      const payload = (await response.json()) as { connectLink?: string; error?: string };
      if (!response.ok || !payload.connectLink) {
        popup.close();
        setError(signInError(row.displayName, payload.error));
        return;
      }
      popup.location.href = payload.connectLink;
      const connected = await waitForSignIn(row.name);
      if (!connected) {
        setError(`Finish signing in in the ${row.displayName} window, then try Connect again.`);
        return;
      }
      popup.close();
      setMessage(`${row.displayName} is connected. Proforna can use it when you ask.`);
      await load();
    } catch {
      popup.close();
      setError(`${row.displayName} could not be connected.`);
    } finally {
      setBusy(false);
    }
  }

  async function save(event: FormEvent, name: string) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch(`/api/integration-catalog/${encodeURIComponent(name)}`, {
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

  async function remove(name: string) {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch(`/api/integration-catalog/${encodeURIComponent(name)}`, {
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

  async function setEnabled(row: ListedIntegration, enabled: boolean) {
    setBusy(true);
    setMessage("");
    setError("");
    const path =
      row.name === "gmail"
        ? "/api/gmail"
        : `/api/integration-catalog/${encodeURIComponent(row.name)}`;
    try {
      const response = await fetch(path, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!response.ok) {
        setError(enabled ? "Could not turn that connection on." : "Could not turn that connection off.");
        return;
      }
      setMessage(
        enabled
          ? `${row.displayName} is on. Proforna can use it when you ask.`
          : `${row.displayName} is off. The saved sign-in stays until you remove it.`,
      );
      await load();
    } catch {
      setError(enabled ? "Could not turn that connection on." : "Could not turn that connection off.");
    } finally {
      setBusy(false);
    }
  }

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (rows ?? [])
      .filter((row) => {
        if (!row.available || !row.signIn) return false;
        if (!needle) return true;
        return (
          row.displayName.toLowerCase().includes(needle) ||
          row.description.toLowerCase().includes(needle)
        );
      })
      .slice()
      .sort((a, b) => {
        const rank = integrationRank(a) - integrationRank(b);
        if (rank !== 0) return rank;
        if (a.name === "gmail") return -1;
        if (b.name === "gmail") return 1;
        return a.displayName.localeCompare(b.displayName);
      });
  }, [query, rows]);

  return (
    <>
      {nested ? null : (
        <>
          <h1>Integrations</h1>
          <p className="onboarding-lead">
            Turn a connection on when you want Proforna to use it. It does not file mail into Opportunities on its own.
          </p>
        </>
      )}
      <label className="onboarding-field">
        <span>Search</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Name or what it does"
        />
      </label>
      {rows && visible.length === 0 ? (
        <p className="home-settings-note">
          {query.trim() ? "No integration matches that search." : "No connections are ready yet."}
        </p>
      ) : (
        <ul className={nested ? "integration-list integration-list-scroll" : "integration-list"}>
          {visible.map((row) => {
            const open = openName === row.name;
            return (
              <li key={row.name} className="integration-row">
                <div className="integration-row-main">
                  <button
                    type="button"
                    className="integration-open"
                    aria-expanded={open}
                    onClick={() => toggleOpen(row)}
                  >
                    <span className="integration-name">{row.displayName}</span>
                    <span className="integration-summary">{row.description}</span>
                  </button>
                  {row.configured ? (
                    <>
                      <span className="integration-state">{integrationStatus(row)}</span>
                      <button
                        type="button"
                        className="integration-switch"
                        role="switch"
                        aria-checked={row.enabled}
                        aria-label={`${row.displayName} ${row.enabled ? "on" : "off"}`}
                        disabled={busy}
                        onClick={() => void setEnabled(row, !row.enabled)}
                      />
                    </>
                  ) : (
                    <button
                      type="button"
                      className="integration-connect"
                      disabled={busy}
                      onClick={() => connectRow(row)}
                    >
                      Connect
                    </button>
                  )}
                </div>
                {open ? (
                  <div className="integration-panel">
                    {row.name === "gmail" ? (
                      <GmailSettingsForm
                        nested
                        signIn={row.signIn}
                        listedEnabled={row.enabled}
                        onAccountChange={() => void load()}
                      />
                    ) : row.signIn ? (
                      <div>
                        <p className="home-settings-note">
                          Connect opens a sign-in window. You allow access once. Proforna does not ask for a client id.
                        </p>
                        {row.configured ? (
                          <div className="integration-actions">
                            <button type="button" disabled={busy} onClick={() => void remove(row.name)}>
                              Remove
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <form onSubmit={(event) => void save(event, row.name)}>
                        {setupHref(row) ? (
                          <p className="home-settings-note">
                            <a
                              className="integration-setup"
                              href={setupHref(row) ?? undefined}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {setupLead(row)}
                            </a>
                            , then paste it here.
                          </p>
                        ) : null}
                        {row.fields.map((field) => (
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
                        {row.configured ? (
                          <p className="home-settings-note">Saved. Enter the values again to change them.</p>
                        ) : null}
                        <div className="integration-actions">
                          <button type="submit" disabled={busy}>
                            {row.configured ? "Save changes" : "Connect"}
                          </button>
                          {row.configured ? (
                            <button type="button" disabled={busy} onClick={() => void remove(row.name)}>
                              Remove
                            </button>
                          ) : null}
                        </div>
                      </form>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
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

function integrationRank(row: ListedIntegration): number {
  if (row.configured && row.enabled) return 0;
  if (row.configured) return 1;
  if (row.available) return 2;
  return 3;
}

function integrationStatus(row: ListedIntegration): string {
  if (!row.configured) return "Not connected";
  return row.enabled ? "On" : "Off";
}

function setupHref(row: ListedIntegration): string | null {
  const href = row.fields.find((field) => field.setupUrl)?.setupUrl ?? null;
  if (!href) return null;
  try {
    const url = new URL(href);
    if (url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function signInError(displayName: string, code: string | undefined): string {
  if (code === "sign-in-unavailable") return `${displayName} is not ready to sign in yet.`;
  return `${displayName} could not be connected.`;
}

function openSignInWindow(): Window | null {
  const width = 520;
  const height = 720;
  const left = window.screenX + Math.max(0, (window.outerWidth - width) / 2);
  const top = window.screenY + Math.max(0, (window.outerHeight - height) / 2);
  return window.open(
    "about:blank",
    "proforna-sign-in",
    `popup=yes,width=${width},height=${height},left=${Math.round(left)},top=${Math.round(top)}`,
  );
}

async function waitForSignIn(name: string): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < 120_000) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const response = await fetch(`/api/sign-in/${encodeURIComponent(name)}/ready`, { method: "POST" });
    if (!response.ok) continue;
    const body = (await response.json()) as { connected?: boolean };
    if (body.connected) return true;
  }
  return false;
}

function setupLead(row: ListedIntegration): string {
  const href = setupHref(row);
  if (!href) return `Open ${row.displayName}`;
  const host = new URL(href).hostname;
  if (host === "github.com") return "Create a token on GitHub";
  if (host === "www.linkedin.com" || host === "linkedin.com") return "Create an app on LinkedIn";
  return `Open ${row.displayName}`;
}
