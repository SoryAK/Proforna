import { useEffect, useState, type FormEvent } from "react";

type GmailAccount = { connected: false } | { connected: true; email: string };

type GmailThread = { id: string; snippet: string };

export function GmailSettingsForm() {
  const [account, setAccount] = useState<GmailAccount | null>(null);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [query, setQuery] = useState("");
  const [threads, setThreads] = useState<GmailThread[]>([]);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    const response = await fetch("/api/gmail");
    if (!response.ok) return;
    setAccount((await response.json()) as GmailAccount);
  }

  async function connect(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/gmail/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId, clientSecret }),
      });
      const payload = (await response.json()) as { authorizeUrl?: string; error?: string };
      if (!response.ok || !payload.authorizeUrl) {
        setError(
          payload.error === "client-required"
            ? "Gmail needs a client id and a client secret."
            : "Gmail could not be connected.",
        );
        return;
      }
      window.open(payload.authorizeUrl, "_blank", "noopener");
      const connected = await waitForGmail();
      if (!connected) {
        setError("Gmail could not be connected. Finish the Google sign-in, then try again.");
        return;
      }
      setAccount(connected);
      setClientSecret("");
      setMessage(`Connected ${connected.email}. Search reads that mailbox, and a draft stays in Gmail until you send it.`);
    } catch {
      setError("Gmail could not be connected.");
    } finally {
      setBusy(false);
    }
  }

  async function search(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/gmail/messages?q=${encodeURIComponent(query)}`);
      const payload = (await response.json()) as { threads?: GmailThread[]; error?: string };
      if (!response.ok) {
        setError(payload.error === "gmail-not-connected" ? "Gmail is not connected." : "Could not read Gmail.");
        return;
      }
      setThreads(payload.threads ?? []);
      setMessage(payload.threads?.length ? "" : "No mail matched that search.");
    } catch {
      setError("Could not read Gmail.");
    } finally {
      setBusy(false);
    }
  }

  async function draft(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/gmail/drafts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to, subject, body }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(
          payload.error === "draft-required"
            ? "A draft needs a recipient, a subject, and a message."
            : "Could not save that draft.",
        );
        return;
      }
      setTo("");
      setSubject("");
      setBody("");
      setMessage("Draft saved in Gmail. It is not sent.");
    } catch {
      setError("Could not save that draft.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/gmail", { method: "DELETE" });
      if (!response.ok) {
        setError("Could not disconnect Gmail.");
        return;
      }
      setAccount({ connected: false });
      setThreads([]);
      setMessage("Gmail is disconnected.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>Gmail</h1>
      <p className="onboarding-lead">
        Sign in to the Gmail account you want Proforna to read. Search finds mail, and a draft is saved in Gmail. Proforna does not send it.
      </p>
      {account?.connected ? (
        <>
          <p>
            {account.email}
          </p>
          <form onSubmit={(event) => void search(event)}>
            <label className="onboarding-field">
              <span>Search</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="from:recruiter offer"
              />
            </label>
            <button type="submit" disabled={busy}>
              Search
            </button>
          </form>
          <ul>
            {threads.map((thread) => (
              <li key={thread.id}>{thread.snippet}</li>
            ))}
          </ul>
          <form onSubmit={(event) => void draft(event)}>
            <label className="onboarding-field">
              <span>To</span>
              <input value={to} onChange={(event) => setTo(event.target.value)} />
            </label>
            <label className="onboarding-field">
              <span>Subject</span>
              <input value={subject} onChange={(event) => setSubject(event.target.value)} />
            </label>
            <label className="onboarding-field">
              <span>Message</span>
              <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={4} />
            </label>
            <button type="submit" disabled={busy}>
              Save draft
            </button>
          </form>
          <button type="button" disabled={busy} onClick={() => void disconnect()}>
            Disconnect
          </button>
        </>
      ) : (
        <form onSubmit={(event) => void connect(event)}>
          <p className="onboarding-lead">
            In Google Cloud, create a desktop OAuth client and add http://127.0.0.1:42813/oauth2callback as a redirect. Paste that client here, then sign in.
          </p>
          <label className="onboarding-field">
            <span>Client id</span>
            <input value={clientId} onChange={(event) => setClientId(event.target.value)} autoComplete="off" />
          </label>
          <label className="onboarding-field">
            <span>Client secret</span>
            <input
              type="password"
              value={clientSecret}
              onChange={(event) => setClientSecret(event.target.value)}
              autoComplete="off"
            />
          </label>
          <button type="submit" disabled={busy}>
            {busy ? "Waiting for Google" : "Connect"}
          </button>
        </form>
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

async function waitForGmail(): Promise<{ connected: true; email: string } | null> {
  const started = Date.now();
  while (Date.now() - started < 120_000) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const response = await fetch("/api/gmail");
    if (!response.ok) continue;
    const account = (await response.json()) as GmailAccount;
    if (account.connected) return account;
  }
  return null;
}
