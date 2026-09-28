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
import { isAvatarType, prepareProfile, PROFILE_AVATAR_MAX_BYTES, type ProfileFields } from "@core/profile";
import type { ExtractedResume } from "@core/resume-extract";
import { AddressFields } from "./OnboardingAddress";
import { CheckOverview, ResumePreview } from "./OnboardingCheck";
import { LinkFields } from "./OnboardingLinks";
import type { OnboardingProfileValue } from "./OnboardingProfile";
import { YesNo } from "./onboarding-offer";
import "./onboarding.css";

type Me = {
  occupant: { id: string };
  profile: OnboardingProfileValue & { onboardingCompletedAt: string | null };
};

type OnboardingStep = "name" | "model" | "file" | "check";

const STEP_INDEX: Record<OnboardingStep, number> = {
  name: 0,
  model: 1,
  file: 2,
  check: 3,
};

const STEPS = ["Profile", "Model", "Resume", "Verify"] as const;

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
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(initialProfile.avatarUrl);
  const [place, setPlace] = useState<OnboardingPlaceAnswer>({
    street: initialProfile.address,
    city: initialProfile.city,
    state: initialProfile.state,
  });
  const [links, setLinks] = useState<OnboardingLinkAnswer>({
    linkedinUrl: initialProfile.linkedinUrl,
    githubUrl: initialProfile.githubUrl,
    portfolioUrl: initialProfile.portfolioUrl,
  });
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
  const [previewOpen, setPreviewOpen] = useState(false);
  const [step, setStep] = useState<OnboardingStep>("name");
  const [items, setItems] = useState<OnboardingCheckItem[]>([]);
  const [extracted, setExtracted] = useState<ExtractedResume | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const profileRef = useRef<ProfileFields>(initialProfile);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!photo) return;
    const url = URL.createObjectURL(photo);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

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

  function pickPhoto(next: File | null) {
    if (!next) {
      setPhoto(null);
      return;
    }
    if (!isAvatarType(next.type)) {
      setError("Use a jpeg, png, webp, or gif photo.");
      return;
    }
    if (next.size > PROFILE_AVATAR_MAX_BYTES) {
      setError("That photo is too large (5 MB max).");
      return;
    }
    setError(null);
    setPhoto(next);
  }

  function pickFile(next: File) {
    abortRef.current?.abort();
    setPreviewOpen(false);
    setFile(next);
    setItems([]);
    setExtracted(null);
    setError(null);
    setExtracting(false);
    if (step === "check") setStep("file");
  }

  function continueWithoutRead() {
    setItems([]);
    setExtracted(null);
    setError(null);
    void finish([], false);
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
      if (next.length === 0) {
        setError("The model did not find roles or schools in that file.");
        return;
      }
      setExtracted(body.data);
      setItems(next);
      setStep("check");
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

  async function finish(kept: OnboardingCheckItem[] = items, includeHistory = true) {
    setBusy(true);
    setError(null);
    try {
      const draft = profileAfterOnboarding({
        current: profileRef.current,
        extracted: extracted?.profile ?? null,
        fullName: `${firstName} ${lastName}`.replace(/\s+/g, " ").trim(),
        place,
        links,
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
      if (photo) {
        const avatar = new FormData();
        avatar.append("avatar", photo);
        const uploadedPhoto = await fetch("/api/profile/avatar", { method: "POST", body: avatar });
        const photoBody = (await uploadedPhoto.json()) as { error?: string };
        if (!uploadedPhoto.ok) {
          setError(photoBody.error ?? "Could not save the photo.");
          return;
        }
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
      if (includeHistory && extracted) {
        const history = keptOnboardingHistory(extracted, kept);
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

  const notes = notesForStep();

  function notesForStep(): string[] {
    if (step === "name") {
      return ["These details can be revised, and more can be added, in the Profile section."];
    }
    if (step === "model") {
      const lines = [
        "If you choose to go with a cloud model, there's a chance that cloud providers could read what you send, retain, report, and train models on your data.",
      ];
      if (wantsModel === false) {
        lines.push(
          "You can still add the resume next. It will not be read. Jobs and schools can be added later from Career History.",
        );
      }
      return lines;
    }
    if (step === "file" && !extracting) {
      return [
        "We'll extract the career details from your resume. It can be done later if now is not the right time.",
      ];
    }
    if (step === "check") {
      return [
        "We advise going through each one. A model can hallucinate, and the read can produce incorrect information or miss things.",
        "These details can be revised later as well.",
      ];
    }
    return [];
  }

  return (
    <div className="onboarding">
      <div className="onboarding-stage">
        <WashProgress step={step} />
        <div className="onboarding-sheet" data-wide={step === "check" ? "true" : undefined}>
        <section className="onboarding-card">
          {step === "name" ? (
            <ProfileStep
              firstName={firstName}
              lastName={lastName}
              photoPreview={photoPreview}
              place={place}
              links={links}
              error={error}
              onFirstName={setFirstName}
              onLastName={setLastName}
              onPhoto={pickPhoto}
              onPlace={setPlace}
              onLinks={setLinks}
              onContinue={() => {
                setError(null);
                setStep("model");
              }}
            />
          ) : null}

          {step === "model" ? (
            <>
              <p className="onboarding-kicker">Model</p>
              <h1>
                Connect to a <em>model?</em>
              </h1>
              {wantsModel === true ? (
                <div className="onboarding-detect">
                  <section className="onboarding-detect-row" data-open={hosting === "local" ? "true" : "false"}>
                    <button
                      type="button"
                      className="onboarding-detect-head"
                      aria-expanded={hosting === "local"}
                      onClick={() => {
                        setHosting("local");
                        setSelected("");
                        setCloudKey("");
                        setEndpointMode(null);
                        setLocalUrl("");
                        setBaseUrl(detectedUrl);
                      }}
                    >
                      <strong>{detectedLocal?.label ?? "Local"}</strong>
                      <span>
                        {localProbe !== "ready" ? "Checking…" : detectedLocal ? "Detected" : "Not found"}
                      </span>
                    </button>
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
                        onOpenCustom={() => {
                          setEndpointMode("custom");
                          setSelected("");
                          setLocalUrl("");
                          setBaseUrl("");
                        }}
                        onCloseCustom={() => {
                          setEndpointMode(null);
                          setSelected("");
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
                  </section>
                  <section className="onboarding-detect-row" data-open={hosting === "cloud" ? "true" : "false"}>
                    <button
                      type="button"
                      className="onboarding-detect-head"
                      aria-expanded={hosting === "cloud"}
                      onClick={() => {
                        setHosting("cloud");
                        setSelected("");
                        setEndpointMode(null);
                        setLocalUrl("");
                      }}
                    >
                      <strong>Cloud</strong>
                      <span>{hosting === "cloud" && selected.trim() && cloudKey.trim() ? "Ready" : "Needs a key"}</span>
                    </button>
                    {hosting === "cloud" ? (
                      <div className="onboarding-detect-body">
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
                      </div>
                    ) : null}
                  </section>
                </div>
              ) : null}
              {error ? (
                <p className="onboarding-alert" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="onboarding-actions" data-split="true">
                <button
                  type="button"
                  className="onboarding-btn onboarding-btn-ghost"
                  onClick={() => {
                    setWantsModel(null);
                    setHosting(null);
                    setSelected("");
                    setCloudKey("");
                    setEndpointMode(null);
                    setLocalUrl("");
                    setBaseUrl(detectedUrl);
                    setError(null);
                    setStep("name");
                  }}
                >
                  Back
                </button>
                {wantsModel === true ? (
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
                ) : (
                  <YesNo
                    onYes={() => {
                      setWantsModel(true);
                      if (detectedLocal) {
                        setHosting("local");
                        setBaseUrl(detectedUrl);
                        setSelected("");
                        setCloudKey("");
                        setEndpointMode(null);
                        setLocalUrl("");
                      }
                    }}
                    onNo={() => {
                      setWantsModel(false);
                      setHosting(null);
                      setSelected("");
                      setCloudKey("");
                      setEndpointMode(null);
                      setLocalUrl("");
                      setError(null);
                      setStep("file");
                    }}
                  />
                )}
              </div>
            </>
          ) : null}

          {step === "file" ? (
            <>
              <p className="onboarding-kicker">Resume</p>
              <h1>
                {extracting ? (
                  <>
                    Reading the <em>resume.</em>
                  </>
                ) : (
                  <>
                    Import your most up-to-date <em>resume.</em>
                  </>
                )}
              </h1>
              {extracting ? (
                <ReadProgress model={presentModelId(selected)} />
              ) : (
                <>
                  {file ? (
                    <div className="onboarding-file onboarding-file-picked">
                      <span className="onboarding-file-name" title={file.name}>
                        {file.name}
                      </span>
                      <span className="onboarding-file-actions">
                        <button
                          type="button"
                          className="onboarding-btn onboarding-btn-ghost onboarding-file-preview"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          Replace
                        </button>
                        <button
                          type="button"
                          className="onboarding-btn onboarding-btn-ghost onboarding-file-preview"
                          onClick={() => setPreviewOpen((open) => !open)}
                        >
                          {previewOpen ? "Hide preview" : "Preview"}
                        </button>
                      </span>
                    </div>
                  ) : (
                    <label className="onboarding-file">
                      Drop a PDF here, or click to choose
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="application/pdf,text/plain,.pdf,.txt,.md"
                        onChange={(event) => {
                          const next = event.target.files?.[0];
                          if (next) pickFile(next);
                        }}
                      />
                    </label>
                  )}
                  {file && previewOpen ? <ResumePreview file={file} /> : null}
                  {file ? (
                    <input
                      ref={fileInputRef}
                      type="file"
                      hidden
                      accept="application/pdf,text/plain,.pdf,.txt,.md"
                      onChange={(event) => {
                        const next = event.target.files?.[0];
                        event.target.value = "";
                        if (next) pickFile(next);
                      }}
                    />
                  ) : null}
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
                    <div className="onboarding-action-pair">
                      {wantsModel === true && file ? (
                        <button
                          type="button"
                          className="onboarding-btn onboarding-btn-solid"
                          disabled={!selected || extracting}
                          onClick={() => void readFile()}
                        >
                          Extract job data
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="onboarding-btn onboarding-btn-solid"
                          disabled={busy}
                          onClick={continueWithoutRead}
                        >
                          {busy ? "Saving…" : "Continue"}
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </>
          ) : null}

          {step === "check" ? (
            <CheckOverview
              items={items}
              file={file}
              busy={busy}
              error={error}
              onChange={setItems}
              onBack={() => setStep("file")}
              onContinue={(kept) => void finish(kept)}
            />
          ) : null}
        </section>
        {notes.length > 0 ? (
          <div className="onboarding-footnote">
            {notes.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        ) : null}
        </div>
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
          data-state={index < current ? "done" : index === current ? "current" : "upcoming"}
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
  onOpenCustom,
  onCloseCustom,
  onCustomUrl,
  onCustomModel,
}: {
  localProbe: "pending" | "ready";
  detectedLocal: { label: string; models: string[] } | null;
  endpointMode: "detected" | "custom" | null;
  selected: string;
  localUrl: string;
  onPickDetected: (id: string) => void;
  onOpenCustom: () => void;
  onCloseCustom: () => void;
  onCustomUrl: (value: string) => void;
  onCustomModel: (value: string) => void;
}) {
  const customUrl = localUrl.trim();
  const hasModels = Boolean(detectedLocal && detectedLocal.models.length > 0);
  return (
    <div className="onboarding-detect-body">
      {detectedLocal && localProbe === "ready" && !hasModels ? (
        <p className="onboarding-quiet">It listed no chat models.</p>
      ) : null}
      {hasModels ? (
        <div className="onboarding-detect-models">
          {detectedLocal?.models.map((id) => {
            const picked = endpointMode === "detected" && id === selected;
            return (
              <button
                key={id}
                type="button"
                className="onboarding-detect-model"
                aria-pressed={picked}
                onClick={() => onPickDetected(id)}
              >
                <span>{presentModelId(id)}</span>
                {picked ? <span>Ready</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}
      {hasModels ? (
        <button
          type="button"
          className="onboarding-detect-model"
          aria-pressed={endpointMode === "custom"}
          onClick={() => (endpointMode === "custom" ? onCloseCustom() : onOpenCustom())}
        >
          <span>Another endpoint</span>
        </button>
      ) : null}
      {endpointMode === "custom" || !hasModels ? (
        <>
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
      ) : null}
    </div>
  );
}

const READ_PHASES = [
  "Sending the resume",
  "The model is reading it",
  "Looking for roles",
  "Looking for schools",
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

function ProfileStep({
  firstName,
  lastName,
  photoPreview,
  place,
  links,
  error,
  onFirstName,
  onLastName,
  onPhoto,
  onPlace,
  onLinks,
  onContinue,
}: {
  firstName: string;
  lastName: string;
  photoPreview: string | null;
  place: OnboardingPlaceAnswer;
  links: OnboardingLinkAnswer;
  error: string | null;
  onFirstName: (value: string) => void;
  onLastName: (value: string) => void;
  onPhoto: (file: File | null) => void;
  onPlace: (place: OnboardingPlaceAnswer) => void;
  onLinks: (links: OnboardingLinkAnswer) => void;
  onContinue: () => void;
}) {
  const typedLinks = [links.linkedinUrl, links.githubUrl, links.portfolioUrl]
    .map((value) => value.trim())
    .filter(Boolean);
  const linksReady = typedLinks.every((value) => isHttpUrl(value));
  const [linksOpen, setLinksOpen] = useState(typedLinks.length > 0);
  return (
    <>
      <p className="onboarding-kicker">Profile</p>
      <h1>
        Let's start with <em>your profile.</em>
      </h1>
      <label className="onboarding-avatar onboarding-avatar-pick">
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={(event) => onPhoto(event.target.files?.[0] ?? null)}
        />
        {photoPreview ? <img src={photoPreview} alt="Profile photo" /> : <span>Add a photo</span>}
      </label>
      <div className="onboarding-field-row">
        <label className="onboarding-field">
          <span>First name</span>
          <input
            value={firstName}
            autoComplete="given-name"
            onChange={(event) => onFirstName(event.target.value)}
          />
        </label>
        <label className="onboarding-field">
          <span>Last name</span>
          <input
            value={lastName}
            autoComplete="family-name"
            onChange={(event) => onLastName(event.target.value)}
          />
        </label>
      </div>
      <AddressFields place={place} onPlace={onPlace} />
      <div className="onboarding-detect">
        <section className="onboarding-detect-row" data-open={linksOpen ? "true" : "false"}>
          <button
            type="button"
            className="onboarding-detect-head"
            aria-expanded={linksOpen}
            onClick={() => setLinksOpen((open) => !open)}
          >
            <strong>Online Profile Links</strong>
            {typedLinks.length > 0 ? <span>{typedLinks.length} added</span> : null}
          </button>
          {linksOpen ? (
            <div className="onboarding-detect-body">
              <LinkFields links={links} onLinks={onLinks} />
              {typedLinks.length > 0 && !linksReady ? (
                <p className="onboarding-quiet">Use an http(s) link.</p>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>
      {error ? (
        <p className="onboarding-alert" role="alert">
          {error}
        </p>
      ) : null}
      <div className="onboarding-actions" data-end="true">
        <button
          type="button"
          className="onboarding-btn onboarding-btn-solid"
          disabled={!firstName.trim() || !lastName.trim() || !linksReady}
          onClick={onContinue}
        >
          Continue
        </button>
      </div>
    </>
  );
}

function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts.slice(0, -1).join(" "), last: parts.at(-1) ?? "" };
}
