import { useCallback, useEffect, useRef, useState } from "react";
import type { CareerFile } from "@core/career-file";
import { onboardingCheckItems } from "@core/onboarding-review";
import type { ExtractedResume } from "@core/resume-extract";
import {
  heldFromCareer,
  historyFromHeld,
  rememberSetAside,
  resumesToQueue,
  type HeldRole,
  type HeldSkill,
  type SetAsideRole,
} from "@core/resume-compare";
import { AllResumesVerify, type ResumeBundle } from "./OnboardingCompare";
import "./onboarding.css";

type QueuedFile = { file: File; digest: string };

export function ResumeImport({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [files, setFiles] = useState<QueuedFile[]>([]);
  const [phase, setPhase] = useState<"pick" | "read" | "verify">("pick");
  const [readingName, setReadingName] = useState("");
  const [bundles, setBundles] = useState<ResumeBundle[]>([]);
  const [held, setHeld] = useState<HeldRole[]>([]);
  const [asides, setAsides] = useState<SetAsideRole[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef(files);
  const addChain = useRef(Promise.resolve());
  filesRef.current = files;
  const ignoreRows = useCallback(() => undefined, []);

  useEffect(() => {
    const node = dialogRef.current;
    if (!node?.open) node?.showModal();
  }, [phase]);

  function addResumes(picked: File[]) {
    if (phase === "read" || picked.length === 0) return;
    const run = addChain.current.then(() => appendResumes(picked));
    addChain.current = run.then(
      () => undefined,
      () => undefined,
    );
  }

  async function appendResumes(batch: File[]) {
    const incoming = await Promise.all(batch.map(async (file) => ({ file, digest: await digestFile(file) })));
    const queued = resumesToQueue(
      filesRef.current.map((row) => row.digest),
      incoming.map((row) => row.digest),
    );
    const added = queued.indexes.flatMap((index) => {
      const row = incoming[index];
      return row ? [row] : [];
    });
    if (added.length > 0) {
      const next = [...filesRef.current, ...added];
      filesRef.current = next;
      setFiles(next);
    }
    setError(
      queued.skipped === 0 ? null : queued.skipped === 1 ? "That resume is already in the list." : "Those resumes are already in the list.",
    );
  }

  function removeFile(index: number) {
    setFiles((current) => current.filter((_, row) => row !== index));
    setError(null);
  }

  async function readAll() {
    if (files.length === 0 || phase === "read") return;
    setPhase("read");
    setError(null);
    try {
      const [careerRes, asideRes] = await Promise.all([fetch("/api/history"), fetch("/api/resume-asides")]);
      if (!careerRes.ok || !asideRes.ok) {
        setError("Could not load the roles you already kept.");
        setPhase("pick");
        return;
      }
      const career = (await careerRes.json()) as CareerFile;
      const asideBody = (await asideRes.json()) as {
        asides: Array<{
          kind: "job" | "school";
          title: string;
          organization: string;
          startDate: string;
          endDate: string;
        }>;
      };
      const kept = heldFromCareer(career);
      const knownAsides = asideBody.asides.reduce<SetAsideRole[]>(
        (list, row) =>
          rememberSetAside(list, {
            source: row.kind,
            sourceIndex: -1,
            kind: row.kind === "school" ? "School" : "Job",
            org: row.organization,
            title: row.title,
            field: "",
            place: "No place yet",
            span: "",
            startDate: row.startDate,
            endDate: row.endDate,
            isCurrent: false,
            description: "",
            achievements: [],
            lines: [],
            lat: null,
            lng: null,
          }),
        [],
      );
      const nextBundles: ResumeBundle[] = [];
      for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
        const row = files[fileIndex];
        setReadingName(row.file.name);
        const form = new FormData();
        form.append("file", row.file);
        const res = await fetch("/api/resumes/extract", { method: "POST", body: form });
        const body = (await res.json()) as { error?: string; data?: ExtractedResume };
        if (!res.ok || !body.data) {
          setError(body.error ?? `Could not read ${row.file.name}.`);
          setPhase("pick");
          return;
        }
        const items = onboardingCheckItems(body.data);
        if (items.length === 0) {
          setError(`The model did not find roles or schools in ${row.file.name}.`);
          setPhase("pick");
          return;
        }
        nextBundles.push({
          file: row.file,
          fileIndex,
          name: row.file.name,
          skills: body.data.skills ?? [],
          items,
        });
      }
      setHeld(kept);
      setAsides(knownAsides);
      setBundles(nextBundles);
      setPhase("verify");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read the resume.");
      setPhase("pick");
    }
  }

  async function confirm(nextHeld: HeldRole[], skills: HeldSkill[]) {
    if (files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const resumeIds: string[] = [];
      for (const row of files) {
        const form = new FormData();
        form.append("file", row.file);
        const uploaded = await fetch("/api/resumes", { method: "POST", body: form });
        if (!uploaded.ok) {
          setError("Could not store the resume.");
          return;
        }
        const stored = (await uploaded.json()) as { resume?: { id?: string } };
        if (!stored.resume?.id) {
          setError("Could not store the resume.");
          return;
        }
        resumeIds.push(stored.resume.id);
      }
      const asidePayload = asides.map((aside) => ({
        kind: aside.item.source,
        title: aside.item.title,
        organization: aside.item.org,
        startDate: aside.item.startDate,
        endDate: aside.item.endDate,
      }));
      for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
        const updates = nextHeld.filter((role) => !role.id.startsWith("file-") && lastTouchedFile(role) === fileIndex);
        const createdRoles = nextHeld.filter((role) => newRoleFile(role) === fileIndex);
        const fileSkills = skills.filter((skill) => skill.sourceFile === fileIndex);
        const last = fileIndex === files.length - 1;
        if (updates.length === 0 && createdRoles.length === 0 && fileSkills.length === 0 && !last) continue;
        const created = historyFromHeld(createdRoles, fileSkills);
        const applied = await fetch("/api/resumes/apply", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            resumeId: resumeIds[fileIndex],
            updates: updates.map((role) => ({
              id: role.id,
              kind: role.item.source,
              title: role.item.title,
              organization: role.item.org,
              location: role.item.place === "No place yet" ? "" : role.item.place,
              startDate: role.item.startDate,
              endDate: role.item.endDate,
              isCurrent: role.item.isCurrent,
              description: role.item.description,
              achievements: role.item.achievements,
            })),
            created,
            asides: asidePayload,
          }),
        });
        if (!applied.ok) {
          setError("Could not save the roles from that resume.");
          return;
        }
      }
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="onboarding-review"
      data-compare={phase === "verify" ? "true" : undefined}
      aria-labelledby={phase === "verify" ? undefined : "resume-import-title"}
      aria-label={phase === "verify" ? "Here's what was extracted" : undefined}
    >
      {phase === "verify" ? (
        <AllResumesVerify
          bundles={bundles}
          initialRows={null}
          initialDeclined={[]}
          editedItems={[]}
          editedFileIndex={0}
          priorHeld={held}
          asides={asides}
          busy={busy}
          error={error}
          onBack={() => setPhase("pick")}
          onSetAside={(item) => setAsides((current) => rememberSetAside(current, item))}
          onForgetAside={(id) => setAsides((current) => current.filter((row) => row.id !== id))}
          onRows={ignoreRows}
          onDone={(nextHeld, skills) => void confirm(nextHeld, skills)}
        />
      ) : (
        <>
          <div className="onboarding-review-head">
            <p className="onboarding-kicker">Resume</p>
            <button type="button" className="onboarding-btn onboarding-btn-ghost" onClick={onClose} disabled={phase === "read"}>
              Close
            </button>
          </div>
          <h2 id="resume-import-title">
            {phase === "read" ? (
              <>
                Reading <em>{readingName}</em>
              </>
            ) : (
              <>
                Import your <em>resumes.</em>
              </>
            )}
          </h2>
          {phase === "read" ? <p className="onboarding-meta">The questions start after every file is read.</p> : null}
          {phase === "pick" && files.length === 0 ? (
            <label className="onboarding-file">
              Drop resumes here, or click to choose
              <input
                type="file"
                multiple
                accept="application/pdf,text/plain,.pdf,.txt,.md"
                onChange={(event) => {
                  const picked = event.target.files ? [...event.target.files] : [];
                  event.target.value = "";
                  addResumes(picked);
                }}
              />
            </label>
          ) : null}
          {phase === "pick" && files.length > 0 ? (
            <>
              <ul className="onboarding-file-list">
                {files.map((row, index) => (
                  <li key={row.digest}>
                    <div className="onboarding-file onboarding-file-picked">
                      <span className="onboarding-file-name" title={row.file.name}>
                        {row.file.name}
                      </span>
                      <span className="onboarding-file-actions">
                        <button
                          type="button"
                          className="onboarding-btn onboarding-btn-ghost onboarding-file-preview"
                          onClick={() => removeFile(index)}
                        >
                          Remove
                        </button>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
              <button type="button" className="onboarding-btn onboarding-btn-ghost onboarding-file-add" onClick={() => fileInputRef.current?.click()}>
                Add resumes
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                accept="application/pdf,text/plain,.pdf,.txt,.md"
                onChange={(event) => {
                  const picked = event.target.files ? [...event.target.files] : [];
                  event.target.value = "";
                  addResumes(picked);
                }}
              />
            </>
          ) : null}
          {error ? (
            <p className="onboarding-alert" role="alert">
              {error}
            </p>
          ) : null}
          {phase === "pick" && files.length > 0 ? (
            <div className="onboarding-actions">
              <button type="button" className="onboarding-btn onboarding-btn-solid" onClick={() => void readAll()}>
                {files.length > 1 ? "Read the resumes" : "Read the resume"}
              </button>
            </div>
          ) : null}
        </>
      )}
    </dialog>
  );
}

function newRoleFile(role: HeldRole): number | null {
  const match = /^file-(\d+)-/.exec(role.id);
  return match ? Number(match[1]) : null;
}

function lastTouchedFile(role: HeldRole): number | null {
  const indexes = [...role.evidenceFiles, ...role.achievementFiles].filter((index) => index >= 0);
  if (indexes.length === 0) return null;
  return Math.max(...indexes);
}

async function digestFile(file: File): Promise<string> {
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
