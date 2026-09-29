import { useEffect, useState, type FormEvent } from "react";

type GmailAccount = {
  connected: boolean;
  email: string | null;
  oauthClient: boolean;
  missing: string[];
  redirectUri: string;
};

export function IntegrationsSettings() {
  const [account, setAccount] = useState<GmailAccount | null>(null);
  const [askText, setAskText] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState<"connect" | "ask" | "remove" | null>(null);
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
    setBusy("connect");
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/gmail/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const payload = (await response.json()) as {
        authorizeUrl?: string;
        error?: string;
        missing?: string[];
      };
      if (!response.ok || !payload.authorizeUrl) {
        const missing = payload.missing?.length
          ? payload.missing.join(" and ")
          : "GMAIL_OAUTH_CLIENT_ID and GMAIL_OAUTH_CLIENT_SECRET";
        setError(
          payload.error === "oauth-client-missing"
            ? `Gmail needs ${missing}. Add them, then connect Gmail here.`
            : "Gmail could not be connected.",
        );
        return;
      }
      window.open(payload.authorizeUrl, "_blank", "noopener");
      const connected = await waitForGmail();
      if (!connected) {
        setError("Gmail could not be connected. Finish the Google consent, then try again.");
        return;
      }
      setAccount(connected);
      setMessage(`Connected ${connected.email}. Ask Proforna when you want it to read that mailbox.`);
    } catch {
      setError("Gmail could not be connected.");
    } finally {
      setBusy(null);
    }
  }

  async function ask(event: FormEvent) {
    event.preventDefault();
    setBusy("ask");
    setError("");
    setMessage("");
    setAnswer("");
    try {
      const response = await fetch("/api/gmail/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: askText }),
      });
      const payload = (await response.json()) as { answer?: string };
      if (!response.ok || !payload.answer) {
        setError("Proforna could not use Gmail for that ask.");
        return;
      }
      setAnswer(payload.answer);
    } catch {
      setError("Proforna could not use Gmail for that ask.");
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    setBusy("remove");
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/gmail", { method: "DELETE" });
      if (!response.ok) {
        setError("Could not disconnect Gmail.");
        return;
      }
      setAccount((await response.json()) as GmailAccount);
      setAnswer("");
      setMessage("Gmail is disconnected.");
    } finally {
      setBusy(null);
    }
  }

  const missing = account?.missing ?? [];

  return (
    <>
      <h1>Integrations</h1>
      <p className="onboarding-lead">
        One Gmail connection. Configure it here. Proforna uses it when you ask.
        It does not search a window of mail, and it does not file messages into
        Opportunities, applications, interviews, offers, or contacts.
      </p>
      <form className="onboarding-form" onSubmit={(event) => void connect(event)}>
        <fieldset className="map-pin-settings">
          <legend>Gmail</legend>
          <p className="onboarding-lead">
            {account?.connected
              ? account.email
              : "Not connected. Connect the mailbox Proforna should use when you ask."}
          </p>
          {account && !account.oauthClient ? (
            <p className="home-settings-note" role="status">
              Gmail needs {missing.join(" and ")}. Add them, then connect Gmail here.
            </p>
          ) : null}
          {account?.oauthClient ? (
            <p className="home-settings-note">
              The OAuth client redirect is {account.redirectUri}.
            </p>
          ) : null}
          <div className="map-theme-row">
            <button type="submit" disabled={busy !== null || !account}>
              {busy === "connect" ? "Connecting" : account?.connected ? "Reconnect" : "Connect"}
            </button>
            {account?.connected ? (
              <button type="button" disabled={busy !== null} onClick={() => void disconnect()}>
                Disconnect
              </button>
            ) : null}
          </div>
        </fieldset>
      </form>
      <form className="onboarding-form" onSubmit={(event) => void ask(event)}>
        <fieldset className="map-pin-settings">
          <legend>Ask</legend>
          <p className="onboarding-lead">
            Ask Proforna to read this mailbox. That question is the only time it looks.
          </p>
          <label className="onboarding-field">
            <span>What should Proforna look for?</span>
            <input
              value={askText}
              onChange={(event) => setAskText(event.target.value)}
              placeholder="The Northstar offer"
            />
          </label>
          <button type="submit" disabled={busy !== null}>
            {busy === "ask" ? "Asking" : "Ask"}
          </button>
          {answer ? (
            <p className="home-settings-note integration-ask-answer" role="status">
              {answer}
            </p>
          ) : null}
        </fieldset>
      </form>
      {message ? <p className="home-settings-note">{message}</p> : null}
      {error ? (
        <p className="home-settings-note" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}

async function waitForGmail(): Promise<GmailAccount | null> {
  const started = Date.now();
  while (Date.now() - started < 120_000) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const response = await fetch("/api/gmail");
    if (!response.ok) continue;
    const account = (await response.json()) as GmailAccount;
    if (account.connected && account.email) return account;
  }
  return null;
}
