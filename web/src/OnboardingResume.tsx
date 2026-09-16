import { useEffect, useState } from "react";
import { classifyResumePreview } from "@core/resume-preview";
import type { ExtractedResume } from "@core/resume-extract";
import { OnboardingExtractConfirm } from "./OnboardingExtract";

export function OnboardingResume({
  file,
  extracted,
  extractModel,
  canExtract,
  busy,
  error,
  onPick,
  onClear,
  onBack,
  onSkip,
  onExtract,
  onExtractedChange,
  onConfirm,
}: {
  file: File | null;
  extracted: ExtractedResume | null;
  extractModel: string | null;
  canExtract: boolean;
  busy: boolean;
  error: string | null;
  onPick: (file: File | null) => void;
  onClear: () => void;
  onBack: () => void;
  onSkip: () => void;
  onExtract: () => void;
  onExtractedChange: (next: ExtractedResume) => void;
  onConfirm: () => void;
}) {
  const [textPreview, setTextPreview] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const kind = file ? classifyResumePreview(file) : null;
  const extractable = kind === "pdf" || kind === "text";

  useEffect(() => {
    if (!file || extracted) {
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
  }, [file, extracted]);

  return (
    <>
      <p className="onboarding-kicker">Step 04 — Resume</p>
      <h1>
        {extracted ? (
          <>
            Are these the <em>facts?</em>
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
          ? "Remove anything that is wrong. Confirm saves jobs, schools, and skills — maps come later."
          : file
            ? `${file.name} · ${formatSize(file.size)}. ${
                canExtract && extractable
                  ? "Extract jobs and schools with your model, or save the file only."
                  : "Confirm to store it, or pick a different file."
              }`
            : "Upload a file if you have one. You will preview it before anything is saved."}
      </p>

      {extracted ? (
        <OnboardingExtractConfirm
          extracted={extracted}
          model={extractModel}
          onChange={onExtractedChange}
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
              This file type can’t be shown here. Confirm to store it anyway.
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

      <div className="onboarding-actions">
        {file ? (
          <button
            type="button"
            className="onboarding-btn onboarding-btn-ghost"
            onClick={onClear}
            disabled={busy}
          >
            Re-upload
          </button>
        ) : (
          <button
            type="button"
            className="onboarding-btn onboarding-btn-ghost"
            onClick={onBack}
            disabled={busy}
          >
            Back
          </button>
        )}
        <button
          type="button"
          className="onboarding-btn onboarding-btn-ghost"
          onClick={onSkip}
          disabled={busy}
        >
          Skip
        </button>
        {file && canExtract && extractable && !extracted ? (
          <button
            type="button"
            className="onboarding-btn onboarding-btn-solid"
            onClick={onExtract}
            disabled={busy}
          >
            {busy ? "Extracting…" : "Extract"}
          </button>
        ) : null}
        {file && (!canExtract || extracted || !extractable) ? (
          <button
            type="button"
            className="onboarding-btn onboarding-btn-solid"
            onClick={onConfirm}
            disabled={busy}
          >
            Confirm &amp; save
          </button>
        ) : null}
        {file && canExtract && extractable && !extracted ? (
          <button
            type="button"
            className="onboarding-btn onboarding-btn-ghost"
            onClick={onConfirm}
            disabled={busy}
          >
            Save file only
          </button>
        ) : null}
      </div>
    </>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${Math.round(bytes / 1024)} KB`;
}
