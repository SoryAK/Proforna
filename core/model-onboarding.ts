import {
  DEFAULT_LOCAL_BASE_URL,
  LLAMA_CPP_BASE_URL,
  OPENAI_BASE_URL,
  OPENROUTER_BASE_URL,
  type ModelHosting,
} from "./model-connection";

export type LocalModelId = "ollama" | "llamacpp";
export type ModelProviderId = LocalModelId | "openai" | "openrouter" | "other";

export type LocalOnboardingEndpoint = {
  id: LocalModelId;
  label: string;
  baseUrl: string;
};

export const LOCAL_ONBOARDING_ENDPOINTS: LocalOnboardingEndpoint[] = [
  { id: "ollama", label: "Ollama", baseUrl: DEFAULT_LOCAL_BASE_URL },
  { id: "llamacpp", label: "llama.cpp", baseUrl: LLAMA_CPP_BASE_URL },
];

export type LocalProbeResult = {
  id: LocalModelId;
  reachable: boolean;
  models: string[];
};

export type ModelOnboardingProvider = {
  id: ModelProviderId;
  label: string;
  hosting: ModelHosting;
  baseUrl: string;
  status: "missing" | "empty" | "ready" | "needs-key" | "configure";
  detail: string;
  models?: string[];
};

export type ModelOnboardingSurface =
  | {
      kind: "detected";
      providerId: LocalModelId;
      label: string;
      baseUrl: string;
      models: string[];
      suggested: string;
      providers: ModelOnboardingProvider[];
    }
  | {
      kind: "catalog";
      providers: ModelOnboardingProvider[];
    };

export function suggestChatModel(models: string[]): string {
  return models.find((id) => !/embed/i.test(id)) ?? models[0] ?? "";
}

export function presentModelId(id: string): string {
  const base = id.split(/[/\\]/).pop()?.trim() ?? "";
  return base || id;
}

export function planModelOnboarding(input: {
  locals: LocalProbeResult[];
}): ModelOnboardingSurface {
  const locals = LOCAL_ONBOARDING_ENDPOINTS.map((endpoint) => {
    const probe = input.locals.find((row) => row.id === endpoint.id);
    return {
      endpoint,
      reachable: Boolean(probe?.reachable),
      models: Array.isArray(probe?.models) ? probe.models : [],
    };
  });
  const detected = locals.find((row) => row.models.length > 0);
  const rest = locals
    .filter((row) => row.endpoint.id !== detected?.endpoint.id)
    .map((row) => localProvider(row));

  if (detected) {
    return {
      kind: "detected",
      providerId: detected.endpoint.id,
      label: detected.endpoint.label,
      baseUrl: detected.endpoint.baseUrl,
      models: detected.models,
      suggested: suggestChatModel(detected.models),
      providers: [...rest, ...cloudAndOtherProviders()],
    };
  }

  return {
    kind: "catalog",
    providers: [...rest, ...cloudAndOtherProviders()],
  };
}

function localProvider(row: {
  endpoint: LocalOnboardingEndpoint;
  reachable: boolean;
  models: string[];
}): ModelOnboardingProvider {
  if (row.models.length > 0) {
    return {
      id: row.endpoint.id,
      label: row.endpoint.label,
      hosting: "local",
      baseUrl: row.endpoint.baseUrl,
      status: "ready",
      detail: `${presentModelId(suggestChatModel(row.models))} on this machine.`,
      models: row.models,
    };
  }
  return {
    id: row.endpoint.id,
    label: row.endpoint.label,
    hosting: "local",
    baseUrl: row.endpoint.baseUrl,
    status: row.reachable ? "empty" : "missing",
    detail: row.reachable
      ? "Running, but it listed no models."
      : "Not running on this machine.",
  };
}

function cloudAndOtherProviders(): ModelOnboardingProvider[] {
  return [
    {
      id: "openai",
      label: "OpenAI",
      hosting: "cloud",
      baseUrl: OPENAI_BASE_URL,
      status: "needs-key",
      detail: "Add a key. Resume text would leave this machine.",
    },
    {
      id: "openrouter",
      label: "OpenRouter",
      hosting: "cloud",
      baseUrl: OPENROUTER_BASE_URL,
      status: "needs-key",
      detail: "Add a key. Resume text would leave this machine.",
    },
    {
      id: "other",
      label: "Other endpoint",
      hosting: "local",
      baseUrl: "",
      status: "configure",
      detail: "OpenAI-compatible URL on this machine or a host you trust.",
    },
  ];
}
