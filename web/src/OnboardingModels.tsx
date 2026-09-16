import { useEffect, useState } from "react";
import {
  DEFAULT_LOCAL_BASE_URL,
  isHttpUrl,
  type ModelHosting,
} from "@core/model-connection";

export function OnboardingModelOffer({
  busy,
  onBack,
  onYes,
  onNo,
}: {
  busy: boolean;
  onBack: () => void;
  onYes: () => void;
  onNo: () => void;
}) {
  return (
    <>
      <p className="onboarding-kicker">Step 03 — Models</p>
      <h1>
        Connect a <em>model?</em>
      </h1>
      <p className="onboarding-lead">
        Optional. A local or cloud model can later extract jobs and schools from
        a resume. Skip if you only want to store a file.
      </p>
      <div className="onboarding-choices">
        <button
          type="button"
          className="onboarding-choice"
          disabled={busy}
          onClick={onYes}
        >
          <strong>Yes — set one up</strong>
          <span>
            Local Ollama or a cloud API. You can skip the details on the next
            screen.
          </span>
        </button>
        <button
          type="button"
          className="onboarding-choice"
          disabled={busy}
          onClick={onNo}
        >
          <strong>No — continue without one</strong>
          <span>Go on to the resume step. You can add a model later.</span>
        </button>
      </div>
      <div className="onboarding-actions">
        <button
          type="button"
          className="onboarding-btn onboarding-btn-ghost"
          onClick={onBack}
          disabled={busy}
        >
          Back
        </button>
      </div>
    </>
  );
}

export function OnboardingModelSetup({
  busy,
  error,
  onBack,
  onSkip,
  onSave,
}: {
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onSkip: () => void;
  onSave: (input: {
    hosting: ModelHosting;
    baseUrl: string;
    model: string;
    apiKey: string;
  }) => void;
}) {
  const [hosting, setHosting] = useState<ModelHosting>("local");
  const [baseUrl, setBaseUrl] = useState(DEFAULT_LOCAL_BASE_URL);
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [listState, setListState] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  const [listError, setListError] = useState<string | null>(null);
  const [manual, setManual] = useState(false);

  const cloudDefault = "https://api.openai.com/v1";

  function pickHosting(next: ModelHosting) {
    setHosting(next);
    if (
      next === "local" &&
      (baseUrl === cloudDefault || !baseUrl.trim())
    ) {
      setBaseUrl(DEFAULT_LOCAL_BASE_URL);
    }
    if (
      next === "cloud" &&
      (baseUrl === DEFAULT_LOCAL_BASE_URL || !baseUrl.trim())
    ) {
      setBaseUrl(cloudDefault);
    }
  }

  useEffect(() => {
    if (!isHttpUrl(baseUrl)) {
      setModels([]);
      setListState("idle");
      setListError(null);
      return;
    }
    if (hosting === "cloud" && !apiKey.trim()) {
      setModels([]);
      setListState("idle");
      setListError(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setListState("loading");
      setListError(null);
      void fetch("/api/models/discover", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          baseUrl,
          apiKey: apiKey.trim() || undefined,
        }),
      })
        .then(async (res) => {
          const body = (await res.json()) as { models?: string[]; error?: string };
          if (cancelled) return;
          if (!res.ok) {
            setModels([]);
            setListState("error");
            setListError(body.error ?? "Could not list models.");
            return;
          }
          const next = body.models ?? [];
          setModels(next);
          setListState("ready");
          setManual(next.length === 0);
        })
        .catch(() => {
          if (cancelled) return;
          setModels([]);
          setListState("error");
          setListError("Could not reach that endpoint.");
        });
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [baseUrl, apiKey, hosting]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ hosting, baseUrl, model, apiKey });
      }}
    >
      <p className="onboarding-kicker">Step 03 — Models</p>
      <h1>
        Where does it <em>run?</em>
      </h1>
      <p className="onboarding-lead">
        Local stays on this machine. Cloud needs a key from a provider.
      </p>
      <div className="onboarding-choices">
        <button
          type="button"
          className="onboarding-choice"
          data-active={hosting === "local"}
          onClick={() => pickHosting("local")}
        >
          <strong>Local</strong>
          <span>Ollama or another OpenAI-compatible server on localhost.</span>
        </button>
        <button
          type="button"
          className="onboarding-choice"
          data-active={hosting === "cloud"}
          onClick={() => pickHosting("cloud")}
        >
          <strong>Cloud</strong>
          <span>OpenAI, OpenRouter, or another hosted API.</span>
        </button>
      </div>
      {hosting === "cloud" ? (
        <p className="onboarding-note" role="note">
          Cloud providers receive what you send. Prompts and resume text may
          leave this machine under that provider&apos;s terms. Prefer Local if
          the data should stay here.
        </p>
      ) : null}
      <label className="onboarding-field">
        <span>Base URL</span>
        <input
          name="baseUrl"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          autoComplete="off"
          required
        />
      </label>
      <label className="onboarding-field">
        <span className="onboarding-field-head">
          Model
          {listState === "ready" && models.length > 0 ? (
            <button
              type="button"
              className="onboarding-field-toggle"
              onClick={() => setManual((value) => !value)}
            >
              {manual ? "Pick from list" : "Type a name"}
            </button>
          ) : null}
        </span>
        {listState === "ready" && models.length > 0 && !manual ? (
          <select
            name="model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          >
            <option value="">
              Select a model ({models.length} available)
            </option>
            {models.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        ) : (
          <input
            name="model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={
              listState === "loading"
                ? "Loading models…"
                : "Model id from the endpoint"
            }
            autoComplete="off"
          />
        )}
        {listState === "loading" ? (
          <em className="onboarding-field-hint">Asking the endpoint for models…</em>
        ) : null}
        {listState === "error" && listError ? (
          <em className="onboarding-field-hint">{listError}</em>
        ) : null}
        {listState === "ready" && models.length === 0 ? (
          <em className="onboarding-field-hint">
            No models listed. Type an id if this server needs one.
          </em>
        ) : null}
      </label>
      {hosting === "cloud" ? (
        <label className="onboarding-field">
          <span>API key</span>
          <input
            name="apiKey"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            autoComplete="off"
            required
          />
        </label>
      ) : null}
      {error ? (
        <p className="onboarding-alert" role="alert">
          {error}
        </p>
      ) : null}
      <div className="onboarding-actions">
        <button
          type="button"
          className="onboarding-btn onboarding-btn-ghost"
          onClick={onBack}
          disabled={busy}
        >
          Back
        </button>
        <button
          type="button"
          className="onboarding-btn onboarding-btn-ghost"
          onClick={onSkip}
          disabled={busy}
        >
          Skip
        </button>
        <button
          type="submit"
          className="onboarding-btn onboarding-btn-solid"
          disabled={busy}
        >
          Save model
        </button>
      </div>
    </form>
  );
}
