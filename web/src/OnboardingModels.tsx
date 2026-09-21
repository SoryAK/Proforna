import { useEffect, useState } from "react";
import {
  DEFAULT_LOCAL_BASE_URL,
  isHttpUrl,
  OPENAI_BASE_URL,
  type ModelHosting,
} from "@core/model-connection";
import {
  planModelOnboarding,
  presentModelId,
  suggestChatModel,
  type LocalProbeResult,
  type ModelOnboardingProvider,
  type ModelOnboardingSurface,
  type ModelProviderId,
} from "@core/model-onboarding";

type ModelSave = {
  hosting: ModelHosting;
  baseUrl: string;
  model: string;
  apiKey: string;
};

export function OnboardingModelStep({
  kicker,
  busy,
  error,
  onBack,
  onSkip,
  onSave,
}: {
  kicker: string;
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onSkip: () => void;
  onSave: (input: ModelSave) => void;
}) {
  const [checking, setChecking] = useState(true);
  const [surface, setSurface] = useState<ModelOnboardingSurface | null>(null);

  async function probe() {
    setChecking(true);
    try {
      const res = await fetch("/api/models/probe");
      const body = (await res.json().catch(() => ({}))) as {
        locals?: LocalProbeResult[];
      };
      setSurface(
        planModelOnboarding({
          locals: res.ok && Array.isArray(body.locals) ? body.locals : [],
        }),
      );
    } catch {
      setSurface(planModelOnboarding({ locals: [] }));
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    void probe();
  }, []);

  if (checking || !surface) {
    return (
      <>
        <p className="onboarding-kicker">{kicker}</p>
        <h1>
          Checking this <em>machine…</em>
        </h1>
        <p className="onboarding-lead">
          Looking for Ollama and llama.cpp on this machine. You can skip this
          and add a model later.
        </p>
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
        </div>
      </>
    );
  }

  if (surface.kind === "detected") {
    return (
      <DetectedModels
        kicker={kicker}
        surface={surface}
        busy={busy}
        error={error}
        onBack={onBack}
        onSkip={onSkip}
        onSave={onSave}
        onCheckAgain={() => void probe()}
      />
    );
  }

  return (
    <CatalogModels
      kicker={kicker}
      surface={surface}
      busy={busy}
      error={error}
      onBack={onBack}
      onSkip={onSkip}
      onSave={onSave}
      onCheckAgain={() => void probe()}
    />
  );
}

function DetectedModels({
  kicker,
  surface,
  busy,
  error,
  onBack,
  onSkip,
  onSave,
  onCheckAgain,
}: {
  kicker: string;
  surface: Extract<ModelOnboardingSurface, { kind: "detected" }>;
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onSkip: () => void;
  onSave: (input: ModelSave) => void;
  onCheckAgain: () => void;
}) {
  const [model, setModel] = useState(surface.suggested);

  return (
    <>
      <p className="onboarding-kicker">{kicker}</p>
      <h1>
        {surface.label} is <em>already</em> here.
      </h1>
      <p className="onboarding-lead">
        Optional. Use this local model, another server on this machine, or a
        cloud key. Skip if you only want to store a file.
      </p>
      <div className="onboarding-model-hero">
        <span className="onboarding-model-status">Ready on this machine</span>
        <p>Pick the local model. You can change it in Settings.</p>
        <ModelChips models={surface.models} value={model} onPick={setModel} />
      </div>
      <ProviderRows
        providers={surface.providers}
        busy={busy}
        onSave={onSave}
        onCheckAgain={onCheckAgain}
      />
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
          type="button"
          className="onboarding-btn onboarding-btn-solid"
          disabled={busy || !model.trim()}
          onClick={() =>
            onSave({
              hosting: "local",
              baseUrl: surface.baseUrl,
              model,
              apiKey: "",
            })
          }
        >
          Continue
        </button>
      </div>
    </>
  );
}

function CatalogModels({
  kicker,
  surface,
  busy,
  error,
  onBack,
  onSkip,
  onSave,
  onCheckAgain,
}: {
  kicker: string;
  surface: Extract<ModelOnboardingSurface, { kind: "catalog" }>;
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onSkip: () => void;
  onSave: (input: ModelSave) => void;
  onCheckAgain: () => void;
}) {
  return (
    <>
      <p className="onboarding-kicker">{kicker}</p>
      <h1>
        What can <em>run</em> here?
      </h1>
      <p className="onboarding-lead">
        Optional. Named connections, live status. Skip without picking
        one.
      </p>
      <ProviderRows
        providers={surface.providers}
        busy={busy}
        onSave={onSave}
        onCheckAgain={onCheckAgain}
      />
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
      </div>
    </>
  );
}

function ProviderRows({
  providers,
  busy,
  onSave,
  onCheckAgain,
}: {
  providers: ModelOnboardingProvider[];
  busy: boolean;
  onSave: (input: ModelSave) => void;
  onCheckAgain: () => void;
}) {
  const [open, setOpen] = useState<ModelProviderId | null>(null);

  return (
    <div className="onboarding-model-rows">
      {providers.map((provider) => {
        const expanded = open === provider.id;
        const recheck =
          provider.status === "missing" || provider.status === "empty";
        return (
          <div
            key={provider.id}
            className="onboarding-model-row"
            data-open={expanded}
          >
            <div>
              <strong>{provider.label}</strong>
              <p>{provider.detail}</p>
            </div>
            <button
              className="onboarding-model-row-action"
              type="button"
              disabled={busy}
              onClick={() => {
                if (recheck) {
                  onCheckAgain();
                  return;
                }
                setOpen(expanded ? null : provider.id);
              }}
            >
              {rowActionLabel(provider, expanded)}
            </button>
            {expanded && !recheck ? (
              <div className="onboarding-model-expand">
                {provider.status === "ready" ? (
                  <ReadyLocalForm
                    provider={provider}
                    busy={busy}
                    onSave={onSave}
                  />
                ) : provider.hosting === "cloud" ? (
                  <>
                    <p className="onboarding-note" role="note">
                      Cloud providers receive what you send. Prompts and
                      resume text may leave this machine under that
                      provider&apos;s terms. Prefer a local model if the
                      career file should stay here.
                    </p>
                    <CloudKeyForm
                      busy={busy}
                      baseUrl={provider.baseUrl}
                      onSave={onSave}
                    />
                  </>
                ) : (
                  <OtherEndpointForm busy={busy} onSave={onSave} />
                )}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function rowActionLabel(
  provider: ModelOnboardingProvider,
  expanded: boolean,
): string {
  if (provider.status === "missing" || provider.status === "empty") {
    return "Check again";
  }
  if (provider.status === "ready") return expanded ? "Close" : "Use";
  if (provider.status === "needs-key") return expanded ? "Close" : "Add key";
  return expanded ? "Close" : "Configure";
}

function ReadyLocalForm({
  provider,
  busy,
  onSave,
}: {
  provider: ModelOnboardingProvider;
  busy: boolean;
  onSave: (input: ModelSave) => void;
}) {
  const models = provider.models ?? [];
  const [model, setModel] = useState(suggestChatModel(models));

  return (
    <div className="onboarding-model-form">
      <ModelChips models={models} value={model} onPick={setModel} />
      <button
        type="button"
        className="onboarding-btn onboarding-btn-solid"
        disabled={busy || !model.trim()}
        onClick={() =>
          onSave({
            hosting: "local",
            baseUrl: provider.baseUrl,
            model,
            apiKey: "",
          })
        }
      >
        Use this model
      </button>
    </div>
  );
}

function CloudKeyForm({
  busy,
  baseUrl = OPENAI_BASE_URL,
  onSave,
}: {
  busy: boolean;
  baseUrl?: string;
  onSave: (input: ModelSave) => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [models, setModels] = useState<string[]>([]);

  useEffect(() => {
    if (!apiKey.trim()) {
      setModels([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void fetch("/api/models/discover", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ baseUrl, apiKey: apiKey.trim() }),
      })
        .then(async (res) => {
          const body = (await res.json()) as { models?: string[] };
          if (cancelled || !res.ok) return;
          setModels(body.models ?? []);
        })
        .catch(() => {
          if (!cancelled) setModels([]);
        });
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [apiKey, baseUrl]);

  return (
    <div className="onboarding-model-form">
      <label className="onboarding-field">
        <span>API key</span>
        <input
          type="password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          autoComplete="off"
          placeholder="sk-…"
        />
      </label>
      {models.length > 0 ? (
        <ModelChips models={models} value={model} onPick={setModel} />
      ) : (
        <label className="onboarding-field">
          <span>Model</span>
          <input
            value={model}
            onChange={(event) => setModel(event.target.value)}
            autoComplete="off"
            placeholder="Optional model id"
          />
        </label>
      )}
      <button
        type="button"
        className="onboarding-btn onboarding-btn-solid"
        disabled={busy || !apiKey.trim()}
        onClick={() =>
          onSave({
            hosting: "cloud",
            baseUrl,
            model,
            apiKey,
          })
        }
      >
        Save key
      </button>
    </div>
  );
}

function OtherEndpointForm({
  busy,
  onSave,
}: {
  busy: boolean;
  onSave: (input: ModelSave) => void;
}) {
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");

  return (
    <div className="onboarding-model-form">
      <label className="onboarding-field">
        <span>Base URL</span>
        <input
          value={baseUrl}
          onChange={(event) => setBaseUrl(event.target.value)}
          autoComplete="off"
          placeholder="http://127.0.0.1:8080/v1"
        />
      </label>
      <label className="onboarding-field">
        <span>Model</span>
        <input
          value={model}
          onChange={(event) => setModel(event.target.value)}
          autoComplete="off"
          placeholder="Optional model id"
        />
      </label>
      <label className="onboarding-field">
        <span>API key</span>
        <input
          type="password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          autoComplete="off"
          placeholder="Only if the host requires one"
        />
      </label>
      <button
        type="button"
        className="onboarding-btn onboarding-btn-solid"
        disabled={busy || !isHttpUrl(baseUrl.trim())}
        onClick={() =>
          onSave({
            hosting: apiKey.trim() ? "cloud" : "local",
            baseUrl,
            model,
            apiKey,
          })
        }
      >
        Save endpoint
      </button>
    </div>
  );
}

function ModelChips({
  models,
  value,
  onPick,
}: {
  models: string[];
  value: string;
  onPick: (model: string) => void;
}) {
  return (
    <div className="onboarding-model-chips">
      {models.map((id) => (
        <button
          key={id}
          className="onboarding-model-chip"
          data-active={value === id}
          title={id}
          type="button"
          onClick={() => onPick(id)}
        >
          {presentModelId(id)}
        </button>
      ))}
    </div>
  );
}

export function OnboardingModelSetup({
  kicker,
  busy,
  error,
  onBack,
  onSkip,
  onSave,
  submitLabel = "Continue",
  hideIntro = false,
  initial,
}: {
  kicker: string;
  busy: boolean;
  error: string | null;
  onBack?: () => void;
  onSkip?: () => void;
  onSave: (input: {
    hosting: ModelHosting;
    baseUrl: string;
    model: string;
    apiKey: string;
  }) => void;
  submitLabel?: string;
  hideIntro?: boolean;
  initial?: {
    hosting: ModelHosting;
    baseUrl: string;
    model: string;
  };
}) {
  const [hosting, setHosting] = useState<ModelHosting>(
    initial?.hosting ?? "local",
  );
  const [baseUrl, setBaseUrl] = useState(
    initial?.baseUrl ?? DEFAULT_LOCAL_BASE_URL,
  );
  const [model, setModel] = useState(initial?.model ?? "");
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [listState, setListState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [listError, setListError] = useState<string | null>(null);
  const [manual, setManual] = useState(false);

  const cloudDefault = OPENAI_BASE_URL;

  function pickHosting(next: ModelHosting) {
    setHosting(next);
    if (next === "local" && (baseUrl === cloudDefault || !baseUrl.trim())) {
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
          const body = (await res.json()) as {
            models?: string[];
            error?: string;
          };
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
      {hideIntro ? null : (
        <>
          <p className="onboarding-kicker">{kicker}</p>
          <h1>
            Where does it <em>run?</em>
          </h1>
          <p className="onboarding-lead">
            Local stays on this machine. Cloud needs a key from a provider.
          </p>
        </>
      )}
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
        {onBack ? (
          <button
            type="button"
            className="onboarding-btn onboarding-btn-ghost"
            onClick={onBack}
            disabled={busy}
          >
            Back
          </button>
        ) : null}
        {onSkip ? (
          <button
            type="button"
            className="onboarding-btn onboarding-btn-ghost"
            onClick={onSkip}
            disabled={busy}
          >
            Skip
          </button>
        ) : null}
        <button
          type="submit"
          className="onboarding-btn onboarding-btn-solid"
          disabled={busy}
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
