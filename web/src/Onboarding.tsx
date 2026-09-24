import { useEffect, useRef, useState } from "react";
import { isHttpUrl, OPENAI_BASE_URL, type ModelHosting } from "@core/model-connection";
import {
  planModelOnboarding,
  presentModelId,
  type LocalProbeResult,
} from "@core/model-onboarding";
import {
  keptOnboardingHistory,
  onboardingCheckItems,
  profileAfterOnboarding,
  type OnboardingCheckItem,
  type OnboardingLinkAnswer,
  type OnboardingPlaceAnswer,
} from "@core/onboarding-review";
import { prepareProfile, type ProfileFields } from "@core/profile";
import { splitPlaceLabel, type ExtractedResume } from "@core/resume-extract";
import { AddressStep } from "./OnboardingAddress";
import { RoleCheck } from "./OnboardingCheck";
import { LinksStep } from "./OnboardingLinks";
import type { OnboardingProfileValue } from "./OnboardingProfile";
import { YesNo } from "./onboarding-offer";
import "./onboarding.css";

type Me = {
  occupant: { id: string };
  profile: OnboardingProfileValue & { onboardingCompletedAt: string | null };
};

type OnboardingStep = "name" | "model" | "file" | "address" | "links" | "check" | "done";

const STEP_INDEX: Record<OnboardingStep, number> = {
  name: 0,
  model: 1,
  file: 2,
  address: 3,
  links: 4,
  check: 5,
  done: 5,
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
  const [place, setPlace] = useState<OnboardingPlaceAnswer>({ street: "", city: "", state: "" });
  const [links, setLinks] = useState<OnboardingLinkAnswer>({
    linkedinUrl: "",
    githubUrl: "",
    portfolioUrl: "",
  });
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
  const [step, setStep] = useState<OnboardingStep>("name");
  const [index, setIndex] = useState(0);
  const [items, setItems] = useState<OnboardingCheckItem[]>([]);
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
    if (step === "address" || step === "links" || step === "check" || step === "done") setStep("file");
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
      const next = onboardingCheckItems(body.data);
      const foundPlace = splitPlaceLabel(body.data.profile.location);
      const foundProfile = Boolean(
        foundPlace.city ||
          body.data.profile.linkedinUrl.trim() ||
          body.data.profile.githubUrl.trim() ||
          body.data.profile.website.trim(),
      );
      if (next.length === 0 && body.data.education.length === 0 && !foundProfile) {
        setError("The model did not find roles, schools, an address, or links in that file.");
        return;
      }
      setExtracted(body.data);
      setPlace({ street: "", city: foundPlace.city, state: foundPlace.state });
      setLinks({
        linkedinUrl: httpOrEmpty(body.data.profile.linkedinUrl),
        githubUrl: httpOrEmpty(body.data.profile.githubUrl),
        portfolioUrl: httpOrEmpty(body.data.profile.website),
      });
      setAddressDecision(null);
      setLinksDecision(null);
      setItems(next);
      setPinPlaces(null);
      setIndex(0);
      setStep("address");
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
      const draft = profileAfterOnboarding({
        current: profileRef.current,
        extracted: extracted?.profile ?? null,
        fullName: `${firstName} ${lastName}`.replace(/\s+/g, " ").trim(),
        place: addressDecision === "use" ? place : null,
        links: linksDecision === "use" ? links : null,
      });
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
        const history = keptOnboardingHistory(extracted, items);
        if (history.experience.length > 0 || history.education.length > 0) {
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
        <WashProgress step={step} />
        <section className="onboarding-card" data-wide={step === "check" ? "true" : undefined}>
          {step === "name" ? (
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
                  onClick={() => setStep("model")}
                >
                  Continue
                </button>
              </div>
            </>
          ) : null}

          {step === "model" ? (
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
                <button type="button" className="onboarding-btn onboarding-btn-ghost" onClick={() => setStep("name")}>
                  Back
                </button>
                <button
                  type="button"
                  className="onboarding-btn onboarding-btn-solid"
                  disabled={!modelReady}
                  onClick={() => {
                    setError(null);
                    setStep("file");
                  }}
                >
                  Continue
                </button>
              </div>
            </>
          ) : null}

          {step === "file" ? (
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
                      onClick={() => setStep("model")}
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
                          setStep("done");
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

          {step === "address" ? (
            <AddressStep
              place={place}
              onPlace={setPlace}
              onBack={() => setStep("file")}
              onContinue={(skipped) => {
                setAddressDecision(skipped ? "keep" : "use");
                setStep("links");
              }}
            />
          ) : null}

          {step === "links" ? (
            <LinksStep
              links={links}
              onLinks={setLinks}
              onBack={() => setStep("address")}
              onContinue={(skipped) => {
                setLinksDecision(skipped ? "keep" : "use");
                setStep(items.length > 0 ? "check" : "done");
              }}
            />
          ) : null}

          {step === "check" && items[index] ? (
            <RoleCheck
              items={items}
              index={index}
              pinPlaces={pinPlaces}
              onPinPlaces={setPinPlaces}
              onPlace={(at, label, lat, lng) => {
                setItems((current) =>
                  current.map((row, rowIndex) => (rowIndex === at ? { ...row, place: label, lat, lng } : row)),
                );
              }}
              onDrop={() => {
                const next = items.filter((_, rowIndex) => rowIndex !== index);
                setItems(next);
                if (next.length === 0) {
                  setIndex(0);
                  setStep("done");
                  return;
                }
                if (index >= next.length) setIndex(next.length - 1);
              }}
              onBack={() => {
                if (index === 0) setStep("links");
                else setIndex((current) => current - 1);
              }}
              onNext={() => {
                if (index + 1 >= items.length) setStep("done");
                else setIndex((current) => current + 1);
              }}
            />
          ) : null}

          {step === "done" ? (
            <>
              <p className="onboarding-kicker">Ready</p>
              <h1>
                The map can <em>start.</em>
              </h1>
              <p className="onboarding-lead">
                {file && wantsModel === false
                  ? `${file.name} is here and was not read. Add roles from Career History when you are ready.`
                  : items.length === 0
                    ? extracted && extracted.education.length > 0
                      ? "Schools from the file are kept. Add roles from Career History when you are ready."
                      : file
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
                  onClick={() => setStep(items.length > 0 ? "check" : wantsModel === false ? "file" : "links")}
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

function WashProgress({ step }: { step: OnboardingStep }) {
  const current = STEP_INDEX[step];
  return (
    <ol className="onboarding-steps" aria-label="Onboarding progress">
      {STEPS.map((label, index) => (
        <li
          key={label}
          data-state={step === "done" || index < current ? "done" : index === current ? "current" : "upcoming"}
        >
          <span className="onboarding-steps-dot" aria-hidden="true" />
          {label}
        </li>
      ))}
    </ol>
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
