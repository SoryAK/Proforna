import { useEffect, useState, type FormEvent } from "react";
import {
  JUDGMENT_SECTIONS,
  type CompanySiteSource,
  type JobListingSource,
  type JobSourceSettings,
  type JudgmentSection,
} from "@core/job-sources";

const JUDGMENT_COPY: Record<JudgmentSection, { label: string; detail: string }> = {
  profile: { label: "Profile", detail: "Name, headline, and bio" },
  history: { label: "Career history", detail: "Roles, schools, and what you did" },
  skills: { label: "Skills", detail: "Skills on the career record" },
  worklog: { label: "Worklog", detail: "Work you have captured since" },
  residence: { label: "Home", detail: "Where you live now" },
};

function pageUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export function JobSourceSettingsForm() {
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

  function update(next: JobSourceSettings) {
    setSettings(next);
    setMessage("");
  }

  function toggleJudgment(section: JudgmentSection) {
    if (!settings) return;
    const judgment = settings.judgment.includes(section)
      ? settings.judgment.filter((item) => item !== section)
      : JUDGMENT_SECTIONS.filter(
          (item) => settings.judgment.includes(item) || item === section,
        );
    update({ ...settings, judgment });
  }

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
    return {
      id: crypto.randomUUID(),
      label: siteLabel,
      url: siteUrl,
      enabled: true,
    };
  }

  function siteBeingEdited(): CompanySiteSource | null {
    if (!settings || !editingSiteId) return null;
    const current = settings.sites.find((site) => site.id === editingSiteId);
    const siteLabel = editLabel.trim();
    const siteUrl = editUrl.trim();
    if (!current || !siteLabel || !pageUrl(siteUrl)) return null;
    return {
      ...current,
      label: siteLabel,
      url: siteUrl,
      enabled: editSiteEnabled,
    };
  }

  function settingsToStore(): JobSourceSettings | null {
    if (!settings) return null;
    const added = sourceBeingAdded();
    const edited = sourceBeingEdited();
    let sources = settings.sources;
    if (edited) {
      sources = sources.map((source) => (source.id === edited.id ? edited : source));
    }
    if (added) sources = [...sources, added];
    const addedSite = siteBeingAdded();
    const editedSite = siteBeingEdited();
    let sites = settings.sites;
    if (editedSite) {
      sites = sites.map((site) => (site.id === editedSite.id ? editedSite : site));
    }
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
      setMessage("Saved. Search uses these sources, and a fit judgment reads only the checked parts of your career record.");
      return true;
    } catch {
      setError("Could not save job sources.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addSource() {
    if (!settings) return;
    if (!name.trim()) {
      setError("A job source needs a name.");
      return;
    }
    const next = settingsToStore();
    if (!next) return;
    const saved = await store(next);
    if (!saved) return;
    setName("");
    setApplicationId("");
    setApiKey("");
    setAdding(false);
  }

  function beginAdd() {
    setEditingId(null);
    setAddingSite(false);
    setEditingSiteId(null);
    setAdding(true);
    setError("");
  }

  function beginEdit(source: JobListingSource) {
    setAdding(false);
    setAddingSite(false);
    setEditingSiteId(null);
    setName("");
    setApplicationId("");
    setApiKey("");
    setEditingId(source.id);
    setEditName(source.name);
    setEditApplicationId(source.applicationId);
    setEditApiKey(source.apiKey);
    setEditEnabled(source.enabled);
    setError("");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditApplicationId("");
    setEditApiKey("");
    setEditEnabled(true);
    setError("");
  }

  async function updateSource() {
    if (!settings || !editingId) return;
    if (!editName.trim()) {
      setError("A job source needs a name.");
      return;
    }
    const next = settingsToStore();
    if (!next) return;
    const saved = await store(next);
    if (!saved) return;
    cancelEdit();
  }

  function beginAddSite() {
    setAdding(false);
    setEditingId(null);
    setEditingSiteId(null);
    setAddingSite(true);
    setError("");
  }

  function beginEditSite(site: CompanySiteSource) {
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
  }

  function cancelEditSite() {
    setEditingSiteId(null);
    setEditLabel("");
    setEditUrl("");
    setEditSiteEnabled(true);
    setError("");
  }

  function cancelAddSite() {
    setAddingSite(false);
    setLabel("");
    setUrl("");
    setError("");
  }

  async function addSite() {
    if (!settings) return;
    if (!label.trim() || !pageUrl(url.trim())) {
      setError("A company page needs a name and an https address.");
      return;
    }
    const next = settingsToStore();
    if (!next) return;
    const saved = await store(next);
    if (!saved) return;
    cancelAddSite();
  }

  async function updateSite() {
    if (!settings || !editingSiteId) return;
    if (!editLabel.trim() || !pageUrl(editUrl.trim())) {
      setError("A company page needs a name and an https address.");
      return;
    }
    const next = settingsToStore();
    if (!next) return;
    const saved = await store(next);
    if (!saved) return;
    cancelEditSite();
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!settings) return;
    if (
      (adding && (applicationId.trim() || apiKey.trim()) && !name.trim()) ||
      (editingId && !editName.trim())
    ) {
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
    const saved = await store(next);
    if (!saved) return;
    setName("");
    setApplicationId("");
    setApiKey("");
    setAdding(false);
    cancelEdit();
    cancelAddSite();
    cancelEditSite();
  }

  if (!settings) {
    return (
      <>
        <h1>Jobs</h1>
        <p className="onboarding-lead">{error || "Loading job sources."}</p>
      </>
    );
  }

  return (
    <>
      <h1>Jobs</h1>
      <p className="onboarding-lead">
        Add each place you want listings from. If that place asks for an
        application id or an API key, enter whichever it uses. A fit judgment
        uses the live career record, and only the parts you leave checked.
      </p>
      <form className="onboarding-form" onSubmit={(event) => void save(event)}>
        <fieldset className="map-pin-settings">
          <legend>Job sources</legend>
          <p className="onboarding-lead">
            Name the source, then add an application id or an API key if it asks
            for one. Both stay in this vault. Search reads a source once Proforna
            knows how.
          </p>
          {settings.sources.map((source) =>
            editingId === source.id ? (
              <div className="job-source-card" key={source.id}>
                <label className="onboarding-field">
                  <span>
                    <input
                      type="checkbox"
                      checked={editEnabled}
                      onChange={(event) => setEditEnabled(event.target.checked)}
                    />{" "}
                    On
                  </span>
                </label>
                <label className="onboarding-field">
                  <span>Name</span>
                  <input
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                  />
                </label>
                <label className="onboarding-field">
                  <span>Application id</span>
                  <input
                    autoComplete="off"
                    value={editApplicationId}
                    onChange={(event) => setEditApplicationId(event.target.value)}
                  />
                </label>
                <label className="onboarding-field">
                  <span>API key</span>
                  <input
                    type="password"
                    autoComplete="off"
                    value={editApiKey}
                    onChange={(event) => setEditApiKey(event.target.value)}
                  />
                </label>
                <div className="map-theme-row">
                  <button type="button" disabled={busy} onClick={() => void updateSource()}>
                    Update
                  </button>
                  <button type="button" onClick={cancelEdit}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="job-source-row" key={source.id}>
                <span>
                  {source.name}
                  {source.enabled ? "" : " · Off"}
                </span>
                <button type="button" onClick={() => beginEdit(source)}>
                  Edit
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void store({
                      ...settings,
                      sources: settings.sources.filter((item) => item.id !== source.id),
                    })
                  }
                >
                  Remove
                </button>
              </div>
            ),
          )}
          {adding ? (
            <>
              <label className="onboarding-field">
                <span>Name</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Adzuna"
                />
              </label>
              <label className="onboarding-field">
                <span>Application id</span>
                <input
                  autoComplete="off"
                  value={applicationId}
                  onChange={(event) => setApplicationId(event.target.value)}
                  placeholder="If the site asks for one"
                />
              </label>
              <label className="onboarding-field">
                <span>API key</span>
                <input
                  type="password"
                  autoComplete="off"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder="If the site asks for one"
                />
              </label>
              <div className="map-theme-row">
                <button type="button" disabled={busy} onClick={() => void addSource()}>
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAdding(false);
                    setName("");
                    setApplicationId("");
                    setApiKey("");
                    setError("");
                  }}
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <button type="button" onClick={beginAdd}>
              Add job source
            </button>
          )}
        </fieldset>
        <fieldset className="map-pin-settings">
          <legend>Company careers page</legend>
          <p className="onboarding-lead">
            Search reads the page you save. When it names a role, that posting shows up with the other results.
          </p>
          {settings.sites.map((site) =>
            editingSiteId === site.id ? (
              <div className="job-source-card" key={site.id}>
                <label className="onboarding-field">
                  <span>
                    <input
                      type="checkbox"
                      checked={editSiteEnabled}
                      onChange={(event) => setEditSiteEnabled(event.target.checked)}
                    />{" "}
                    On
                  </span>
                </label>
                <label className="onboarding-field">
                  <span>Company</span>
                  <input
                    value={editLabel}
                    onChange={(event) => setEditLabel(event.target.value)}
                  />
                </label>
                <label className="onboarding-field">
                  <span>Careers address</span>
                  <input
                    value={editUrl}
                    onChange={(event) => setEditUrl(event.target.value)}
                  />
                </label>
                <div className="map-theme-row">
                  <button type="button" disabled={busy} onClick={() => void updateSite()}>
                    Update
                  </button>
                  <button type="button" onClick={cancelEditSite}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="job-source-row" key={site.id}>
                <span>
                  {site.label}
                  {site.enabled ? "" : " · Off"}
                </span>
                <button type="button" onClick={() => beginEditSite(site)}>
                  Edit
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void store({
                      ...settings,
                      sites: settings.sites.filter((item) => item.id !== site.id),
                    })
                  }
                >
                  Remove
                </button>
              </div>
            ),
          )}
          {addingSite ? (
            <>
              <label className="onboarding-field">
                <span>Company</span>
                <input
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  placeholder="Northstar"
                />
              </label>
              <label className="onboarding-field">
                <span>Careers address</span>
                <input
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://example.com/careers"
                />
              </label>
              <div className="map-theme-row">
                <button type="button" disabled={busy} onClick={() => void addSite()}>
                  Add
                </button>
                <button type="button" onClick={cancelAddSite}>
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <button type="button" onClick={beginAddSite}>
              Add page
            </button>
          )}
        </fieldset>
        <fieldset className="map-pin-settings">
          <legend>Judge against</legend>
          {JUDGMENT_SECTIONS.map((section) => (
            <label className="onboarding-field" key={section}>
              <span>
                <input
                  type="checkbox"
                  checked={settings.judgment.includes(section)}
                  onChange={() => toggleJudgment(section)}
                />{" "}
                {JUDGMENT_COPY[section].label}
              </span>
              <small>{JUDGMENT_COPY[section].detail}</small>
            </label>
          ))}
        </fieldset>
        <button type="submit" disabled={busy}>
          {busy ? "Saving" : "Save"}
        </button>
        {message ? <p className="home-settings-note">{message}</p> : null}
        {error ? <p className="home-settings-note">{error}</p> : null}
      </form>
    </>
  );
}
