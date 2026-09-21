import { useEffect, useState } from "react";
import { classifyResumePreview } from "@core/resume-preview";
import type { ExtractedResume } from "@core/resume-extract";
import type { ProfileFields } from "@core/profile";
import { OnboardingExtractConfirm } from "./OnboardingExtract";

export function OnboardingResume({
  kicker,
  file,
  extracted,
  extractModel,
  extractModelLabel,
  canExtract,
  busy,
  extracting,
  error,
  onPick,
  onClear,
  onBack,
  onSkip,
  onExtract,
  onCancelExtract,
  onExtractedChange,
  onConfirm,
  profile,
  onProfileChange,
}: {
  kicker: string;
  file: File | null;
  extracted: ExtractedResume | null;
  extractModel: string | null;
  extractModelLabel: string | null;
  canExtract: boolean;
  busy: boolean;
  extracting: boolean;
  error: string | null;
  onPick: (file: File | null) => void;
  onClear: () => void;
  onBack: () => void;
  onSkip: () => void;
  onExtract: () => void;
  onCancelExtract: () => void;
  onExtractedChange: (next: ExtractedResume) => void;
  onConfirm: () => void;
  profile: ProfileFields;
  onProfileChange: (next: ProfileFields) => void;
}) {
  const [textPreview, setTextPreview] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [reviewReady, setReviewReady] = useState(false);
  const kind = file ? classifyResumePreview(file) : null;
  const extractable = kind === "pdf" || kind === "text";
  const locked = busy || extracting;

  useEffect(() => {
    if (!extracted) setReviewReady(false);
  }, [extracted]);

  useEffect(() => {
    if (!file || extracted || extracting) {
      setTextPreview(null);
      setPdfUrl(null);
      return;
    }
    const nextKind = classifyResumePreview(file);
    if (nextKind === "pdf") {
      const url = URL.createObjectURL(file);
      setPdfUrl(url);
      setTextPreview(null);
      return () => {
        URL.revokeObjectURL(url);
      };
    }
    if (nextKind === "text") {
      setPdfUrl(null);
      void file.text().then(setTextPreview);
      return;
    }
    setPdfUrl(null);
    setTextPreview(null);
  }, [file, extracted, extracting]);

  return (
    <>
      <p className="onboarding-kicker">{kicker}</p>
      <h1>
        {extracted ? (
          <>
            Did the resume get this <em>right?</em>
          </>
        ) : extracting ? (
          <>
            Reading the <em>resume.</em>
          </>
        ) : file ? (
          <>
            Does this look <em>right?</em>
          </>
        ) : (
          <>
            Import when <em>you&apos;re ready.</em>
          </>
        )}
      </h1>
      <p className="onboarding-lead">
        {extracted
          ? "The resume filled what it could. Pin each job, check the work you actually did, then confirm it looks right before saving."
          : extracting
            ? "The model is pulling jobs and schools from the file. Cancel if this is taking too long."
            : file
              ? `${file.name} · ${formatSize(file.size)}. ${
                  canExtract && extractable
                    ? "Extract jobs and schools with your model, or save the file only."
                    : "Save stores it, or pick a different file."
                }`
              : "Upload a file if you have one, or skip and add a resume later."}
      </p>

      {extracted ? (
        <OnboardingExtractConfirm
          extracted={extracted}
          model={extractModel}
          profile={profile}
          onChange={onExtractedChange}
          onProfileChange={onProfileChange}
          onReviewReadyChange={setReviewReady}
        />
      ) : extracting ? (
        <ExtractPulse
          model={extractModelLabel}
          onCancel={onCancelExtract}
        />
      ) : file ? (
        <div className="onboarding-preview">
          {kind === "pdf" && pdfUrl ? (
            <iframe
              className="onboarding-preview-frame"
              title="Resume preview"
              src={pdfUrl}
            />
          ) : null}
          {kind === "text" ? (
            <pre className="onboarding-preview-text">
              {textPreview ?? "Reading…"}
            </pre>
          ) : null}
          {kind === "other" ? (
            <p className="onboarding-preview-fallback">
              This file type cannot be shown here. Save stores it anyway.
            </p>
          ) : null}
        </div>
      ) : (
        <label className="onboarding-file">
          <input
            type="file"
            accept=".pdf,.docx,.txt,application/pdf"
            onChange={(e) => onPick(e.target.files?.[0] ?? null)}
          />
          Drop a PDF here, or click to choose
        </label>
      )}

      {error ? (
        <p className="onboarding-alert" role="alert">
          {error}
        </p>
      ) : null}

      {extracted && !reviewReady ? (
        <p className="onboarding-field-hint" role="status">
          Confirm each job looks right before saving.
        </p>
      ) : null}

      <div className="onboarding-actions">
        {file ? (
          <button
            type="button"
            className="onboarding-btn onboarding-btn-ghost"
            onClick={onClear}
            disabled={locked}
          >
            Re-upload
          </button>
        ) : (
          <button
            type="button"
            className="onboarding-btn onboarding-btn-ghost"
            onClick={onBack}
            disabled={locked}
          >
            Back
          </button>
        )}
        <button
          type="button"
          className={
            file
              ? "onboarding-btn onboarding-btn-ghost"
              : "onboarding-btn onboarding-btn-solid"
          }
          onClick={onSkip}
          disabled={locked}
        >
          {busy ? "Saving…" : "Skip"}
        </button>
        {extracting ? (
          <button
            type="button"
            className="onboarding-btn onboarding-btn-solid"
            onClick={onCancelExtract}
          >
            Cancel
          </button>
        ) : null}
        {file && canExtract && extractable && !extracted && !extracting ? (
          <button
            type="button"
            className="onboarding-btn onboarding-btn-solid"
            onClick={onExtract}
            disabled={locked}
          >
            Extract
          </button>
        ) : null}
        {file && !extracting && (!canExtract || extracted || !extractable) ? (
          <button
            type="button"
            className="onboarding-btn onboarding-btn-solid"
            onClick={onConfirm}
            disabled={locked || Boolean(extracted && !reviewReady)}
          >
            {busy ? "Saving…" : "Save"}
          </button>
        ) : null}
        {file &&
        canExtract &&
        extractable &&
        !extracted &&
        !extracting ? (
          <button
            type="button"
            className="onboarding-btn onboarding-btn-ghost"
            onClick={onConfirm}
            disabled={locked}
          >
            {busy ? "Saving…" : "Save"}
          </button>
        ) : null}
      </div>
    </>
  );
}

function ExtractPulse({
  model,
  onCancel,
}: {
  model: string | null;
  onCancel: () => void;
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const id = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - started) / 1000));
    }, 250);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="onboarding-extract-pulse" role="status" aria-live="polite">
      <span className="onboarding-extract-pulse-dot" aria-hidden="true" />
      <strong>Extracting with {model ?? "your model"}</strong>
      <p>{formatElapsed(elapsed)}</p>
      <button
        type="button"
        className="onboarding-btn onboarding-btn-ghost"
        onClick={onCancel}
      >
        Cancel
      </button>
    </div>
  );
}

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes === 0) return `${rest}s`;
  return `${minutes}m ${String(rest).padStart(2, "0")}s`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${Math.round(bytes / 1024)} KB`;
}
