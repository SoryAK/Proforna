import {
  Children,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
  type SVGProps,
} from "react";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Divider } from "@astryxdesign/core/Divider";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@astryxdesign/core/SegmentedControl";
import { Selector } from "@astryxdesign/core/Selector";
import { Switch } from "@astryxdesign/core/Switch";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import {
  BriefcaseIcon,
  BuildingOffice2Icon,
  CalendarDaysIcon,
  CameraIcon,
  CloudIcon,
  CodeBracketIcon,
  CpuChipIcon,
  DocumentTextIcon,
  EnvelopeIcon,
  EyeIcon,
  GlobeAltIcon,
  KeyIcon,
  LinkIcon,
  LockClosedIcon,
  MapIcon,
  MapPinIcon,
  PencilSquareIcon,
  PhotoIcon,
  PlusIcon,
  ServerIcon,
  SwatchIcon,
  UserIcon,
} from "@heroicons/react/24/outline";
import {
  DEFAULT_LOCAL_BASE_URL,
  isHttpUrl,
  OPENAI_BASE_URL,
  type ModelHosting,
} from "@core/model-connection";
import {
  DEFAULT_MAP_ICONS,
  MAP_ICON_CHOICES,
  MAP_THEMES,
  type MapPinIcons,
  type MapPinKind,
  type MapProvider,
  type MapSettings,
  type MapThemeId,
} from "@core/map-settings";
import { prepareProfile } from "@core/profile";
import {
  JUDGMENT_SECTIONS,
  type CompanySiteSource,
  type JobListingSource,
  type JobSourceSettings,
  type JudgmentSection,
} from "@core/job-sources";
import {
  publicationEmbed,
  type WorkMapPublicationSettings,
  type WorkMapPublishSection,
} from "@core/work-map";
import type { OnboardingProfileValue } from "./OnboardingProfile";
import { readPreviewPlacement, writePreviewPlacement, type PreviewPlacement } from "./preview-placement";
import "./home-settings-rows.css";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

const CONTROL_WIDTH = 192;
const ROW_PADDING = 4;

const PIN_KINDS: Array<{ kind: MapPinKind; label: string; icon: IconComponent }> = [
  { kind: "job", label: "Jobs", icon: BriefcaseIcon },
  { kind: "internship", label: "Internships", icon: BuildingOffice2Icon },
  { kind: "school", label: "Schools", icon: MapPinIcon },
];

const JUDGMENT_COPY: Record<JudgmentSection, { label: string; detail: string }> = {
  profile: { label: "Profile", detail: "Name, headline, and bio" },
  history: { label: "Career history", detail: "Roles, schools, and what you did" },
  skills: { label: "Skills", detail: "Skills on the career record" },
  worklog: { label: "Worklog", detail: "Work you have captured since" },
  residence: { label: "Home", detail: "Where you live now" },
};

function SettingsCard({ title, children }: { title?: string; children: ReactNode }) {
  const rows = Children.toArray(children);
  return (
    <VStack gap={1.5}>
      {title != null ? (
        <Text type="supporting" weight="semibold" color="secondary">
          {title}
        </Text>
      ) : null}
      <Card padding={0} width="100%" variant="muted">
        <VStack as="ul" role="list" gap={0}>
          {rows.map((row, index) => (
            <VStack key={index} as="li" gap={0}>
              {index > 0 ? <Divider variant="subtle" /> : null}
              {row}
            </VStack>
          ))}
        </VStack>
      </Card>
    </VStack>
  );
}

function SettingsRow({
  title,
  description,
  icon,
  control,
  detail,
}: {
  title: string;
  description?: ReactNode;
  icon: IconComponent;
  control?: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <VStack padding={ROW_PADDING} gap={2}>
      <HStack className="home-settings-line" gap={3} align="center">
        <HStack className="home-settings-main" gap={2} align="start">
          <VStack paddingBlockStart={0.5}>
            <Icon icon={icon} size="sm" color="secondary" />
          </VStack>
          <VStack gap={0.5} className="home-settings-text">
            <Text type="label">{title}</Text>
            {description != null ? (
              <Text type="supporting" color="secondary">
                {description}
              </Text>
            ) : null}
          </VStack>
        </HStack>
        {control != null ? (
          <VStack className="home-settings-control">{control}</VStack>
        ) : null}
      </HStack>
      {detail}
    </VStack>
  );
}

function SettingsStatus({ message, error }: { message?: string | null; error?: string | null }) {
  if (!message && !error) return null;
  return (
    <VStack gap={1}>
      {error ? (
        <Text type="supporting" color="secondary" role="alert">
          {error}
        </Text>
      ) : null}
      {message ? (
        <Text type="supporting" color="secondary">
          {message}
        </Text>
      ) : null}
    </VStack>
  );
}

function field(label: string, value: string, onChange: (value: string) => void, extra?: {
  type?: "text" | "password" | "url";
  placeholder?: string;
}) {
  return (
    <TextInput
      label={label}
      isLabelHidden
      size="sm"
      width={CONTROL_WIDTH}
      type={extra?.type}
      placeholder={extra?.placeholder}
      value={value}
      onChange={onChange}
    />
  );
}

export function ProfileSettingsPanel({
  profile,
  onSaved,
  onCancel,
}: {
  profile: OnboardingProfileValue;
  onSaved: (profile: OnboardingProfileValue) => void;
  onCancel: () => void;
}) {
  const file = useRef<HTMLInputElement>(null);
  const [fullName, setFullName] = useState(profile.fullName);
  const [headline, setHeadline] = useState(profile.headline);
  const [address, setAddress] = useState(profile.address);
  const [city, setCity] = useState(profile.city);
  const [state, setState] = useState(profile.state);
  const [bio, setBio] = useState(profile.bio);
  const [linkedinUrl, setLinkedinUrl] = useState(profile.linkedinUrl);
  const [githubUrl, setGithubUrl] = useState(profile.githubUrl);
  const [portfolioUrl, setPortfolioUrl] = useState(profile.portfolioUrl);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(profile.avatarUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!photo) return;
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  async function save() {
    const fields = {
      fullName,
      headline,
      address,
      city,
      state,
      bio,
      linkedinUrl,
      githubUrl,
      portfolioUrl,
    };
    const prepared = prepareProfile(fields);
    if (!prepared.ok) {
      setError(
        prepared.error === "url-invalid"
          ? "Use an http(s) URL for LinkedIn, GitHub, or portfolio."
          : "A name is required.",
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(prepared.value),
      });
      const body = (await res.json()) as {
        error?: string;
        profile?: OnboardingProfileValue;
      };
      if (!res.ok || !body.profile) {
        setError(body.error ?? "Could not save your profile.");
        return;
      }
      let next = body.profile;
      if (photo) {
        const form = new FormData();
        form.append("avatar", photo);
        const uploaded = await fetch("/api/profile/avatar", { method: "POST", body: form });
        const failed = (await uploaded.json()) as {
          error?: string;
          profile?: OnboardingProfileValue;
        };
        if (!uploaded.ok || !failed.profile) {
          setError(failed.error ?? "Could not save the photo.");
          return;
        }
        next = failed.profile;
      }
      onSaved(next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <VStack gap={5}>
      <SettingsCard title="Identity">
        <SettingsRow
          title="Photo"
          icon={CameraIcon}
          description="Shown on your profile."
          control={
            <Button
              label={preview ? "Change" : "Add"}
              variant="secondary"
              size="sm"
              onClick={() => file.current?.click()}
            />
          }
          detail={
            preview ? (
              <img
                src={preview}
                alt="Profile photo"
                width={48}
                height={48}
                style={{ width: 48, height: 48, borderRadius: 999, objectFit: "cover" }}
              />
            ) : null
          }
        />
        <input
          ref={file}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          hidden
          onChange={(event) => setPhoto(event.target.files?.[0] ?? null)}
        />
        <SettingsRow
          title="Name"
          icon={UserIcon}
          description="The name on the profile."
          control={field("Name", fullName, setFullName)}
        />
        <SettingsRow
          title="Headline"
          icon={BriefcaseIcon}
          description="The line under the name."
          control={field("Headline", headline, setHeadline, {
            placeholder: "e.g. Senior Software Engineer",
          })}
        />
        <SettingsRow
          title="Bio"
          icon={PencilSquareIcon}
          description="A short bio."
          control={
            <TextArea
              label="Bio"
              isLabelHidden
              size="sm"
              width={CONTROL_WIDTH}
              value={bio}
              onChange={setBio}
            />
          }
        />
      </SettingsCard>
      <SettingsCard title="Address">
        <SettingsRow
          title="Street"
          icon={MapPinIcon}
          description="Street address."
          control={field("Street", address, setAddress, { placeholder: "Street address" })}
        />
        <SettingsRow
          title="City"
          icon={MapPinIcon}
          control={field("City", city, setCity)}
        />
        <SettingsRow
          title="State"
          icon={MapPinIcon}
          control={field("State", state, setState)}
        />
      </SettingsCard>
      <SettingsCard title="Social">
        <SettingsRow
          title="LinkedIn"
          icon={LinkIcon}
          description="Shown on your bio."
          control={field("LinkedIn", linkedinUrl, setLinkedinUrl, {
            type: "url",
            placeholder: "https://www.linkedin.com/in/…",
          })}
        />
        <SettingsRow
          title="GitHub"
          icon={CodeBracketIcon}
          description="Shown on your bio."
          control={field("GitHub", githubUrl, setGithubUrl, {
            type: "url",
            placeholder: "https://github.com/…",
          })}
        />
        <SettingsRow
          title="Portfolio"
          icon={GlobeAltIcon}
          description="The site on your bio."
          control={field("Portfolio", portfolioUrl, setPortfolioUrl, {
            type: "url",
            placeholder: "https://",
          })}
        />
      </SettingsCard>
      <SettingsStatus error={error} />
      <HStack gap={2}>
        <Button label="Cancel" variant="secondary" size="sm" isDisabled={busy} onClick={onCancel} />
        <Button
          label={busy ? "Saving…" : "Save"}
          variant="primary"
          size="sm"
          isDisabled={busy}
          onClick={() => void save()}
        />
      </HStack>
    </VStack>
  );
}

export function ModelSettingsPanel({
  connection,
  busy,
  error,
  note,
  onSave,
}: {
  connection: { hosting: ModelHosting; baseUrl: string; model: string } | null;
  busy: boolean;
  error: string | null;
  note: string | null;
  onSave: (input: {
    hosting: ModelHosting;
    baseUrl: string;
    model: string;
    apiKey: string;
  }) => void;
}) {
  const [hosting, setHosting] = useState<ModelHosting>(connection?.hosting ?? "local");
  const [baseUrl, setBaseUrl] = useState(connection?.baseUrl ?? DEFAULT_LOCAL_BASE_URL);
  const [model, setModel] = useState(connection?.model ?? "");
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [listState, setListState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [listError, setListError] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  function pickHosting(next: ModelHosting) {
    setHosting(next);
    if (next === "local" && (baseUrl === OPENAI_BASE_URL || !baseUrl.trim())) {
      setBaseUrl(DEFAULT_LOCAL_BASE_URL);
    }
    if (next === "cloud" && (baseUrl === DEFAULT_LOCAL_BASE_URL || !baseUrl.trim())) {
      setBaseUrl(OPENAI_BASE_URL);
    }
  }

  useEffect(() => {
    if (!isHttpUrl(baseUrl) || (hosting === "cloud" && !apiKey.trim())) {
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
        body: JSON.stringify({ baseUrl, apiKey: apiKey.trim() || undefined }),
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

  const modelDescription =
    listState === "loading"
      ? "Asking the endpoint for models…"
      : listState === "error" && listError
        ? listError
        : listState === "ready" && models.length === 0
          ? "No models listed. Type an id if this server needs one."
          : "The model id from the endpoint.";

  function save() {
    if (!baseUrl.trim()) {
      setLocalError("A base URL is required.");
      return;
    }
    if (hosting === "cloud" && !apiKey.trim()) {
      setLocalError("A cloud connection needs an API key.");
      return;
    }
    setLocalError(null);
    onSave({ hosting, baseUrl, model, apiKey });
  }

  return (
    <VStack gap={5}>
      <SettingsCard title="Connection">
        <SettingsRow
          title="Hosting"
          icon={hosting === "cloud" ? CloudIcon : ServerIcon}
          description={
            hosting === "cloud"
              ? "Cloud providers receive what you send. Prompts and resume text may leave this machine. Prefer Local if the data should stay here."
              : "Ollama or another OpenAI-compatible server on localhost."
          }
          control={
            <SegmentedControl label="Hosting" size="sm" value={hosting} onChange={(value) => pickHosting(value === "cloud" ? "cloud" : "local")}>
              <SegmentedControlItem value="local" label="Local" />
              <SegmentedControlItem value="cloud" label="Cloud" />
            </SegmentedControl>
          }
        />
        <SettingsRow
          title="Base URL"
          icon={LinkIcon}
          description="The OpenAI-compatible URL used to extract a resume."
          control={field("Base URL", baseUrl, setBaseUrl)}
        />
        <SettingsRow
          title="Model"
          icon={CpuChipIcon}
          description={modelDescription}
          control={
            <VStack gap={1}>
              {listState === "ready" && models.length > 0 ? (
                <Button
                  label={manual ? "Pick from list" : "Type a name"}
                  variant="ghost"
                  size="sm"
                  onClick={() => setManual((value) => !value)}
                />
              ) : null}
              {listState === "ready" && models.length > 0 && !manual ? (
                <Selector
                  label="Model"
                  isLabelHidden
                  size="sm"
                  width={CONTROL_WIDTH}
                  value={model}
                  placeholder={`Select a model (${models.length} available)`}
                  onChange={(value) => setModel(typeof value === "string" ? value : "")}
                  options={models.map((id) => ({ value: id, label: id }))}
                />
              ) : (
                field("Model", model, setModel, { placeholder: "Model id from the endpoint" })
              )}
            </VStack>
          }
        />
        {hosting === "cloud" ? (
          <SettingsRow
            title="API key"
            icon={KeyIcon}
            description="Stays in this vault."
            control={field("API key", apiKey, setApiKey, { type: "password" })}
          />
        ) : null}
      </SettingsCard>
      <SettingsStatus error={localError ?? error} message={note} />
      <HStack>
        <Button
          label={busy ? "Saving…" : "Save"}
          variant="primary"
          size="sm"
          isDisabled={busy}
          onClick={save}
        />
      </HStack>
    </VStack>
  );
}

export function MapSettingsPanel({ onSaved }: { onSaved?: () => void }) {
  const [provider, setProvider] = useState<MapProvider>("openstreetmap");
  const [apiKey, setApiKey] = useState("");
  const [theme, setTheme] = useState<MapThemeId>("kind");
  const [icons, setIcons] = useState<MapPinIcons>(DEFAULT_MAP_ICONS);
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
        setTheme(body.settings.theme);
        setIcons(body.settings.icons);
      })
      .catch(() => setError("Could not load map settings."));
    void refreshLookup(setLookupStatus);
  }, []);

  async function save() {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/maps", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider, googleMapsApiKey: apiKey, theme, icons }),
      });
      const body = (await response.json()) as { error?: string; settings?: MapSettings };
      if (!response.ok || !body.settings) {
        setError(body.error ?? "Could not save map settings.");
        return;
      }
      setProvider(body.settings.provider);
      setApiKey(body.settings.googleMapsApiKey);
      setTheme(body.settings.theme);
      setIcons(body.settings.icons);
      setMessage("Saved. Career History uses this map, theme, and pin marks.");
      onSaved?.();
      void refreshLookup(setLookupStatus);
    } finally {
      setBusy(false);
    }
  }

  const lookup =
    lookupStatus === "unavailable"
      ? "Google could not look up addresses. OpenStreetMap is looking them up until the Geocoding API is enabled. The map still uses Google."
      : lookupStatus === "ok"
        ? "Address lookup is using Google."
        : "OpenStreetMap is the default and needs no key. A Google key draws Career History on Google Maps.";

  return (
    <VStack gap={5}>
      <SettingsCard title="Provider">
        <SettingsRow
          title="Map"
          icon={MapIcon}
          description={lookup}
          control={
            <SegmentedControl
              label="Map provider"
              size="sm"
              value={provider}
              onChange={(value) => setProvider(value === "google" ? "google" : "openstreetmap")}
            >
              <SegmentedControlItem value="openstreetmap" label="OpenStreetMap" />
              <SegmentedControlItem value="google" label="Google" />
            </SegmentedControl>
          }
        />
        {provider === "google" ? (
          <SettingsRow
            title="API key"
            icon={KeyIcon}
            description="Enable the Maps JavaScript API and the Geocoding API. The key stays in this vault."
            control={field("Google Maps API key", apiKey, setApiKey, {
              type: "password",
              placeholder: "Maps JavaScript API key",
            })}
          />
        ) : null}
      </SettingsCard>
      <SettingsCard title="Pins">
        <SettingsRow
          title="Theme"
          icon={SwatchIcon}
          description="Pin colors stay with this map."
          control={
            <SegmentedControl label="Theme" size="sm" value={theme} onChange={(value) => setTheme(value === "gold" ? "gold" : "kind")}>
              <SegmentedControlItem value="kind" label={MAP_THEMES.kind.label} />
              <SegmentedControlItem value="gold" label={MAP_THEMES.gold.label} />
            </SegmentedControl>
          }
        />
        {PIN_KINDS.map(({ kind, label, icon }) => {
          const choices = MAP_ICON_CHOICES[kind];
          const current = icons[kind];
          const options = choices.includes(current) ? [...choices] : [current, ...choices];
          return (
            <SettingsRow
              key={kind}
              title={label}
              icon={icon}
              description="The mark drawn on this kind of pin."
              control={
                <VStack gap={1}>
                  <Selector
                    label={label}
                    isLabelHidden
                    size="sm"
                    width={CONTROL_WIDTH}
                    value={current}
                    onChange={(value) => {
                      if (typeof value !== "string") return;
                      setIcons((iconsNow) => ({ ...iconsNow, [kind]: value }));
                    }}
                    options={options.map((mark) => ({ value: mark, label: mark }))}
                  />
                  {field(`${label} icon`, current, (value) =>
                    setIcons((iconsNow) => ({ ...iconsNow, [kind]: value.slice(0, 8) })),
                  )}
                </VStack>
              }
            />
          );
        })}
      </SettingsCard>
      <SettingsStatus message={message} error={error} />
      <HStack>
        <Button
          label={busy ? "Saving…" : "Save"}
          variant="primary"
          size="sm"
          isDisabled={busy}
          onClick={() => void save()}
        />
      </HStack>
    </VStack>
  );
}

function pageUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export function JobSettingsPanel() {
  const [settings, setSettings] = useState<JobSourceSettings | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [applicationId, setApplicationId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [editName, setEditName] = useState("");
  const [editApplicationId, setEditApplicationId] = useState("");
  const [editApiKey, setEditApiKey] = useState("");
  const [editEnabled, setEditEnabled] = useState(true);
  const [addingSite, setAddingSite] = useState(false);
  const [editingSiteId, setEditingSiteId] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [editLabel, setEditLabel] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editSiteEnabled, setEditSiteEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch("/api/job-sources")
      .then(async (response) => {
        const body = (await response.json()) as { settings?: JobSourceSettings };
        if (body.settings) setSettings(body.settings);
      })
      .catch(() => setError("Could not load job sources."));
  }, []);

  function sourceBeingAdded(): JobListingSource | null {
    const sourceName = name.trim();
    if (!adding || !sourceName) return null;
    return {
      id: crypto.randomUUID(),
      name: sourceName,
      applicationId: applicationId.trim(),
      apiKey: apiKey.trim(),
      enabled: true,
    };
  }

  function sourceBeingEdited(): JobListingSource | null {
    if (!settings || !editingId) return null;
    const current = settings.sources.find((source) => source.id === editingId);
    const sourceName = editName.trim();
    if (!current || !sourceName) return null;
    return {
      ...current,
      name: sourceName,
      applicationId: editApplicationId.trim(),
      apiKey: editApiKey.trim(),
      enabled: editEnabled,
    };
  }

  function siteBeingAdded(): CompanySiteSource | null {
    const siteLabel = label.trim();
    const siteUrl = url.trim();
    if (!addingSite || !siteLabel || !pageUrl(siteUrl)) return null;
    return { id: crypto.randomUUID(), label: siteLabel, url: siteUrl, enabled: true };
  }

  function siteBeingEdited(): CompanySiteSource | null {
    if (!settings || !editingSiteId) return null;
    const current = settings.sites.find((site) => site.id === editingSiteId);
    const siteLabel = editLabel.trim();
    const siteUrl = editUrl.trim();
    if (!current || !siteLabel || !pageUrl(siteUrl)) return null;
    return { ...current, label: siteLabel, url: siteUrl, enabled: editSiteEnabled };
  }

  function settingsToStore(): JobSourceSettings | null {
    if (!settings) return null;
    const added = sourceBeingAdded();
    const edited = sourceBeingEdited();
    let sources = settings.sources;
    if (edited) sources = sources.map((source) => (source.id === edited.id ? edited : source));
    if (added) sources = [...sources, added];
    const addedSite = siteBeingAdded();
    const editedSite = siteBeingEdited();
    let sites = settings.sites;
    if (editedSite) sites = sites.map((site) => (site.id === editedSite.id ? editedSite : site));
    if (addedSite) sites = [...sites, addedSite];
    return { ...settings, sources, sites };
  }

  async function store(next: JobSourceSettings): Promise<boolean> {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/job-sources", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(next),
      });
      const body = (await response.json()) as { error?: string; settings?: JobSourceSettings };
      if (!response.ok || !body.settings) {
        setError(
          body.error === "site-url-invalid"
            ? "A company page needs an https address."
            : body.error === "source-invalid"
              ? "A job source needs a name."
              : "Could not save job sources.",
        );
        return false;
      }
      setSettings(body.settings);
      setMessage(
        "Saved. Search uses these sources, and a fit judgment reads only the checked parts of your career record.",
      );
      return true;
    } catch {
      setError("Could not save job sources.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function clearSourceDraft() {
    setName("");
    setApplicationId("");
    setApiKey("");
    setAdding(false);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditApplicationId("");
    setEditApiKey("");
    setEditEnabled(true);
    setError("");
  }

  function cancelAddSite() {
    setAddingSite(false);
    setLabel("");
    setUrl("");
    setError("");
  }

  function cancelEditSite() {
    setEditingSiteId(null);
    setEditLabel("");
    setEditUrl("");
    setEditSiteEnabled(true);
    setError("");
  }

  async function addSource() {
    if (!settings) return;
    if (!name.trim()) {
      setError("A job source needs a name.");
      return;
    }
    const next = settingsToStore();
    if (!next) return;
    if (await store(next)) clearSourceDraft();
  }

  async function updateSource() {
    if (!settings || !editingId) return;
    if (!editName.trim()) {
      setError("A job source needs a name.");
      return;
    }
    const next = settingsToStore();
    if (!next) return;
    if (await store(next)) cancelEdit();
  }

  async function addSite() {
    if (!settings) return;
    if (!label.trim() || !pageUrl(url.trim())) {
      setError("A company page needs a name and an https address.");
      return;
    }
    const next = settingsToStore();
    if (!next) return;
    if (await store(next)) cancelAddSite();
  }

  async function updateSite() {
    if (!settings || !editingSiteId) return;
    if (!editLabel.trim() || !pageUrl(editUrl.trim())) {
      setError("A company page needs a name and an https address.");
      return;
    }
    const next = settingsToStore();
    if (!next) return;
    if (await store(next)) cancelEditSite();
  }

  async function save() {
    if (!settings) return;
    if ((adding && (applicationId.trim() || apiKey.trim()) && !name.trim()) || (editingId && !editName.trim())) {
      setError("A job source needs a name.");
      return;
    }
    if (
      (addingSite && (label.trim() || url.trim()) && (!label.trim() || !pageUrl(url.trim()))) ||
      (editingSiteId && (!editLabel.trim() || !pageUrl(editUrl.trim())))
    ) {
      setError("A company page needs a name and an https address.");
      return;
    }
    const next = settingsToStore();
    if (!next) return;
    if (!(await store(next))) return;
    clearSourceDraft();
    cancelEdit();
    cancelAddSite();
    cancelEditSite();
  }

  if (!settings) {
    return <SettingsStatus error={error || "Loading job sources."} />;
  }

  return (
    <VStack gap={5}>
      <SettingsCard title="Job sources">
        {settings.sources.map((source) =>
          editingId === source.id ? (
            <SettingsRow
              key={source.id}
              title={editName || source.name}
              icon={BriefcaseIcon}
              description="Name, application id, and API key stay in this vault."
              control={
                <HStack gap={1}>
                  <Button label="Update" variant="primary" size="sm" isDisabled={busy} onClick={() => void updateSource()} />
                  <Button label="Cancel" variant="secondary" size="sm" onClick={cancelEdit} />
                </HStack>
              }
              detail={
                <VStack gap={2}>
                  <Switch
                    label="On"
                    value={editEnabled}
                    onChange={(checked) => setEditEnabled(checked)}
                  />
                  <TextInput label="Name" size="sm" width="100%" value={editName} onChange={setEditName} />
                  <TextInput label="Application id" size="sm" width="100%" value={editApplicationId} onChange={setEditApplicationId} />
                  <TextInput label="API key" type="password" size="sm" width="100%" value={editApiKey} onChange={setEditApiKey} />
                </VStack>
              }
            />
          ) : (
            <SettingsRow
              key={source.id}
              title={source.name}
              icon={BriefcaseIcon}
              description={source.enabled ? "On. Search reads this source once Proforna knows how." : "Off."}
              control={
                <HStack gap={1}>
                  <Button
                    label="Edit"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setAdding(false);
                      setAddingSite(false);
                      setEditingSiteId(null);
                      clearSourceDraft();
                      setEditingId(source.id);
                      setEditName(source.name);
                      setEditApplicationId(source.applicationId);
                      setEditApiKey(source.apiKey);
                      setEditEnabled(source.enabled);
                      setError("");
                    }}
                  />
                  <Button
                    label="Remove"
                    variant="ghost"
                    size="sm"
                    isDisabled={busy}
                    onClick={() =>
                      void store({
                        ...settings,
                        sources: settings.sources.filter((item) => item.id !== source.id),
                      })
                    }
                  />
                </HStack>
              }
            />
          ),
        )}
        {adding ? (
          <SettingsRow
            title="New source"
            icon={PlusIcon}
            description="Name the source, then add an application id or an API key if it asks for one."
            control={
              <HStack gap={1}>
                <Button
                  label="Cancel"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    clearSourceDraft();
                    setError("");
                  }}
                />
                <Button label="Add" variant="primary" size="sm" isDisabled={busy} onClick={() => void addSource()} />
              </HStack>
            }
            detail={
              <VStack gap={2}>
                <TextInput label="Name" size="sm" width="100%" value={name} placeholder="Adzuna" onChange={setName} />
                <TextInput label="Application id" size="sm" width="100%" value={applicationId} placeholder="If the site asks for one" onChange={setApplicationId} />
                <TextInput label="API key" type="password" size="sm" width="100%" value={apiKey} placeholder="If the site asks for one" onChange={setApiKey} />
              </VStack>
            }
          />
        ) : (
          <SettingsRow
            title="Add job source"
            icon={PlusIcon}
            description="Name the source, then add an application id or an API key if it asks for one."
            control={
              <Button
                label="Add"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setEditingId(null);
                  setAddingSite(false);
                  setEditingSiteId(null);
                  setAdding(true);
                  setError("");
                }}
              />
            }
          />
        )}
      </SettingsCard>
      <SettingsCard title="Company careers pages">
        {settings.sites.map((site) =>
          editingSiteId === site.id ? (
            <SettingsRow
              key={site.id}
              title={editLabel || site.label}
              icon={BuildingOffice2Icon}
              description="Search reads the page you save."
              control={
                <HStack gap={1}>
                  <Button label="Update" variant="primary" size="sm" isDisabled={busy} onClick={() => void updateSite()} />
                  <Button label="Cancel" variant="secondary" size="sm" onClick={cancelEditSite} />
                </HStack>
              }
              detail={
                <VStack gap={2}>
                  <Switch label="On" value={editSiteEnabled} onChange={(checked) => setEditSiteEnabled(checked)} />
                  <TextInput label="Company" size="sm" width="100%" value={editLabel} onChange={setEditLabel} />
                  <TextInput label="Careers address" size="sm" width="100%" value={editUrl} onChange={setEditUrl} />
                </VStack>
              }
            />
          ) : (
            <SettingsRow
              key={site.id}
              title={site.label}
              icon={BuildingOffice2Icon}
              description={site.enabled ? site.url : `Off. ${site.url}`}
              control={
                <HStack gap={1}>
                  <Button
                    label="Edit"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setAdding(false);
                      setEditingId(null);
                      setAddingSite(false);
                      setLabel("");
                      setUrl("");
                      setEditingSiteId(site.id);
                      setEditLabel(site.label);
                      setEditUrl(site.url);
                      setEditSiteEnabled(site.enabled);
                      setError("");
                    }}
                  />
                  <Button
                    label="Remove"
                    variant="ghost"
                    size="sm"
                    isDisabled={busy}
                    onClick={() =>
                      void store({
                        ...settings,
                        sites: settings.sites.filter((item) => item.id !== site.id),
                      })
                    }
                  />
                </HStack>
              }
            />
          ),
        )}
        {addingSite ? (
          <SettingsRow
            title="New page"
            icon={PlusIcon}
            description="When the page names a role, that posting shows up with the other results."
            control={
              <HStack gap={1}>
                <Button label="Cancel" variant="secondary" size="sm" onClick={cancelAddSite} />
                <Button label="Add" variant="primary" size="sm" isDisabled={busy} onClick={() => void addSite()} />
              </HStack>
            }
            detail={
              <VStack gap={2}>
                <TextInput label="Company" size="sm" width="100%" value={label} placeholder="Northstar" onChange={setLabel} />
                <TextInput label="Careers address" size="sm" width="100%" value={url} placeholder="https://example.com/careers" onChange={setUrl} />
              </VStack>
            }
          />
        ) : (
          <SettingsRow
            title="Add page"
            icon={PlusIcon}
            description="Search reads the page you save."
            control={
              <Button
                label="Add"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setAdding(false);
                  setEditingId(null);
                  setEditingSiteId(null);
                  setAddingSite(true);
                  setError("");
                }}
              />
            }
          />
        )}
      </SettingsCard>
      <SettingsCard title="Judge against">
        {JUDGMENT_SECTIONS.map((section) => (
          <SettingsRow
            key={section}
            title={JUDGMENT_COPY[section].label}
            icon={PencilSquareIcon}
            description={JUDGMENT_COPY[section].detail}
            control={
              <Switch
                label={JUDGMENT_COPY[section].label}
                isLabelHidden
                value={settings.judgment.includes(section)}
                onChange={() => {
                  const judgment = settings.judgment.includes(section)
                    ? settings.judgment.filter((item) => item !== section)
                    : JUDGMENT_SECTIONS.filter(
                        (item) => settings.judgment.includes(item) || item === section,
                      );
                  setSettings({ ...settings, judgment });
                  setMessage("");
                }}
              />
            }
          />
        ))}
      </SettingsCard>
      <SettingsStatus message={message} error={error} />
      <HStack>
        <Button
          label={busy ? "Saving…" : "Save"}
          variant="primary"
          size="sm"
          isDisabled={busy}
          onClick={() => void save()}
        />
      </HStack>
    </VStack>
  );
}

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

type GmailAccount = { connected: false } | { connected: true; email: string; enabled: boolean };
type GmailThread = { id: string; snippet: string };

export function IntegrationSettingsPanel() {
  const [rows, setRows] = useState<ListedIntegration[] | null>(null);
  const [query, setQuery] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [openName, setOpenName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [gmail, setGmail] = useState<GmailAccount | null>(null);
  const [mailQuery, setMailQuery] = useState("");
  const [threads, setThreads] = useState<GmailThread[]>([]);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    void load();
    void loadGmail();
  }, []);

  async function load() {
    const response = await fetch("/api/integration-catalog");
    if (!response.ok) {
      setError("Could not load integrations.");
      return;
    }
    const payload = (await response.json()) as { integrations?: ListedIntegration[] };
    setRows(payload.integrations ?? []);
  }

  async function loadGmail() {
    const response = await fetch("/api/gmail");
    if (!response.ok) return;
    setGmail((await response.json()) as GmailAccount);
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

  async function connectRow(row: ListedIntegration) {
    if (row.signIn) {
      const popup = openSignInWindow(row.name);
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
        if (row.name === "gmail") await loadGmail();
      } catch {
        popup.close();
        setError(`${row.displayName} could not be connected.`);
      } finally {
        setBusy(false);
      }
      return;
    }
    const href = setupHref(row);
    if (href) window.open(href, "_blank", "noopener,noreferrer");
    setOpenName(row.name);
  }

  async function saveValues(name: string) {
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
      const response = await fetch(`/api/integration-catalog/${encodeURIComponent(name)}`, { method: "DELETE" });
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
    const path = row.name === "gmail" ? "/api/gmail" : `/api/integration-catalog/${encodeURIComponent(row.name)}`;
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
      if (row.name === "gmail") await loadGmail();
    } catch {
      setError(enabled ? "Could not turn that connection on." : "Could not turn that connection off.");
    } finally {
      setBusy(false);
    }
  }

  async function searchMail() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/gmail/messages?q=${encodeURIComponent(mailQuery)}`);
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

  async function saveDraft() {
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

  async function disconnectGmail() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/gmail", { method: "DELETE" });
      if (!response.ok) {
        setError("Could not disconnect Gmail.");
        return;
      }
      setGmail({ connected: false });
      setThreads([]);
      setMessage("Gmail is disconnected.");
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <VStack gap={5}>
      <SettingsCard title="Connections">
        <SettingsRow
          title="Search"
          icon={EnvelopeIcon}
          description="Find a connection by name or what it does."
          control={field("Search", query, setQuery, { placeholder: "Name or what it does" })}
        />
        {rows && visible.length === 0 ? (
          <SettingsRow
            title="None ready"
            icon={LinkIcon}
            description={query.trim() ? "No integration matches that search." : "No connections are ready yet."}
          />
        ) : (
          visible.map((row) => {
            const gmailOn = row.name === "gmail" && gmail?.connected ? (row.enabled ?? gmail.enabled) : false;
            return (
              <SettingsRow
                key={row.name}
                title={row.name === "gmail" && gmail?.connected ? gmail.email : row.displayName}
                icon={row.name === "gmail" ? EnvelopeIcon : LinkIcon}
                description={
                  row.name === "gmail" && gmail?.connected && !gmailOn
                    ? "Gmail is off. Turn it on to search or save a draft."
                    : row.description
                }
                control={
                  row.configured ? (
                    <HStack gap={1} align="center">
                      {row.name === "gmail" ? (
                        <Button label="Disconnect" variant="ghost" size="sm" isDisabled={busy} onClick={() => void disconnectGmail()} />
                      ) : (
                        <Button label="Remove" variant="ghost" size="sm" isDisabled={busy} onClick={() => void remove(row.name)} />
                      )}
                      <Switch
                        label={row.displayName}
                        isLabelHidden
                        value={row.enabled}
                        isDisabled={busy}
                        onChange={(checked) => void setEnabled(row, checked)}
                      />
                    </HStack>
                  ) : (
                    <Button
                      label="Connect"
                      variant="secondary"
                      size="sm"
                      isDisabled={busy}
                      onClick={() => void connectRow(row)}
                    />
                  )
                }
                detail={
                  row.name === "gmail" && gmailOn ? (
                    <VStack gap={2}>
                      <TextInput label="Search mail" size="sm" width="100%" value={mailQuery} placeholder="from:recruiter offer" onChange={setMailQuery} />
                      <Button label="Search" variant="secondary" size="sm" isDisabled={busy} onClick={() => void searchMail()} />
                      {threads.map((thread) => (
                        <Text key={thread.id} type="supporting" color="secondary">
                          {thread.snippet}
                        </Text>
                      ))}
                      <TextInput label="To" size="sm" width="100%" value={to} onChange={setTo} />
                      <TextInput label="Subject" size="sm" width="100%" value={subject} onChange={setSubject} />
                      <TextArea label="Message" size="sm" width="100%" value={body} onChange={setBody} />
                      <Button label="Save draft" variant="secondary" size="sm" isDisabled={busy} onClick={() => void saveDraft()} />
                    </VStack>
                  ) : !row.signIn && openName === row.name ? (
                    <VStack gap={2}>
                      {setupHref(row) ? (
                        <Text type="supporting" color="secondary">
                          {setupLead(row)}, then paste it here.
                        </Text>
                      ) : null}
                      {row.fields.map((item) => (
                        <TextInput
                          key={item.key}
                          label={item.label}
                          type={item.secret ? "password" : "text"}
                          size="sm"
                          width="100%"
                          value={values[item.key] ?? ""}
                          onChange={(value) => setValues((current) => ({ ...current, [item.key]: value }))}
                        />
                      ))}
                      {row.configured ? (
                        <Text type="supporting" color="secondary">
                          Saved. Enter the values again to change them.
                        </Text>
                      ) : null}
                      <Button
                        label={row.configured ? "Save changes" : "Connect"}
                        variant="primary"
                        size="sm"
                        isDisabled={busy}
                        onClick={() => void saveValues(row.name)}
                      />
                    </VStack>
                  ) : null
                }
              />
            );
          })
        )}
      </SettingsCard>
      <SettingsStatus message={message} error={error} />
    </VStack>
  );
}

function integrationRank(row: ListedIntegration): number {
  if (row.configured && row.enabled) return 0;
  if (row.configured) return 1;
  if (row.available) return 2;
  return 3;
}

function setupHref(row: ListedIntegration): string | null {
  const href = row.fields.find((item) => item.setupUrl)?.setupUrl ?? null;
  if (!href) return null;
  try {
    const url = new URL(href);
    if (url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function setupLead(row: ListedIntegration): string {
  const href = setupHref(row);
  if (!href) return `Open ${row.displayName}`;
  const host = new URL(href).hostname;
  if (host === "github.com") return "Create a token on GitHub";
  if (host === "www.linkedin.com" || host === "linkedin.com") return "Create an app on LinkedIn";
  return `Open ${row.displayName}`;
}

function signInError(displayName: string, code: string | undefined): string {
  if (code === "sign-in-unavailable") return `${displayName} is not ready to sign in yet.`;
  return `${displayName} could not be connected.`;
}

const PUBLISH_SECTIONS: Array<{
  value: WorkMapPublishSection;
  label: string;
  icon: IconComponent;
}> = [
  { value: "profile", label: "Profile and bio", icon: UserIcon },
  { value: "history", label: "Career history", icon: BriefcaseIcon },
  { value: "map", label: "Approved locations", icon: MapIcon },
  { value: "milestones", label: "Milestones and events", icon: CalendarDaysIcon },
  { value: "media", label: "Approved galleries", icon: PhotoIcon },
  { value: "evidence", label: "Linked evidence", icon: DocumentTextIcon },
  { value: "skills", label: "Skills", icon: SwatchIcon },
  { value: "contact", label: "Contact and inbound opportunities", icon: EnvelopeIcon },
];

const VISIBILITY_OPTIONS: Array<{ value: WorkMapPublicationSettings["visibility"]; label: string }> = [
  { value: "public", label: "Public" },
  { value: "unlisted", label: "Unlisted" },
  { value: "access-controlled", label: "Access controlled" },
  { value: "stealth", label: "Stealth — hide identity" },
  { value: "anonymous", label: "Anonymous — redact career detail" },
  { value: "private", label: "Private — keep off the relay" },
];

export function PublicationSettingsPanel() {
  const [settings, setSettings] = useState<WorkMapPublicationSettings | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [relayOrigin, setRelayOrigin] = useState<string | null>(null);
  const [publications, setPublications] = useState<Array<{ slug: string; status: string }>>([]);
  const [placement, setPlacement] = useState<PreviewPlacement>(readPreviewPlacement);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancel = false;
    void (async () => {
      const [settingsResponse, publicationResponse] = await Promise.all([
        fetch("/api/work-map/settings"),
        fetch("/api/projections"),
      ]);
      if (!settingsResponse.ok) {
        if (!cancel) setError("Could not load publication settings.");
        return;
      }
      const body = (await settingsResponse.json()) as {
        settings: WorkMapPublicationSettings;
        updatedAt?: string | null;
        relayOrigin?: string | null;
      };
      if (cancel) return;
      setSettings(body.settings);
      setUpdatedAt(body.updatedAt ?? null);
      setRelayOrigin(body.relayOrigin ?? null);
      if (!publicationResponse.ok) return;
      const listed = (await publicationResponse.json()) as {
        projections: Array<{ slug: string; status: string }>;
      };
      if (cancel) return;
      setPublications(listed.projections);
    })();
    return () => {
      cancel = true;
    };
  }, []);

  function patch(next: Partial<WorkMapPublicationSettings>) {
    setSettings((current) => (current ? { ...current, ...next } : current));
  }

  function choosePlacement(value: string) {
    const next: PreviewPlacement = value === "here" || value === "window" ? value : "ask";
    setPlacement(next);
    writePreviewPlacement(next);
  }

  async function save() {
    if (!settings || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    const response = await fetch("/api/work-map/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...settings, updatedAt }),
    });
    setBusy(false);
    if (response.status === 409) {
      setError("Publication settings changed after this panel opened. Reload them before saving.");
      return;
    }
    if (!response.ok) {
      setError("Could not save publication settings.");
      return;
    }
    const body = (await response.json()) as {
      settings: WorkMapPublicationSettings;
      updatedAt?: string | null;
    };
    setSettings(body.settings);
    setUpdatedAt(body.updatedAt ?? null);
    setMessage("Publication settings saved.");
  }

  if (!settings) {
    return <SettingsStatus message={error ? null : "Loading publication settings."} error={error || null} />;
  }

  const latest = publications.find((item) => item.slug === settings.slug);
  const published = latest?.status === "published";
  const embed = publicationEmbed({
    origin: relayOrigin,
    slug: settings.slug,
    visibility: settings.visibility,
  });
  const frameNote = embed.ok
    ? published
      ? "This frame shows the published career. A later edit stays private until you publish again."
      : "Publish once, then this frame shows the career. A later edit stays private until you publish again."
    : embed.reason === "private"
      ? "A private career stays off the relay, so there is no frame to copy."
      : embed.reason === "access-controlled"
        ? "An access-controlled career uses its own link, so there is no frame to copy."
        : embed.reason === "slug"
          ? "Save a public slug before copying a frame."
          : "The frame address appears once the relay is connected.";

  return (
    <VStack gap={5}>
      <SettingsCard title="Preview">
        <SettingsRow
          title="Open preview"
          icon={EyeIcon}
          control={
            <SegmentedControl label="Open preview" size="sm" value={placement} onChange={choosePlacement}>
              <SegmentedControlItem value="ask" label="Ask each time" />
              <SegmentedControlItem value="here" label="In this window" />
              <SegmentedControlItem value="window" label="In a new window" />
            </SegmentedControl>
          }
        />
      </SettingsCard>
      <SettingsCard title="Snapshot">
        <SettingsRow
          title="Public slug"
          icon={LinkIcon}
          control={field("Public slug", settings.slug, (slug) => patch({ slug }))}
        />
        <SettingsRow
          title="Target role"
          icon={BriefcaseIcon}
          control={field("Target role", settings.targetRole, (targetRole) => patch({ targetRole }))}
        />
        <SettingsRow
          title="Visibility"
          icon={LockClosedIcon}
          control={
            <Selector
              label="Visibility"
              isLabelHidden
              size="sm"
              width={240}
              value={settings.visibility}
              onChange={(value) => {
                if (typeof value !== "string") return;
                const match = VISIBILITY_OPTIONS.find((option) => option.value === value);
                if (match) patch({ visibility: match.value });
              }}
              options={VISIBILITY_OPTIONS}
            />
          }
        />
      </SettingsCard>
      <SettingsCard title="Published sections">
        {PUBLISH_SECTIONS.map((section) => (
          <SettingsRow
            key={section.value}
            title={section.label}
            icon={section.icon}
            control={
              <Switch
                label={section.label}
                isLabelHidden
                value={settings.sections.includes(section.value)}
                onChange={(checked) =>
                  patch({
                    sections: checked
                      ? [...settings.sections, section.value]
                      : settings.sections.filter((item) => item !== section.value),
                  })
                }
              />
            }
          />
        ))}
      </SettingsCard>
      <SettingsCard title="Options">
        <SettingsRow
          title="Hide current employer in restricted modes"
          icon={BuildingOffice2Icon}
          control={
            <Switch
              label="Hide current employer in restricted modes"
              isLabelHidden
              value={settings.hideCurrentEmployer}
              onChange={(checked) => patch({ hideCurrentEmployer: checked })}
            />
          }
        />
        <SettingsRow
          title="Publish exact coordinates and addresses"
          icon={MapPinIcon}
          control={
            <Switch
              label="Publish exact coordinates and addresses"
              isLabelHidden
              value={settings.showExactLocations}
              onChange={(checked) => patch({ showExactLocations: checked })}
            />
          }
        />
      </SettingsCard>
      <SettingsCard title="Frame">
        <SettingsRow
          title="Frame"
          icon={CodeBracketIcon}
          description={frameNote}
          control={
            embed.ok ? (
              <Button
                label={copied ? "Copied" : "Copy frame"}
                variant="secondary"
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(embed.code).then(
                    () => {
                      setCopied(true);
                      window.setTimeout(() => setCopied(false), 2000);
                    },
                    () => setCopied(false),
                  );
                }}
              />
            ) : undefined
          }
          detail={
            embed.ok ? (
              <TextArea
                label="Frame"
                isLabelHidden
                isReadOnly
                size="sm"
                width="100%"
                value={embed.code}
                onChange={() => undefined}
              />
            ) : null
          }
        />
      </SettingsCard>
      <Text type="supporting" color="secondary">
        Private notes stay out of the snapshot. Compensation, working conditions, unpublished locations, and
        unpublished media enter only when approved for publishing.
      </Text>
      <SettingsStatus message={message} error={error} />
      <HStack>
        <Button label={busy ? "Saving…" : "Save"} variant="primary" size="sm" isDisabled={busy} onClick={() => void save()} />
      </HStack>
    </VStack>
  );
}

function openSignInWindow(name: string): Window | null {
  const width = 520;
  const height = 720;
  const left = window.screenX + Math.max(0, (window.outerWidth - width) / 2);
  const top = window.screenY + Math.max(0, (window.outerHeight - height) / 2);
  return window.open(
    "about:blank",
    `proforna-sign-in-${name}`,
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

function refreshLookup(setLookupStatus: (status: "ok" | "unavailable" | "unused" | "") => void) {
  return fetch("/api/maps/lookup-status")
    .then(async (response) => {
      const body = (await response.json()) as { googleLookup?: "ok" | "unavailable" | "unused" };
      setLookupStatus(body.googleLookup ?? "unused");
    })
    .catch(() => setLookupStatus(""));
}
