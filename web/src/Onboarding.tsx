import { useEffect, useRef, useState } from "react";
import { CircleMarker, MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { formatCareerSpan } from "@core/career-file";
import { isHttpUrl, OPENAI_BASE_URL, type ModelHosting } from "@core/model-connection";
import {
  planModelOnboarding,
  presentModelId,
  type LocalProbeResult,
} from "@core/model-onboarding";
import { prepareProfile, type ProfileFields } from "@core/profile";
import {
  fillProfileFromExtract,
  splitPlaceLabel,
  type ExtractedJob,
  type ExtractedResume,
  type ExtractedSchool,
} from "@core/resume-extract";
import type { OnboardingProfileValue } from "./OnboardingProfile";
import { reversePlace, searchPlaces, type PlaceHit } from "./place-search";
import "leaflet/dist/leaflet.css";
import "./onboarding.css";

type Me = {
  occupant: { id: string };
  profile: OnboardingProfileValue & { onboardingCompletedAt: string | null };
};

type Beat = "name" | "model" | "file" | "address" | "links" | "check" | "done";

type CheckItem = {
  source: "job" | "school";
  sourceIndex: number;
  kind: "Job" | "School";
  org: string;
  title: string;
  place: string;
  span: string;
  lines: string[];
  lat: number | null;
  lng: number | null;
};

const STEPS = ["Name", "Model", "File", "Address", "Links", "Check"] as const;

export function Onboarding({
  initialProfile,
  onFinished,
}: {
  initialProfile: OnboardingProfileValue;
  onFinished: (me: Me) => void;
}) {
  const split = splitName(initialProfile.fullName);
  const [firstName, setFirstName] = useState(split.first);
  const [lastName, setLastName] = useState(split.last);
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [stateName, setStateName] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [github, setGithub] = useState("");
  const [website, setWebsite] = useState("");
  const [addressDecision, setAddressDecision] = useState<"use" | "keep" | null>(null);
  const [linksDecision, setLinksDecision] = useState<"use" | "keep" | null>(null);
  const [localProbe, setLocalProbe] = useState<"pending" | "ready">("pending");
  const [detectedLocal, setDetectedLocal] = useState<{ label: string; models: string[] } | null>(null);
  const [detectedUrl, setDetectedUrl] = useState("");
  const [endpointMode, setEndpointMode] = useState<"detected" | "custom" | null>(null);
  const [localUrl, setLocalUrl] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [savedModel, setSavedModel] = useState("");
  const [wantsModel, setWantsModel] = useState<boolean | null>(null);
  const [hosting, setHosting] = useState<ModelHosting | null>(null);
  const [cloudKey, setCloudKey] = useState("");
  const [selected, setSelected] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [beat, setBeat] = useState<Beat>("name");
  const [index, setIndex] = useState(0);
  const [items, setItems] = useState<CheckItem[]>([]);
  const [pinPlaces, setPinPlaces] = useState<"each" | "skip" | null>(null);
  const [extracted, setExtracted] = useState<ExtractedResume | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const profileRef = useRef<ProfileFields>(initialProfile);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      try {
        const [modelRes, probeRes] = await Promise.all([
          fetch("/api/models"),
          fetch("/api/models/probe"),
        ]);
        if (cancel) return;
        const saved = modelRes.ok
          ? ((await modelRes.json()) as { connections?: Array<{ model: string }> }).connections?.at(-1)
              ?.model ?? ""
          : "";
        const locals = probeRes.ok
          ? ((await probeRes.json()) as { locals?: LocalProbeResult[] }).locals ?? []
          : [];
        const surface = planModelOnboarding({ locals });
        if (surface.kind === "detected") {
          setDetectedLocal({
            label: surface.label,
            models: surface.models.filter((id) => !/embed/i.test(id)),
          });
          setDetectedUrl(surface.baseUrl);
          setBaseUrl(surface.baseUrl);
        } else {
          setDetectedLocal(null);
          setDetectedUrl("");
          setBaseUrl("");
        }
        setSavedModel(saved);
      } catch {
        if (!cancel) setDetectedLocal(null);
      } finally {
        if (!cancel) setLocalProbe("ready");
      }
    })();
    return () => {
      cancel = true;
      abortRef.current?.abort();
    };
  }, []);

  const modelReady =
    wantsModel === false ||
    (wantsModel === true &&
      hosting === "local" &&
      ((endpointMode === "detected" && Boolean(selected)) ||
        (endpointMode === "custom" && isHttpUrl(localUrl.trim()) && Boolean(selected.trim())))) ||
    (wantsModel === true && hosting === "cloud" && Boolean(selected.trim()) && Boolean(cloudKey.trim()));

  function pickFile(next: File) {
    abortRef.current?.abort();
    setFile(next);
    setItems([]);
    setExtracted(null);
    setIndex(0);
    setError(null);
    setPinPlaces(null);
    setExtracting(false);
    if (beat === "address" || beat === "links" || beat === "check" || beat === "done") setBeat("file");
  }

  async function readFile() {
    if (!file || extracting || wantsModel !== true || !selected) return;
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    setExtracting(true);
    setError(null);
    try {
      if (hosting === "cloud" || endpointMode === "custom" || selected !== savedModel) {
        const saved = await fetch("/api/models", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            hosting === "cloud"
              ? { hosting: "cloud", baseUrl: OPENAI_BASE_URL, model: selected, apiKey: cloudKey }
              : { hosting: "local", baseUrl, model: selected, apiKey: "" },
          ),
          signal: abort.signal,
        });
        if (!saved.ok) {
          const body = (await saved.json()) as { error?: string };
          setError(body.error ?? "Could not use that model.");
          return;
        }
        setSavedModel(selected);
      }
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/resumes/extract", { method: "POST", body: form, signal: abort.signal });
      const body = (await res.json()) as { error?: string; data?: ExtractedResume };
      if (abort.signal.aborted) return;
      if (!res.ok || !body.data) {
        setError(body.error ?? "Could not read the resume.");
        return;
      }
      const next = toCheckItems(body.data);
      const place = splitPlaceLabel(body.data.profile.location);
      const foundProfile = Boolean(
        place.city ||
          body.data.profile.linkedinUrl.trim() ||
          body.data.profile.githubUrl.trim() ||
          body.data.profile.website.trim(),
      );
      if (next.length === 0 && !foundProfile) {
        setError("The model did not find jobs, schools, an address, or links in that file.");
        return;
      }
      setExtracted(body.data);
      setAddress("");
      setCity(place.city);
      setStateName(place.state);
      setLinkedin(httpOrEmpty(body.data.profile.linkedinUrl));
      setGithub(httpOrEmpty(body.data.profile.githubUrl));
      setWebsite(httpOrEmpty(body.data.profile.website));
      setAddressDecision(null);
      setLinksDecision(null);
      setItems(next);
      setPinPlaces(null);
      setIndex(0);
      setBeat("address");
    } catch (err) {
      if (abort.signal.aborted) return;
      setError(err instanceof Error ? err.message : "Could not read the resume.");
    } finally {
      if (abortRef.current === abort) {
        abortRef.current = null;
        setExtracting(false);
      }
    }
  }

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      const base = extracted
        ? fillProfileFromExtract(profileRef.current, extracted.profile)
        : profileRef.current;
      const draft: ProfileFields = {
        ...base,
        fullName: `${firstName} ${lastName}`.replace(/\s+/g, " ").trim(),
      };
      if (addressDecision === "use") {
        if (address.trim()) draft.address = address.trim();
        draft.city = city.trim();
        draft.state = stateName.trim();
      }
      if (linksDecision === "use") {
        draft.linkedinUrl = linkedin.trim();
        draft.githubUrl = github.trim();
        draft.portfolioUrl = website.trim();
      }
      const prepared = prepareProfile(draft);
      if (!prepared.ok) {
        setError(
          prepared.error === "url-invalid"
            ? "Use an http(s) URL for LinkedIn, GitHub, or a site."
            : "A name is required.",
        );
        return;
      }
      profileRef.current = prepared.value;
      const savedProfile = await fetch("/api/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(prepared.value),
      });
      const profileBody = (await savedProfile.json()) as { error?: string };
      if (!savedProfile.ok) {
        setError(profileBody.error ?? "Could not save your profile.");
        return;
      }
      let resumeId: string | undefined;
      if (file) {
        const form = new FormData();
        form.append("file", file);
        const uploaded = await fetch("/api/resumes", { method: "POST", body: form });
        if (!uploaded.ok) {
          setError("Could not store the resume.");
          return;
        }
        const stored = (await uploaded.json()) as { resume?: { id?: string } };
        resumeId = stored.resume?.id;
      }
      if (extracted) {
        const history = keptHistory(extracted, items);
        if (history.experience.length > 0 || history.education.length > 0 || history.skills.length > 0) {
          const saved = await fetch("/api/history", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...history, resumeId }),
          });
          if (!saved.ok) {
            setError("Could not save jobs and schools.");
            return;
          }
        }
      }
      const res = await fetch("/api/onboarding/complete", { method: "POST" });
      const body = (await res.json()) as Me & { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Could not finish onboarding.");
        return;
      }
      onFinished(body);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="onboarding">
      <div className="onboarding-stage">
        <WashProgress beat={beat} />
        <section className="onboarding-card" data-wide={beat === "check" ? "true" : undefined}>
          {beat === "name" ? (
            <>
              <p className="onboarding-kicker">Name</p>
              <h1>
                What should we <em>call you?</em>
              </h1>
              <p className="onboarding-lead">Proforna keeps your career file on this machine.</p>
              <div className="onboarding-field-row">
                <label className="onboarding-field">
                  <span>First name</span>
                  <input
                    value={firstName}
                    autoComplete="given-name"
                    onChange={(event) => setFirstName(event.target.value)}
                  />
                </label>
                <label className="onboarding-field">
                  <span>Last name</span>
                  <input
                    value={lastName}
                    autoComplete="family-name"
                    onChange={(event) => setLastName(event.target.value)}
                  />
                </label>
              </div>
              <div className="onboarding-actions">
                <button
                  type="button"
                  className="onboarding-btn onboarding-btn-solid"
                  disabled={!firstName.trim() || !lastName.trim()}
                  onClick={() => setBeat("model")}
                >
                  Continue
                </button>
              </div>
            </>
          ) : null}

          {beat === "model" ? (
            <>
              <p className="onboarding-kicker">Model</p>
              <h1>
                Connect to a <em>model?</em>
              </h1>
              <p className="onboarding-lead">
                Local stays on this machine. Cloud needs a key, and resume text would leave this machine.
              </p>
              <YesNo
                value={wantsModel}
                onYes={() => setWantsModel(true)}
                onNo={() => {
                  setWantsModel(false);
                  setHosting(null);
                  setSelected("");
                  setCloudKey("");
                  setEndpointMode(null);
                  setLocalUrl("");
                }}
              />
              {wantsModel === true ? (
                <>
                  <div className="onboarding-chips">
                    <button
                      type="button"
                      aria-pressed={hosting === "local"}
                      onClick={() => {
                        setHosting("local");
                        setSelected("");
                        setCloudKey("");
                        setEndpointMode(null);
                        setLocalUrl("");
                        setBaseUrl(detectedUrl);
                      }}
                    >
                      Local
                    </button>
                    <button
                      type="button"
                      aria-pressed={hosting === "cloud"}
                      onClick={() => {
                        setHosting("cloud");
                        setSelected("");
                        setEndpointMode(null);
                        setLocalUrl("");
                      }}
                    >
                      Cloud
                    </button>
                  </div>
                  {hosting === "local" ? (
                    <LocalModels
                      localProbe={localProbe}
                      detectedLocal={detectedLocal}
                      endpointMode={endpointMode}
                      selected={selected}
                      localUrl={localUrl}
                      onPickDetected={(id) => {
                        setEndpointMode("detected");
                        setSelected(id);
                        setLocalUrl("");
                        setBaseUrl(detectedUrl);
                      }}
                      onCustomUrl={(value) => {
                        setLocalUrl(value);
                        setEndpointMode("custom");
                        setBaseUrl(value.trim());
                      }}
                      onCustomModel={(value) => {
                        setSelected(value);
                        setEndpointMode("custom");
                      }}
                    />
                  ) : null}
                  {hosting === "cloud" ? (
                    <>
                      <p className="onboarding-quiet">Resume text would leave this machine.</p>
                      <label className="onboarding-field">
                        <span>Model</span>
                        <input
                          value={selected}
                          autoComplete="off"
                          placeholder="gpt-4o-mini"
                          onChange={(event) => setSelected(event.target.value)}
                        />
                      </label>
                      <label className="onboarding-field">
                        <span>Key</span>
                        <input
                          type="password"
                          value={cloudKey}
                          autoComplete="off"
                          onChange={(event) => setCloudKey(event.target.value)}
                        />
                      </label>
                    </>
                  ) : null}
                </>
              ) : null}
              {wantsModel === false ? (
                <p className="onboarding-quiet">
                  You can still add the resume next. It will not be read. Jobs and schools can be added later from Career History.
                </p>
              ) : null}
              {error ? (
                <p className="onboarding-alert" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="onboarding-actions" data-split="true">
                <button type="button" className="onboarding-btn onboarding-btn-ghost" onClick={() => setBeat("name")}>
                  Back
                </button>
                <button
                  type="button"
                  className="onboarding-btn onboarding-btn-solid"
                  disabled={!modelReady}
                  onClick={() => {
                    setError(null);
                    setBeat("file");
                  }}
                >
                  Continue
                </button>
              </div>
            </>
          ) : null}

          {beat === "file" ? (
            <>
              <p className="onboarding-kicker">File</p>
              <h1>
                {extracting ? (
                  <>
                    Reading the <em>resume.</em>
                  </>
                ) : (
                  <>
                    Import when <em>you’re ready.</em>
                  </>
                )}
              </h1>
              {extracting ? (
                <ReadProgress model={presentModelId(selected)} />
              ) : (
                <>
                  <p className="onboarding-lead">
                    {wantsModel && hosting === "cloud" && selected
                      ? `${presentModelId(selected)} will read the file. Resume text leaves this machine.`
                      : wantsModel && selected
                        ? `${presentModelId(selected)} will read the file.`
                        : "No model is connected. Add the resume if you want it kept. It will not be read."}
                  </p>
                  <label className="onboarding-file">
                    {file ? file.name : "Drop a PDF here, or click to choose"}
                    <input
                      type="file"
                      accept="application/pdf,text/plain,.pdf,.txt,.md"
                      onChange={(event) => {
                        const next = event.target.files?.[0];
                        if (next) pickFile(next);
                      }}
                    />
                  </label>
                  {error ? (
                    <p className="onboarding-alert" role="alert">
                      {error}
                    </p>
                  ) : null}
                  <div className="onboarding-actions" data-split="true">
                    <button
                      type="button"
                      className="onboarding-btn onboarding-btn-ghost"
                      onClick={() => setBeat("model")}
                    >
                      Back
                    </button>
                    {wantsModel === false ? (
                      <button
                        type="button"
                        className="onboarding-btn onboarding-btn-solid"
                        onClick={() => {
                          setItems([]);
                          setExtracted(null);
                          setBeat("done");
                        }}
                      >
                        Continue
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="onboarding-btn onboarding-btn-solid"
                        disabled={wantsModel !== true || !file || !selected || extracting}
                        onClick={() => void readFile()}
                      >
                        Check the file
                      </button>
                    )}
                  </div>
                </>
              )}
            </>
          ) : null}

          {beat === "address" ? (
            <AddressStep
              address={address}
              city={city}
              stateName={stateName}
              onAddress={setAddress}
              onCity={setCity}
              onState={setStateName}
              onBack={() => setBeat("file")}
              onContinue={(kept) => {
                setAddressDecision(kept ? "keep" : "use");
                setBeat("links");
              }}
            />
          ) : null}

          {beat === "links" ? (
            <LinksStep
              linkedin={linkedin}
              github={github}
              website={website}
              onLinkedin={setLinkedin}
              onGithub={setGithub}
              onWebsite={setWebsite}
              onBack={() => setBeat("address")}
              onContinue={(kept) => {
                setLinksDecision(kept ? "keep" : "use");
                setBeat(items.length > 0 ? "check" : "done");
              }}
            />
          ) : null}

          {beat === "check" && items[index] ? (
            <RoleCheck
              items={items}
              index={index}
              pinPlaces={pinPlaces}
              onPinPlaces={setPinPlaces}
              onPlace={(at, place, lat, lng) => {
                setItems((current) =>
                  current.map((row, rowIndex) => (rowIndex === at ? { ...row, place, lat, lng } : row)),
                );
              }}
              onDrop={() => {
                const next = items.filter((_, rowIndex) => rowIndex !== index);
                setItems(next);
                if (next.length === 0) {
                  setIndex(0);
                  setBeat("done");
                  return;
                }
                if (index >= next.length) setIndex(next.length - 1);
              }}
              onBack={() => {
                if (index === 0) setBeat("links");
                else setIndex((current) => current - 1);
              }}
              onNext={() => {
                if (index + 1 >= items.length) setBeat("done");
                else setIndex((current) => current + 1);
              }}
            />
          ) : null}

          {beat === "done" ? (
            <>
              <p className="onboarding-kicker">Ready</p>
              <h1>
                The map can <em>start.</em>
              </h1>
              <p className="onboarding-lead">
                {file && wantsModel === false
                  ? `${file.name} is here and was not read. Add roles from Career History when you are ready.`
                  : items.length === 0
                    ? file
                      ? "Nothing was kept from the file. Add roles from Career History when you are ready."
                      : "No resume was added. Add roles from Career History when you are ready."
                    : `${items.length} roles are checked.`}
              </p>
              {error ? (
                <p className="onboarding-alert" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="onboarding-actions" data-split="true">
                <button
                  type="button"
                  className="onboarding-btn onboarding-btn-ghost"
                  disabled={busy}
                  onClick={() => setBeat(items.length > 0 ? "check" : wantsModel === false ? "file" : "links")}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="onboarding-btn onboarding-btn-solid"
                  disabled={busy}
                  onClick={() => void finish()}
                >
                  {busy ? "Saving…" : "Continue"}
                </button>
              </div>
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function WashProgress({ beat }: { beat: Beat }) {
  const current =
    beat === "name" ? 0 : beat === "model" ? 1 : beat === "file" ? 2 : beat === "address" ? 3 : beat === "links" ? 4 : 5;
  return (
    <ol className="onboarding-steps" aria-label="Onboarding progress">
      {STEPS.map((label, step) => (
        <li
          key={label}
          data-state={beat === "done" || step < current ? "done" : step === current ? "current" : "upcoming"}
        >
          <span className="onboarding-steps-dot" aria-hidden="true" />
          {label}
        </li>
      ))}
    </ol>
  );
}

function YesNo({
  value,
  onYes,
  onNo,
}: {
  value: boolean | null;
  onYes: () => void;
  onNo: () => void;
}) {
  return (
    <div className="onboarding-chips">
      <button type="button" aria-pressed={value === true} onClick={onYes}>
        Yes
      </button>
      <button type="button" aria-pressed={value === false} onClick={onNo}>
        No
      </button>
    </div>
  );
}

function LocalModels({
  localProbe,
  detectedLocal,
  endpointMode,
  selected,
  localUrl,
  onPickDetected,
  onCustomUrl,
  onCustomModel,
}: {
  localProbe: "pending" | "ready";
  detectedLocal: { label: string; models: string[] } | null;
  endpointMode: "detected" | "custom" | null;
  selected: string;
  localUrl: string;
  onPickDetected: (id: string) => void;
  onCustomUrl: (value: string) => void;
  onCustomModel: (value: string) => void;
}) {
  const customUrl = localUrl.trim();
  return (
    <>
      {localProbe !== "ready" ? (
        <p className="onboarding-quiet">Looking on this machine…</p>
      ) : detectedLocal ? (
        <p className="onboarding-quiet">{detectedLocal.label} was detected.</p>
      ) : (
        <p className="onboarding-quiet">No local server was detected.</p>
      )}
      {detectedLocal && detectedLocal.models.length > 0 ? (
        <div className="onboarding-chips">
          {detectedLocal.models.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={endpointMode === "detected" && id === selected}
              onClick={() => onPickDetected(id)}
            >
              {presentModelId(id)}
            </button>
          ))}
        </div>
      ) : detectedLocal && localProbe === "ready" ? (
        <p className="onboarding-quiet">It listed no chat models.</p>
      ) : null}
      <p className="onboarding-quiet">Another endpoint</p>
      <label className="onboarding-field">
        <span>Base URL</span>
        <input
          value={localUrl}
          autoComplete="off"
          placeholder="http://127.0.0.1:8080/v1"
          onChange={(event) => onCustomUrl(event.target.value)}
        />
      </label>
      <label className="onboarding-field">
        <span>Model</span>
        <input
          value={endpointMode === "custom" ? selected : ""}
          autoComplete="off"
          placeholder="model name"
          onChange={(event) => onCustomModel(event.target.value)}
        />
      </label>
      {customUrl && !isHttpUrl(customUrl) ? <p className="onboarding-quiet">Use an http(s) URL.</p> : null}
    </>
  );
}

const READ_PHASES = [
  "Sending the resume",
  "The model is reading it",
  "Looking for an address",
  "Looking for links",
  "Looking for roles",
];

function ReadProgress({ model }: { model: string }) {
  const [phase, setPhase] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => {
      const seconds = Math.floor((Date.now() - started) / 1000);
      setElapsed(seconds);
      setPhase(Math.min(READ_PHASES.length - 1, Math.floor(seconds / 5)));
    }, 500);
    return () => window.clearInterval(timer);
  }, []);
  const label = phase === 1 && model ? `${model} is reading it` : READ_PHASES[phase];
  const width = Math.min(88, 14 + phase * 16);
  const clock = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;
  return (
    <div className="onboarding-read" role="status" aria-live="polite">
      <p className="onboarding-lead">{label}</p>
      <div className="onboarding-read-track" aria-hidden="true">
        <div className="onboarding-read-bar" style={{ ["--read" as string]: width / 100 }} />
      </div>
      <p className="onboarding-quiet">{clock} — still working. A resume can take a minute.</p>
    </div>
  );
}

function AddressStep({
  address,
  city,
  stateName,
  onAddress,
  onCity,
  onState,
  onBack,
  onContinue,
}: {
  address: string;
  city: string;
  stateName: string;
  onAddress: (value: string) => void;
  onCity: (value: string) => void;
  onState: (value: string) => void;
  onBack: () => void;
  onContinue: (kept: boolean) => void;
}) {
  const [fromFile] = useState(() => Boolean(address.trim() || city.trim() || stateName.trim()));
  const [give, setGive] = useState<boolean | null>(fromFile ? true : null);
  const ready = give === false || (give === true && Boolean(address.trim() || city.trim()));
  return (
    <>
      <p className="onboarding-kicker">Address</p>
      {fromFile ? (
        <>
          <h1>
            Is this <em>address</em> right?
          </h1>
          <p className="onboarding-lead">From the resume. Change anything that is wrong.</p>
          <AddressFields
            address={address}
            city={city}
            stateName={stateName}
            onAddress={onAddress}
            onCity={onCity}
            onState={onState}
          />
        </>
      ) : (
        <>
          <h1>
            Add your <em>address?</em>
          </h1>
          <p className="onboarding-lead">Nothing was in the file.</p>
          <YesNo value={give} onYes={() => setGive(true)} onNo={() => setGive(false)} />
          {give === true ? (
            <AddressFields
              address={address}
              city={city}
              stateName={stateName}
              onAddress={onAddress}
              onCity={onCity}
              onState={onState}
            />
          ) : null}
        </>
      )}
      <div className="onboarding-actions" data-split="true">
        <button type="button" className="onboarding-btn onboarding-btn-ghost" onClick={onBack}>
          Back
        </button>
        <button
          type="button"
          className="onboarding-btn onboarding-btn-solid"
          disabled={!ready}
          onClick={() => onContinue(give === false)}
        >
          {fromFile ? "Looks right" : "Continue"}
        </button>
      </div>
    </>
  );
}

function AddressFields({
  address,
  city,
  stateName,
  onAddress,
  onCity,
  onState,
}: {
  address: string;
  city: string;
  stateName: string;
  onAddress: (value: string) => void;
  onCity: (value: string) => void;
  onState: (value: string) => void;
}) {
  const [hits, setHits] = useState<PlaceHit[]>([]);
  const applied = useRef("");
  useEffect(() => {
    const query = address.trim();
    if (query.length < 3 || query === applied.current) {
      setHits([]);
      return;
    }
    let cancel = false;
    const timer = window.setTimeout(() => {
      void searchPlaces(query).then((result) => {
        if (!cancel) setHits(result?.places.slice(0, 5) ?? []);
      });
    }, 280);
    return () => {
      cancel = true;
      window.clearTimeout(timer);
    };
  }, [address]);

  function choose(hit: PlaceHit) {
    const parts = hit.address
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    if (/^(usa|united states)$/i.test(parts[parts.length - 1] ?? "")) parts.pop();
    const street = parts[0] ?? hit.address;
    applied.current = street;
    onAddress(street);
    onCity(parts[1] ?? "");
    onState((parts[2] ?? "").replace(/\s+\d[\d\s-]*$/, "").trim());
    setHits([]);
  }

  return (
    <>
      <label className="onboarding-field">
        <span>Street</span>
        <input
          value={address}
          autoComplete="off"
          role="combobox"
          aria-expanded={hits.length > 0}
          aria-autocomplete="list"
          onChange={(event) => {
            applied.current = "";
            onAddress(event.target.value);
          }}
        />
      </label>
      {hits.length > 0 ? (
        <ul className="onboarding-suggest" role="listbox">
          {hits.map((hit) => (
            <li key={`${hit.address}-${hit.latitude}`}>
              <button type="button" onClick={() => choose(hit)}>
                {hit.address}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="onboarding-field-row">
        <label className="onboarding-field">
          <span>City</span>
          <input value={city} autoComplete="address-level2" onChange={(event) => onCity(event.target.value)} />
        </label>
        <label className="onboarding-field">
          <span>State</span>
          <input value={stateName} autoComplete="address-level1" onChange={(event) => onState(event.target.value)} />
        </label>
      </div>
    </>
  );
}

function LinksStep({
  linkedin,
  github,
  website,
  onLinkedin,
  onGithub,
  onWebsite,
  onBack,
  onContinue,
}: {
  linkedin: string;
  github: string;
  website: string;
  onLinkedin: (value: string) => void;
  onGithub: (value: string) => void;
  onWebsite: (value: string) => void;
  onBack: () => void;
  onContinue: (kept: boolean) => void;
}) {
  const typed = [linkedin, github, website].map((value) => value.trim()).filter(Boolean);
  const linksReady = typed.every((value) => isHttpUrl(value));
  const [fromFile] = useState(() => Boolean(linkedin.trim() || github.trim() || website.trim()));
  const [give, setGive] = useState<boolean | null>(fromFile ? true : null);
  const ready = give === false || (give === true && typed.length > 0 && linksReady);
  return (
    <>
      <p className="onboarding-kicker">Links</p>
      {fromFile ? (
        <>
          <h1>
            Are these <em>links</em> right?
          </h1>
          <p className="onboarding-lead">From the resume. Change anything that is wrong.</p>
          <LinkFields
            linkedin={linkedin}
            github={github}
            website={website}
            onLinkedin={onLinkedin}
            onGithub={onGithub}
            onWebsite={onWebsite}
          />
          {!linksReady ? <p className="onboarding-quiet">Use an http(s) link.</p> : null}
        </>
      ) : (
        <>
          <h1>
            Add LinkedIn, GitHub, <em>or a site?</em>
          </h1>
          <p className="onboarding-lead">Nothing was in the file.</p>
          <YesNo value={give} onYes={() => setGive(true)} onNo={() => setGive(false)} />
          {give === true ? (
            <LinkFields
              linkedin={linkedin}
              github={github}
              website={website}
              onLinkedin={onLinkedin}
              onGithub={onGithub}
              onWebsite={onWebsite}
            />
          ) : null}
          {give === true && typed.length > 0 && !linksReady ? (
            <p className="onboarding-quiet">Use an http(s) link.</p>
          ) : null}
        </>
      )}
      <div className="onboarding-actions" data-split="true">
        <button type="button" className="onboarding-btn onboarding-btn-ghost" onClick={onBack}>
          Back
        </button>
        <button
          type="button"
          className="onboarding-btn onboarding-btn-solid"
          disabled={!ready}
          onClick={() => onContinue(give === false)}
        >
          {fromFile ? "Looks right" : "Continue"}
        </button>
      </div>
    </>
  );
}

function LinkFields({
  linkedin,
  github,
  website,
  onLinkedin,
  onGithub,
  onWebsite,
}: {
  linkedin: string;
  github: string;
  website: string;
  onLinkedin: (value: string) => void;
  onGithub: (value: string) => void;
  onWebsite: (value: string) => void;
}) {
  return (
    <>
      <label className="onboarding-field">
        <span>LinkedIn</span>
        <input
          value={linkedin}
          autoComplete="url"
          placeholder="https://www.linkedin.com/in/…"
          onChange={(event) => onLinkedin(event.target.value)}
        />
      </label>
      <label className="onboarding-field">
        <span>GitHub</span>
        <input
          value={github}
          autoComplete="url"
          placeholder="https://github.com/…"
          onChange={(event) => onGithub(event.target.value)}
        />
      </label>
      <label className="onboarding-field">
        <span>Site</span>
        <input
          value={website}
          autoComplete="url"
          placeholder="https://"
          onChange={(event) => onWebsite(event.target.value)}
        />
      </label>
    </>
  );
}

function RoleCheck({
  items,
  index,
  pinPlaces,
  onPinPlaces,
  onPlace,
  onDrop,
  onBack,
  onNext,
}: {
  items: CheckItem[];
  index: number;
  pinPlaces: "each" | "skip" | null;
  onPinPlaces: (value: "each" | "skip") => void;
  onPlace: (index: number, place: string, lat: number, lng: number) => void;
  onDrop: () => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const item = items[index];
  const [manual, setManual] = useState(false);
  useEffect(() => {
    setManual(false);
  }, [index, item?.org]);
  if (!item) return null;
  const placed = item.lat != null && item.lng != null;
  const firstUnpinned = items.findIndex((row) => row.lat == null);
  const ask = pinPlaces === null && index === firstUnpinned;
  const editing = (pinPlaces === "each" && !placed) || manual;
  return (
    <>
      <p className="onboarding-kicker">
        Check {index + 1} of {items.length}
      </p>
      <h1>
        Did this get <em>{item.org}</em> right?
      </h1>
      <p className="onboarding-meta">
        <span>
          {item.kind} · {item.title}
        </span>
        {item.span ? <span>{item.span}</span> : null}
      </p>
      <div className="onboarding-place">
        <span className="onboarding-pin" data-set={placed ? "true" : "false"} aria-hidden="true" />
        <div>
          <strong>{item.place}</strong>
          <span>{placed ? "On the map" : "No pin yet"}</span>
        </div>
        {!placed && pinPlaces === "skip" && !manual ? (
          <button type="button" className="onboarding-place-action" onClick={() => setManual(true)}>
            Add a street
          </button>
        ) : null}
        {placed ? (
          <button type="button" className="onboarding-place-action" onClick={() => setManual((open) => !open)}>
            {manual ? "Close" : "Change"}
          </button>
        ) : null}
      </div>
      {ask ? (
        <div className="onboarding-pin-ask">
          <p>Add a street for each role?</p>
          <YesNo value={null} onYes={() => onPinPlaces("each")} onNo={() => onPinPlaces("skip")} />
        </div>
      ) : null}
      {editing || placed ? (
        <RolePlacePicker
          key={`${index}-${item.org}`}
          seed={item.place}
          searching={editing}
          pinned={placed ? [item.lat as number, item.lng as number] : null}
          onChoose={(place, lat, lng) => {
            onPlace(index, place, lat, lng);
            setManual(false);
          }}
        />
      ) : null}
      <RoleNotes lines={item.lines} />
      <div className="onboarding-actions" data-split="true">
        <button type="button" className="onboarding-btn onboarding-btn-ghost" onClick={onBack}>
          Back
        </button>
        <div className="onboarding-action-pair">
          <button type="button" className="onboarding-btn onboarding-btn-ghost" onClick={onDrop}>
            Not this one
          </button>
          <button type="button" className="onboarding-btn onboarding-btn-solid" onClick={onNext}>
            Looks right
          </button>
        </div>
      </div>
    </>
  );
}

function RoleNotes({ lines }: { lines: string[] }) {
  const [open, setOpen] = useState(false);
  if (lines.length === 0) return <p className="onboarding-quiet">No duties were read from the file.</p>;
  const long = lines.length > 1 || lines[0].length > 140;
  return (
    <div className="onboarding-notes">
      <p className={open ? "onboarding-quiet" : "onboarding-quiet onboarding-note-clamp"}>{lines[0]}</p>
      {long ? (
        <button
          type="button"
          className="onboarding-notes-toggle"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          {open ? "Hide the notes" : `${lines.length} notes from the file`}
        </button>
      ) : null}
      {open && lines.length > 1 ? (
        <ul className="onboarding-work">
          {lines.slice(1).map((line, lineIndex) => (
            <li key={`${lineIndex}-${line.slice(0, 24)}`}>{line}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function RolePlacePicker({
  seed,
  searching,
  pinned,
  onChoose,
}: {
  seed: string;
  searching: boolean;
  pinned: [number, number] | null;
  onChoose: (place: string, lat: number, lng: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PlaceHit[]>([]);
  const [center, setCenter] = useState<[number, number] | null>(pinned);
  const [looking, setLooking] = useState(false);
  useEffect(() => {
    if (pinned) return;
    const place = seed.trim();
    if (place.length < 3 || place === "No place yet") return;
    let cancel = false;
    void searchPlaces(place).then((result) => {
      const hit = result?.places[0];
      if (!cancel && hit) setCenter([hit.latitude, hit.longitude]);
    });
    return () => {
      cancel = true;
    };
  }, [pinned, seed]);
  useEffect(() => {
    const text = query.trim();
    if (text.length < 3) {
      setHits([]);
      return;
    }
    let cancel = false;
    const timer = window.setTimeout(() => {
      void searchPlaces(text).then((result) => {
        if (!cancel) setHits(result?.places.slice(0, 5) ?? []);
      });
    }, 280);
    return () => {
      cancel = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  function choose(hit: PlaceHit) {
    setHits([]);
    setQuery("");
    setCenter([hit.latitude, hit.longitude]);
    onChoose(streetLabel(hit.address), hit.latitude, hit.longitude);
  }

  async function drop(lat: number, lng: number) {
    setLooking(true);
    setCenter([lat, lng]);
    setHits([]);
    const result = await reversePlace(lat, lng);
    setLooking(false);
    const hit = result?.place ?? result?.places[0];
    if (!hit) return;
    onChoose(streetLabel(hit.address || hit.label), hit.latitude, hit.longitude);
  }

  return (
    <div>
      {searching ? (
        <>
          <label className="onboarding-field">
            <span>Street or place</span>
            <input
              value={query}
              autoComplete="off"
              placeholder={seed === "No place yet" ? "Street, city" : seed}
              role="combobox"
              aria-expanded={hits.length > 0}
              aria-autocomplete="list"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          {hits.length > 0 ? (
            <ul className="onboarding-suggest" role="listbox">
              {hits.map((hit) => (
                <li key={`${hit.address}-${hit.latitude}`}>
                  <button type="button" onClick={() => choose(hit)}>
                    {hit.address}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="onboarding-quiet">Type a street, or click the map.</p>
        </>
      ) : (
        <p className="onboarding-quiet">Click the map to move it.</p>
      )}
      <div className="onboarding-role-map">
        <MapContainer center={center ?? [39.8283, -98.5795]} zoom={center ? 12 : 4} scrollWheelZoom={false}>
          <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <MapFrame center={center} />
          <MapDrop onDrop={(lat, lng) => void drop(lat, lng)} />
          {center ? (
            <CircleMarker
              center={center}
              radius={8}
              pathOptions={{ color: "#f2d19b", fillColor: "#c4a574", fillOpacity: 1, weight: 2 }}
            />
          ) : null}
        </MapContainer>
      </div>
      {looking ? <p className="onboarding-quiet">Looking up that spot.</p> : null}
    </div>
  );
}

function MapFrame({ center }: { center: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (!center) return;
    map.setView(center, 12);
  }, [map, center]);
  return null;
}

function MapDrop({ onDrop }: { onDrop: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(event) {
      onDrop(event.latlng.lat, event.latlng.lng);
    },
  });
  return null;
}

function keptHistory(extracted: ExtractedResume, items: CheckItem[]): ExtractedResume {
  const experience = items
    .filter((item) => item.source === "job")
    .map((item) => {
      const job = extracted.experience[item.sourceIndex];
      if (!job) return null;
      const place = item.place === "No place yet" ? job.location : item.place;
      const site =
        item.lat != null && item.lng != null
          ? { label: place, address: place, latitude: item.lat, longitude: item.lng }
          : job.site;
      return { ...job, location: place, site };
    })
    .filter((job): job is ExtractedJob => job != null);
  const education = items
    .filter((item) => item.source === "school")
    .map((item) => {
      const school = extracted.education[item.sourceIndex];
      if (!school) return null;
      const place = item.place === "No place yet" ? school.location : item.place;
      return { ...school, location: place };
    })
    .filter((school): school is ExtractedSchool => school != null);
  return { ...extracted, experience, education };
}

function toCheckItems(data: ExtractedResume): CheckItem[] {
  const jobs = data.experience.map((job, sourceIndex) => ({
    source: "job" as const,
    sourceIndex,
    kind: "Job" as const,
    org: job.company || "Untitled role",
    title: job.title || "Role",
    place: job.site?.label || job.location || "No place yet",
    span: formatCareerSpan(job.startDate, job.endDate, job.isCurrent),
    lines: [...job.achievements, job.description].map((line) => line.trim()).filter(Boolean),
    lat: job.site?.latitude ?? null,
    lng: job.site?.longitude ?? null,
  }));
  const schools = data.education.map((school, sourceIndex) => ({
    source: "school" as const,
    sourceIndex,
    kind: "School" as const,
    org: school.institution || "Untitled school",
    title: [school.degree, school.field].filter(Boolean).join(", ") || "School",
    place: school.location || "No place yet",
    span: formatCareerSpan(school.startDate, school.endDate, false),
    lines: school.description.trim() ? [school.description.trim()] : [],
    lat: null,
    lng: null,
  }));
  return [...jobs, ...schools];
}

function streetLabel(address: string): string {
  const parts = address
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (/^(usa|united states)$/i.test(parts[parts.length - 1] ?? "")) parts.pop();
  return parts.join(", ") || address;
}

function httpOrEmpty(value: string): string {
  const trimmed = value.trim();
  return isHttpUrl(trimmed) ? trimmed : "";
}

function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts.slice(0, -1).join(" "), last: parts.at(-1) ?? "" };
}
