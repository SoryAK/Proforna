import { useEffect, useState, type FormEvent } from "react";

type MailboxView = {
  id: string;
  provider: string;
  label: string;
  accountEmail: string;
  status: "pending" | "connected" | "error";
  lastError: string;
};

type MailboxState = {
  oauthConfigured: boolean;
  providers: string[];
  mailbox: MailboxView | null;
};

export function JobMail({ onRecorded }: { onRecorded: () => Promise<void> }) {
  const [state, setState] = useState<MailboxState | null>(null);
  const [provider, setProvider] = useState("gmail");
  const [label, setLabel] = useState("Gmail");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const query = window.location.hash.split("?")[1] ?? "";
    const notice = new URLSearchParams(query).get("mailbox");
    if (notice === "connected") setNote("Gmail is connected.");
    if (notice === "error") setError("Gmail could not be connected.");
    if (notice) {
      const path = window.location.hash.replace(/^#\/?/, "").split("?")[0];
      const next = path ? `#/${path}` : "";
      if (window.location.hash !== next) window.location.hash = next;
    }
    void load();
  }, []);

  async function load() {
    const response = await fetch("/api/mailbox");
    if (!response.ok) {
      setError("Could not load job mail.");
      return;
    }
    const body = (await response.json()) as MailboxState;
    setState(body);
    if (body.mailbox) {
      setProvider(body.mailbox.provider);
      setLabel(body.mailbox.label);
    }
  }

  async function connect(event?: FormEvent) {
    event?.preventDefault();
    setBusy(true);
    setError("");
    setNote("");
    const response = await fetch("/api/mailbox", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider, label }),
    });
    const body = (await response.json()) as {
      authorizationUrl?: string;
      error?: string;
      message?: string;
    };
    setBusy(false);
    if (!response.ok || !body.authorizationUrl) {
      setError(
        body.message ||
          (body.error === "mailbox-exists"
            ? "Remove the connected account before connecting another."
            : "Could not start the Gmail connection."),
      );
      await load();
      return;
    }
    window.location.assign(body.authorizationUrl);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const response = await fetch("/api/mailbox", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider, label }),
    });
    const body = (await response.json()) as { message?: string };
    setBusy(false);
    setNote(response.ok ? "Connection updated." : "");
    setError(response.ok ? "" : body.message || "Could not update that connection.");
    await load();
  }

  async function remove() {
    setBusy(true);
    setError("");
    const response = await fetch("/api/mailbox", { method: "DELETE" });
    setBusy(false);
    if (!response.ok) {
      setError("Could not remove that connection.");
      return;
    }
    setLabel("Gmail");
    setProvider("gmail");
    setNote("Gmail removed. Recorded opportunities stay until you remove them.");
    await load();
  }

  async function scan() {
    setBusy(true);
    setError("");
    setNote("");
    const response = await fetch("/api/mailbox/scan", { method: "POST" });
    const body = (await response.json()) as {
      kept?: number;
      alreadyKept?: number;
      message?: string;
    };
    setBusy(false);
    if (!response.ok) {
      setError(body.message || "Could not read Gmail.");
      await load();
      return;
    }
    const kept = body.kept ?? 0;
    const alreadyKept = body.alreadyKept ?? 0;
    if (kept === 0 && alreadyKept === 0) {
      setNote("No job-related mail in this pass.");
    } else {
      const parts = [];
      if (kept > 0) parts.push(`Recorded ${kept} in Opportunities.`);
      if (alreadyKept > 0) parts.push(`Left ${alreadyKept} already recorded.`);
      setNote(parts.join(" "));
    }
    window.dispatchEvent(new Event("proforna:notices-changed"));
    await onRecorded();
    await load();
  }

  const mailbox = state?.mailbox ?? null;
  const providers = state?.providers?.length ? state.providers : ["gmail"];

  return (
    <section className="job-mail compact-career-form">
      <h2>Job mail</h2>
      <p>
        Connect Gmail to read applications, interviews, recruiter outreach, and
        offers into Opportunities. Proforna only requests read access.
      </p>
      {state && !state.oauthConfigured ? (
        <p className="job-mail-error">
          Gmail needs an OAuth client on this machine. Set GMAIL_OAUTH_CLIENT_ID
          and GMAIL_OAUTH_CLIENT_SECRET, then connect.
        </p>
      ) : null}
      {!mailbox ? (
        <form onSubmit={(event) => void connect(event)}>
          <label>
            Provider
            <select
              value={provider}
              onChange={(event) => setProvider(event.target.value)}
            >
              {providers.map((item) => (
                <option key={item} value={item}>
                  {item === "gmail" ? "Gmail" : item}
                </option>
              ))}
            </select>
          </label>
          <input
            required
            aria-label="Connection label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Connection label"
          />
          <button disabled={busy} type="submit">
            {busy ? "Connecting…" : "Connect Gmail"}
          </button>
        </form>
      ) : (
        <form onSubmit={(event) => void save(event)}>
          <p>
            {mailbox.accountEmail
              ? mailbox.accountEmail
              : "Waiting for Gmail to finish connecting."}
            {mailbox.status === "connected" ? "" : ` · ${mailbox.status}`}
          </p>
          {mailbox.lastError ? <p className="job-mail-error">{mailbox.lastError}</p> : null}
          <label>
            Provider
            <select
              value={provider}
              onChange={(event) => setProvider(event.target.value)}
            >
              {providers.map((item) => (
                <option key={item} value={item}>
                  {item === "gmail" ? "Gmail" : item}
                </option>
              ))}
            </select>
          </label>
          <input
            required
            aria-label="Connection label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Connection label"
          />
          <div className="opportunity-actions">
            <button disabled={busy} type="submit">
              Save connection
            </button>
            <button
              disabled={busy || mailbox.status !== "connected"}
              type="button"
              onClick={() => void scan()}
            >
              {busy ? "Working…" : "Scan job mail"}
            </button>
            {mailbox.status !== "connected" ? (
              <button disabled={busy} type="button" onClick={() => void connect()}>
                Connect Gmail
              </button>
            ) : null}
            <button
              className="is-danger"
              disabled={busy}
              type="button"
              onClick={() => void remove()}
            >
              Remove
            </button>
          </div>
        </form>
      )}
      {error ? <p className="job-mail-error">{error}</p> : null}
      {note ? <p className="career-message">{note}</p> : null}
    </section>
  );
}
