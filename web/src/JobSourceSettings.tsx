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

export function JobSourceSettingsForm() {
  const [settings, setSettings] = useState<JobSourceSettings | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [applicationId, setApplicationId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
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

  function patchSource(id: string, patch: Partial<JobListingSource>) {
    if (!settings) return;
    update({
      ...settings,
      sources: settings.sources.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    });
  }

  function addSource() {
    if (!settings) return;
    const sourceName = name.trim();
    if (!sourceName) {
      setError("A job source needs a name.");
      return;
    }
    const source: JobListingSource = {
      id: crypto.randomUUID(),
      name: sourceName,
      applicationId: applicationId.trim(),
      apiKey: apiKey.trim(),
      enabled: true,
    };
    setError("");
    update({ ...settings, sources: [...settings.sources, source] });
    setName("");
    setApplicationId("");
    setApiKey("");
    setAdding(false);
  }

  function addSite() {
    if (!settings) return;
    const site: CompanySiteSource = {
      id: crypto.randomUUID(),
      label: label.trim(),
      url: url.trim(),
      enabled: true,
    };
    if (!site.label || !/^https?:\/\//i.test(site.url)) {
      setError("A company page needs a name and an https address.");
      return;
    }
    setError("");
    update({ ...settings, sites: [...settings.sites, site] });
    setLabel("");
    setUrl("");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!settings) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/job-sources", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(settings),
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
        return;
      }
      setSettings(body.settings);
      setMessage("Saved. Search uses these sources, and a fit judgment reads only the checked parts of your career record.");
    } finally {
      setBusy(false);
    }
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
          {settings.sources.map((source) => (
            <div className="job-source-card" key={source.id}>
              <label className="onboarding-field">
                <span>
                  <input
                    type="checkbox"
                    checked={source.enabled}
                    onChange={(event) => patchSource(source.id, { enabled: event.target.checked })}
                  />{" "}
                  On
                </span>
              </label>
              <label className="onboarding-field">
                <span>Name</span>
                <input
                  value={source.name}
                  onChange={(event) => patchSource(source.id, { name: event.target.value })}
                />
              </label>
              <label className="onboarding-field">
                <span>Application id</span>
                <input
                  autoComplete="off"
                  value={source.applicationId}
                  onChange={(event) => patchSource(source.id, { applicationId: event.target.value })}
                />
              </label>
              <label className="onboarding-field">
                <span>API key</span>
                <input
                  type="password"
                  autoComplete="off"
                  value={source.apiKey}
                  onChange={(event) => patchSource(source.id, { apiKey: event.target.value })}
                />
              </label>
              <button
                type="button"
                onClick={() =>
                  update({
                    ...settings,
                    sources: settings.sources.filter((item) => item.id !== source.id),
                  })
                }
              >
                Remove
              </button>
            </div>
          ))}
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
                <button type="button" onClick={() => addSource()}>
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
            <button type="button" onClick={() => setAdding(true)}>
              Add job source
            </button>
          )}
        </fieldset>
        <fieldset className="map-pin-settings">
          <legend>Company careers page</legend>
          <p className="onboarding-lead">
            Saved for Proforna to read later. Search does not open these pages yet.
          </p>
          {settings.sites.map((site) => (
            <label className="onboarding-field" key={site.id}>
              <span>
                <input
                  type="checkbox"
                  checked={site.enabled}
                  onChange={(event) =>
                    update({
                      ...settings,
                      sites: settings.sites.map((item) =>
                        item.id === site.id ? { ...item, enabled: event.target.checked } : item,
                      ),
                    })
                  }
                />{" "}
                {site.label}
              </span>
              <small>{site.url}</small>
              <button
                type="button"
                onClick={() =>
                  update({
                    ...settings,
                    sites: settings.sites.filter((item) => item.id !== site.id),
                  })
                }
              >
                Remove
              </button>
            </label>
          ))}
          <label className="onboarding-field">
            <span>Company</span>
            <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Northstar" />
          </label>
          <label className="onboarding-field">
            <span>Careers address</span>
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com/careers"
            />
          </label>
          <button type="button" onClick={() => addSite()}>
            Add page
          </button>
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
