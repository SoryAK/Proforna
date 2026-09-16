import { useState } from "react";

type Me = {
  occupant: { id: string };
  profile: { fullName: string; onboardingCompletedAt: string | null };
};

export function Onboarding({
  initialName,
  onFinished,
}: {
  initialName: string;
  onFinished: (me: Me) => void;
}) {
  const [step, setStep] = useState<"welcome" | "profile" | "resume">("welcome");
  const [fullName, setFullName] = useState(initialName);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function saveProfile() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fullName }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Could not save your name.");
        return;
      }
      setStep("resume");
    } finally {
      setBusy(false);
    }
  }

  async function finish(upload: boolean) {
    setBusy(true);
    setError(null);
    try {
      if (upload && file) {
        const form = new FormData();
        form.append("file", file);
        const uploaded = await fetch("/api/resumes", {
          method: "POST",
          body: form,
        });
        if (!uploaded.ok) {
          setError("Could not store the resume.");
          return;
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
    <section>
      {step === "welcome" ? (
        <>
          <h1>Welcome</h1>
          <p>
            Let&apos;s set up your career profile. Your name first, then an
            optional resume.
          </p>
          <button type="button" onClick={() => setStep("profile")}>
            Let&apos;s get started
          </button>
        </>
      ) : null}

      {step === "profile" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void saveProfile();
          }}
        >
          <h1>Your profile</h1>
          <p>Tell us your name. You can change this later.</p>
          <label>
            Full name
            <input
              name="fullName"
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </label>
          {error ? <p role="alert">{error}</p> : null}
          <p>
            <button
              type="button"
              onClick={() => setStep("welcome")}
              disabled={busy}
            >
              Back
            </button>{" "}
            <button type="submit" disabled={busy}>
              Continue
            </button>
          </p>
        </form>
      ) : null}

      {step === "resume" ? (
        <>
          <h1>Import your resume</h1>
          <p>
            Upload a file if you have one — or skip. Parsing jobs and schools
            comes later.
          </p>
          <label>
            Resume file
            <input
              type="file"
              accept=".pdf,.docx,.txt,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {file ? <p>Selected: {file.name}</p> : null}
          {error ? <p role="alert">{error}</p> : null}
          <p>
            <button
              type="button"
              onClick={() => setStep("profile")}
              disabled={busy}
            >
              Back
            </button>{" "}
            <button
              type="button"
              onClick={() => void finish(false)}
              disabled={busy}
            >
              Skip
            </button>{" "}
            <button
              type="button"
              onClick={() => void finish(true)}
              disabled={busy || !file}
            >
              Save resume
            </button>
          </p>
        </>
      ) : null}
    </section>
  );
}
