import { useCallback, useRef, useState } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { FileInput } from "@astryxdesign/core/FileInput";
import { HStack } from "@astryxdesign/core/HStack";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
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
import "./resume-import.css";

const RESUME_ACCEPT = "application/pdf,text/plain,.pdf,.txt,.md";

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
  const filesRef = useRef(files);
  const addChain = useRef(Promise.resolve());
  filesRef.current = files;
  const ignoreRows = useCallback(() => undefined, []);
  const locked = phase === "read" || busy;

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

  const title =
    phase === "verify"
      ? "Here's what was extracted"
      : phase === "read"
        ? `Reading ${readingName}`
        : "Import your resumes";

  return (
    <Dialog
      className="resume-import-dialog"
      isOpen
      onOpenChange={(next) => {
        if (!next && !locked) onClose();
      }}
      purpose={locked ? "required" : "form"}
      width={phase === "verify" ? "min(72rem, calc(100vw - 2.5rem))" : 640}
      maxHeight={phase === "verify" ? "min(85vh, 44rem)" : "min(640px, calc(100dvh - 2rem))"}
      padding={0}
      style={phase === "verify" ? { height: "min(85vh, 44rem)" } : undefined}
    >
      <Layout
        padding={4}
        height={phase === "verify" ? "fill" : "auto"}
        header={
          <DialogHeader
            title={title}
            subtitle={phase === "read" ? "The questions start after every file is read." : undefined}
            hasDivider
            onOpenChange={locked ? undefined : () => onClose()}
          />
        }
        content={
          <LayoutContent isScrollable={phase === "verify"} label="Resume import">
            {phase === "verify" ? (
              <div className="resume-import-verify">
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
                  hideHeading
                  onBack={() => setPhase("pick")}
                  onSetAside={(item) => setAsides((current) => rememberSetAside(current, item))}
                  onForgetAside={(id) => setAsides((current) => current.filter((row) => row.id !== id))}
                  onRows={ignoreRows}
                  onDone={(nextHeld, skills) => void confirm(nextHeld, skills)}
                />
              </div>
            ) : phase === "pick" && files.length === 0 ? (
              <VStack className="resume-import-pick">
              <FileInput
                label="Resumes"
                isLabelHidden
                mode="dropzone"
                isMultiple
                accept={RESUME_ACCEPT}
                value={null}
                placeholder="Drop resumes here, or click to choose"
                width="100%"
                statusVariant="detached"
                onChange={(next) => {
                  const picked = Array.isArray(next) ? next : next ? [next] : [];
                  addResumes(picked);
                }}
              />
              </VStack>
            ) : phase === "pick" ? (
              <VStack className="resume-import-pick" gap={2}>
                <VStack as="ul" role="list" gap={1}>
                  {files.map((row, index) => (
                    <HStack key={row.digest} as="li" gap={2} align="center" justify="between">
                      <Text>{row.file.name}</Text>
                      <Button label="Remove" variant="ghost" size="sm" onClick={() => removeFile(index)} />
                    </HStack>
                  ))}
                </VStack>
                <FileInput
                  label="Add resumes"
                  mode="input"
                  isMultiple
                  accept={RESUME_ACCEPT}
                  value={null}
                  placeholder="Add resumes"
                  width="100%"
                  onChange={(next) => {
                    const picked = Array.isArray(next) ? next : next ? [next] : [];
                    addResumes(picked);
                  }}
                />
                {error ? <Banner status="error" title={error} container="section" collapsible={false} role="alert" /> : null}
              </VStack>
            ) : null}
          </LayoutContent>
        }
        footer={
          phase === "pick" && files.length > 0 ? (
            <LayoutFooter hasDivider>
              <HStack justify="end">
                <Button
                  label={files.length > 1 ? "Read the resumes" : "Read the resume"}
                  variant="primary"
                  onClick={() => void readAll()}
                />
              </HStack>
            </LayoutFooter>
          ) : undefined
        }
      />
    </Dialog>
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
