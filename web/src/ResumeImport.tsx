import { useEffect, useRef, useState } from "react";
import type { CareerFile } from "@core/career-file";
import { onboardingCheckItems, type OnboardingCheckItem } from "@core/onboarding-review";
import type { ExtractedResume } from "@core/resume-extract";
import {
  heldFromCareer,
  historyFromHeld,
  rememberSetAside,
  rememberSkills,
  roleTookFile,
  type HeldRole,
  type SetAsideRole,
} from "@core/resume-compare";
import { ResumeCompare } from "./OnboardingCompare";
import { ResumeReview } from "./ResumeReview";
import "./onboarding.css";

export function ResumeImport({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<"pick" | "read" | "compare" | "review">("pick");
  const [items, setItems] = useState<OnboardingCheckItem[]>([]);
  const [held, setHeld] = useState<HeldRole[]>([]);
  const [asides, setAsides] = useState<SetAsideRole[]>([]);
  const [knownSkills, setKnownSkills] = useState<string[]>([]);
  const [extractedSkills, setExtractedSkills] = useState<string[]>([]);
  const [acceptSkills, setAcceptSkills] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const node = dialogRef.current;
    if (!node?.open) node?.showModal();
  }, [phase]);

  async function read(next: File) {
    setFile(next);
    setPhase("read");
    setError(null);
    try {
      const [careerRes, asideRes] = await Promise.all([
        fetch("/api/history"),
        fetch("/api/resume-asides"),
      ]);
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
      setHeld(heldFromCareer(career));
      setKnownSkills(career.skills);
      setAsides(
        asideBody.asides.reduce<SetAsideRole[]>(
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
        ),
      );
      const form = new FormData();
      form.append("file", next);
      const res = await fetch("/api/resumes/extract", { method: "POST", body: form });
      const body = (await res.json()) as { error?: string; data?: ExtractedResume };
      if (!res.ok || !body.data) {
        setError(body.error ?? "Could not read the resume.");
        setPhase("pick");
        return;
      }
      const nextItems = onboardingCheckItems(body.data);
      if (nextItems.length === 0) {
        setError("The model did not find roles or schools in that file.");
        setPhase("pick");
        return;
      }
      setItems(nextItems);
      setExtractedSkills(body.data.skills);
      setPhase("compare");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read the resume.");
      setPhase("pick");
    }
  }

  async function confirm(nextHeld: HeldRole[], nextAsides: SetAsideRole[], tookSkills: boolean) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const uploaded = await fetch("/api/resumes", { method: "POST", body: form });
      if (!uploaded.ok) {
        setError("Could not store the resume.");
        return;
      }
      const stored = (await uploaded.json()) as { resume?: { id?: string } };
      const resumeId = stored.resume?.id;
      if (!resumeId) {
        setError("Could not store the resume.");
        return;
      }
      const createdRoles = nextHeld.filter((role) => role.id.startsWith("file-"));
      const updates = nextHeld.filter((role) => !role.id.startsWith("file-") && roleTookFile(role, 0));
      const skills = rememberSkills(
        knownSkills.map((name) => ({ name, sourceFile: -1 })),
        extractedSkills,
        0,
        tookSkills,
      ).filter((skill) => skill.sourceFile === 0);
      const created = historyFromHeld(createdRoles, skills);
      const applied = await fetch("/api/resumes/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          resumeId,
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
          asides: nextAsides.map((aside) => ({
            kind: aside.item.source,
            title: aside.item.title,
            organization: aside.item.org,
            startDate: aside.item.startDate,
            endDate: aside.item.endDate,
          })),
        }),
      });
      if (!applied.ok) {
        setError("Could not save the roles from that resume.");
        return;
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
      data-compare={phase === "compare" || phase === "review" ? "true" : undefined}
      aria-labelledby="resume-import-title"
    >
      {phase === "compare" && file ? (
        <ResumeCompare
          items={items}
          file={file}
          fileName={file.name}
          fileIndex={0}
          held={held}
          asides={asides}
          busy={busy}
          error={error}
          onBack={() => setPhase("pick")}
          onSetAside={(item) => setAsides((current) => rememberSetAside(current, item))}
          onForgetAside={(id) => setAsides((current) => current.filter((row) => row.id !== id))}
          onDone={(nextHeld, tookSkills) => {
            setHeld(nextHeld);
            setAcceptSkills(tookSkills);
            setPhase("review");
          }}
        />
      ) : phase === "review" && file ? (
        <ResumeReview
          held={held}
          fileNames={[file.name]}
          asides={asides}
          busy={busy}
          error={error}
          onRemove={(id) => {
            const role = held.find((row) => row.id === id);
            if (!role) return;
            setHeld((current) => current.filter((row) => row.id !== id));
            setAsides((current) => rememberSetAside(current, role.item));
          }}
          onBack={() => setPhase("compare")}
          onContinue={() => void confirm(held, asides, acceptSkills)}
        />
      ) : (
        <>
          <div className="onboarding-review-head">
            <p className="onboarding-kicker">Resume</p>
            <button type="button" className="onboarding-btn onboarding-btn-ghost" onClick={onClose}>
              Close
            </button>
          </div>
          <h2 id="resume-import-title">
            {phase === "read" ? (
              <>
                Reading <em>{file?.name}</em>
              </>
            ) : (
              <>
                Import a <em>resume.</em>
              </>
            )}
          </h2>
          {phase === "pick" ? (
            <label className="onboarding-file">
              Drop a PDF here, or click to choose
              <input
                type="file"
                accept="application/pdf,text/plain,.pdf,.txt,.md"
                onChange={(event) => {
                  const next = event.target.files?.[0];
                  event.target.value = "";
                  if (next) void read(next);
                }}
              />
            </label>
          ) : null}
          {error ? (
            <p className="onboarding-alert" role="alert">
              {error}
            </p>
          ) : null}
        </>
      )}
    </dialog>
  );
}
