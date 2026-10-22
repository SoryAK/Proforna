import { useEffect, useRef, useState } from "react";
import { isHttpUrl, OPENAI_BASE_URL, type ModelHosting } from "@core/model-connection";
import {
  LOCAL_SCAN_PORT_MAX,
  LOCAL_SCAN_PORT_MIN,
  preparePortRange,
  presentModelId,
  presentRangeHits,
  presentScanAddress,
  type LocalScanHit,
} from "@core/model-onboarding";
import {
  evidenceRoleChoices,
  onboardingCheckItems,
  onboardingDone,
  onboardingSavedLines,
  profileAfterOnboarding,
  type EvidenceRoleChoice,
  type OnboardingCheckItem,
  type OnboardingDone,
  type OnboardingLinkAnswer,
  type OnboardingPlaceAnswer,
} from "@core/onboarding-review";
import { isAvatarType, prepareProfile, PROFILE_AVATAR_MAX_BYTES, type ProfileFields } from "@core/profile";
import type { ExtractedProfile, ExtractedResume } from "@core/resume-extract";
import {
  dropSetAside,
  historyFromHeld,
  resumesToQueue,
  rememberSetAside,
  rememberSkills,
  type HeldRole,
  type HeldSkill,
  type SetAsideRole,
} from "@core/resume-compare";
import { CityStateFields, StreetField } from "./OnboardingAddress";
import { ResumePreview } from "./OnboardingCheck";
import { AllResumesVerify, ResumeCompare, type ResumeBundle } from "./OnboardingCompare";
import { ResumeReview } from "./ResumeReview";
import {
  clearOnboardingDraft,
  loadOnboardingDraft,
  saveOnboardingDraft,
  type OnboardingModelChoice,
  type OnboardingTimelineRow,
} from "./onboarding-session";
import type { OnboardingProfileValue } from "./OnboardingProfile";
import { IntegrationSettings } from "./IntegrationSettings";
import "./onboarding.css";

type Me = {
  occupant: { id: string };
  profile: OnboardingProfileValue & { onboardingCompletedAt: string | null };
};

type OnboardingStep = "name" | "model" | "integrations" | "file" | "check";

export type OnboardingExit = { page: "home" } | { page: "history"; focusJobId?: string };

type QueuedResume = {
  file: File;
  digest: string;
};

const STEP_INDEX: Record<OnboardingStep, number> = {
  name: 0,
  model: 1,
  integrations: 2,
  file: 3,
  check: 4,
};

const STEPS = ["Profile", "Model", "Integrations", "Resume", "Verify"] as const;

export function Onboarding({
  initialProfile,
  onFinished,
}: {
  initialProfile: OnboardingProfileValue;
  onFinished: (me: Me, next: OnboardingExit) => void;
}) {
  const [name, setName] = useState(initialProfile.fullName);
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
  const [localProbe, setLocalProbe] = useState<"idle" | "scanning" | "ready">("idle");
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanned, setScanned] = useState<LocalScanHit[]>([]);
  const [endpointMode, setEndpointMode] = useState<"scanned" | "custom" | null>(null);
  const [localUrl, setLocalUrl] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [savedModel, setSavedModel] = useState("");
  const [wantsModel, setWantsModel] = useState<boolean | null>(null);
  const [hosting, setHosting] = useState<ModelHosting | null>(null);
  const [cloudKey, setCloudKey] = useState("");
  const [selected, setSelected] = useState("");
  const [foundPick, setFoundPick] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [done, setDone] = useState<{ me: Me; profile: ProfileFields; summary: OnboardingDone } | null>(null);
  const [files, setFiles] = useState<QueuedResume[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [held, setHeld] = useState<HeldRole[]>([]);
  const [heldSkills, setHeldSkills] = useState<HeldSkill[]>([]);
  const [cursor, setCursor] = useState(0);
  const [pass, setPass] = useState<"verify" | "compare" | "review">("verify");
  const [setAsides, setSetAsides] = useState<SetAsideRole[]>([]);
  const [draftReady, setDraftReady] = useState(false);
  const [profileExtract, setProfileExtract] = useState<ExtractedProfile | null>(null);
  const [step, setStep] = useState<OnboardingStep>("name");
  const [items, setItems] = useState<OnboardingCheckItem[]>([]);
  const [extracted, setExtracted] = useState<ExtractedResume | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readDigests, setReadDigests] = useState<string[]>([]);
  const [timeline, setTimeline] = useState<OnboardingTimelineRow[] | null>(null);
  const [declinedPairs, setDeclinedPairs] = useState<string[]>([]);
  const extractsRef = useRef<Map<string, ExtractedResume>>(new Map());
  const profileRef = useRef<ProfileFields>(initialProfile);
  const abortRef = useRef<AbortController | null>(null);
  const scanAbort = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const filesRef = useRef(files);
  const addChain = useRef(Promise.resolve());
  filesRef.current = files;
  const previewDialogRef = useRef<HTMLDialogElement>(null);

  function modelChoiceForDraft(): OnboardingModelChoice | null {
    if (wantsModel === null) return null;
    return {
      skipped: wantsModel === false,
      hosting,
      model: selected,
      baseUrl: endpointMode === "custom" ? localUrl.trim() : baseUrl,
      endpoint: endpointMode,
    };
  }

  function restoreModelChoice(choice: OnboardingModelChoice | null | undefined) {
    if (!choice) return;
    setWantsModel(choice.skipped ? false : true);
    setHosting(choice.hosting);
    setSelected(choice.model);
    setBaseUrl(choice.baseUrl);
    setEndpointMode(choice.endpoint);
    if (choice.endpoint === "custom") setLocalUrl(choice.baseUrl);
    if (choice.endpoint === "scanned" && choice.model) setFoundPick(`${choice.baseUrl} ${choice.model}`);
  }

  useEffect(() => {
    if (!photo) return;
    const url = URL.createObjectURL(photo);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  useEffect(() => {
    const node = previewDialogRef.current;
    if (!node) return;
    if (previewOpen) {
      if (!node.open) node.showModal();
      return;
    }
    if (node.open) node.close();
  }, [previewOpen, previewIndex, files]);

  useEffect(() => {
    let cancel = false;
    void loadOnboardingDraft()
      .then((draft) => {
        if (cancel || !draft) return;
        extractsRef.current = new Map(draft.extracts.map((row) => [row.digest, row.data]));
        setFiles(
          draft.files.map((row) => ({
            file: new File([row.bytes], row.name, { type: row.type }),
            digest: row.digest,
          })),
        );
        setReadDigests(draft.readDigests);
        setHeld(draft.held);
        setHeldSkills(draft.heldSkills);
        setSetAsides(draft.asides);
        setCursor(draft.cursor);
        setPass(draft.pass);
        setItems(draft.items);
        setTimeline(draft.timeline ?? null);
        setDeclinedPairs(draft.declinedPairs ?? []);
        setProfileExtract(draft.profileExtract);
        setExtracted(draft.extracts.find((row) => row.digest === draft.files[draft.cursor]?.digest)?.data ?? null);
        restoreModelChoice(draft.modelChoice);
        setStep(draft.step);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancel) setDraftReady(true);
      });
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    if (!draftReady || (files.length === 0 && held.length === 0)) return;
    let cancel = false;
    void (async () => {
      const stored = await Promise.all(
        files.map(async (row) => ({
          digest: row.digest,
          name: row.file.name,
          type: row.file.type,
          bytes: await row.file.arrayBuffer(),
        })),
      );
      if (cancel) return;
      try {
      await saveOnboardingDraft({
        files: stored,
        extracts: [...extractsRef.current.entries()].map(([digest, data]) => ({ digest, data })),
        readDigests,
        held,
        heldSkills,
        asides: setAsides,
        cursor,
        pass,
        step: step === "check" || step === "file" ? step : "file",
        items,
        timeline,
        declinedPairs,
        profileExtract,
        modelChoice: modelChoiceForDraft(),
      });
      } catch {
        /* the questions still continue in this page */
      }
    })();
    return () => {
      cancel = true;
    };
  }, [draftReady, files, readDigests, held, heldSkills, setAsides, cursor, pass, step, items, timeline, declinedPairs, profileExtract, wantsModel, hosting, selected, baseUrl, endpointMode, localUrl]);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      try {
        const modelRes = await fetch("/api/models");
        if (cancel || !modelRes.ok) return;
        const saved =
          ((await modelRes.json()) as { connections?: Array<{ model: string }> }).connections?.at(-1)?.model ??
          "";
        setSavedModel(saved);
      } catch {
        /* a saved model is optional */
      }
    })();
    return () => {
      cancel = true;
      abortRef.current?.abort();
      scanAbort.current?.abort();
    };
  }, []);

  async function scanRange(from: string, to: string) {
    const prepared = preparePortRange(from, to);
    if (!prepared.ok) {
      setScanError(
        prepared.error === "range-backwards"
          ? "The first port comes before the second."
          : "Use a port from 1 to 65535.",
      );
      return;
    }
    setScanError(null);
    scanAbort.current?.abort();
    const abort = new AbortController();
    scanAbort.current = abort;
    setLocalProbe("scanning");
    setScanned([]);
    setSelected("");
    setEndpointMode(null);
    setLocalUrl("");
    setBaseUrl("");
    try {
      const res = await fetch(`/api/models/probe?from=${prepared.from}&to=${prepared.to}`, {
        signal: abort.signal,
      });
      const body = (await res.json().catch(() => ({}))) as { hits?: LocalScanHit[]; error?: string };
      if (abort.signal.aborted) return;
      if (!res.ok) {
        setScanError(body.error ?? "Could not scan those ports.");
        setLocalProbe("ready");
        return;
      }
      setScanned(presentRangeHits(body.hits ?? []));
      setLocalProbe("ready");
    } catch {
      if (abort.signal.aborted) return;
      setScanError("Could not scan those ports.");
      setLocalProbe("ready");
    }
  }

  useEffect(() => {
    if (step === "model" && localProbe === "idle") {
      void scanRange(String(LOCAL_SCAN_PORT_MIN), String(LOCAL_SCAN_PORT_MAX));
    }
  }, [step, localProbe]);

  const foundModels = scanned.flatMap((hit) => hit.models.map((id) => ({ address: hit.baseUrl, id })));
  const foundKey = foundPick || (foundModels[0] ? `${foundModels[0].address} ${foundModels[0].id}` : "");
  const usingFound =
    wantsModel === true && hosting === "local" && endpointMode === "scanned" && `${baseUrl} ${selected}` === foundKey;

  function pickHosting(next: "local" | "cloud") {
    if (hosting === next) return;
    setWantsModel(true);
    setHosting(next);
    setSelected("");
    setEndpointMode(null);
    setLocalUrl("");
    setBaseUrl("");
    setAdvancedOpen(false);
    setError(null);
    if (next === "local") setCloudKey("");
  }

  function chooseLocal(address: string, id: string) {
    setWantsModel(true);
    setHosting("local");
    setEndpointMode("scanned");
    setSelected(id);
    setLocalUrl("");
    setCloudKey("");
    setBaseUrl(address);
    setError(null);
  }

  function clearModel() {
    setWantsModel(null);
    setHosting(null);
    setSelected("");
    setCloudKey("");
    setEndpointMode(null);
    setLocalUrl("");
    setBaseUrl("");
    setError(null);
  }

  const modelReady =
    wantsModel === false ||
    (wantsModel === true &&
      hosting === "local" &&
      ((endpointMode === "scanned" && Boolean(selected) && isHttpUrl(baseUrl)) ||
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

  function addResumes(picked: File[]) {
    if (extracting || picked.length === 0) return;
    const batch = picked;
    const run = addChain.current.then(() => appendResumes(batch));
    addChain.current = run.then(
      () => undefined,
      () => undefined,
    );
  }

  async function appendResumes(batch: File[]) {
    if (extracting || batch.length === 0) return;
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

  function removeResume(index: number) {
    if (extracting) return;
    if (held.length > 0 && index < cursor) return;
    setError(null);
    const digest = files[index]?.digest;
    const nextFiles = files.filter((_, row) => row !== index);
    if (digest) {
      extractsRef.current.delete(digest);
      setReadDigests((current) => current.filter((row) => row !== digest));
    }
    filesRef.current = nextFiles;
    setFiles(nextFiles);
    const nextFirst = nextFiles[0];
    setProfileExtract(nextFirst ? (extractsRef.current.get(nextFirst.digest)?.profile ?? null) : null);
    setTimeline((current) =>
      current
        ?.filter((row) => row.fileIndex !== index)
        .map((row) => {
          if (row.fileIndex < index) return row;
          const fileIndex = row.fileIndex - 1;
          return { ...row, fileIndex, id: row.id.replace(/^file-\d+/, `file-${fileIndex}`) };
        }) ?? null,
    );
    setDeclinedPairs((current) =>
      current.flatMap((id) => {
        const match = /^file-(\d+)-/.exec(id);
        if (!match) return [id];
        const fileIndex = Number(match[1]);
        if (fileIndex === index) return [];
        return [fileIndex > index ? id.replace(/^file-\d+/, `file-${fileIndex - 1}`) : id];
      }),
    );
    if (previewIndex === index) {
      setPreviewOpen(false);
      setPreviewIndex(null);
    } else if (previewIndex != null && previewIndex > index) {
      setPreviewIndex(previewIndex - 1);
    }
  }

  function leaveCheck() {
    abortRef.current?.abort();
    setExtracting(false);
    setStep("file");
  }

  function continueWithoutRead() {
    setError(null);
    void finishSession(held, heldSkills, false);
  }

  async function readAll() {
    if (extracting || wantsModel !== true || !selected || files.length === 0) return;
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
      for (let index = 0; index < files.length; index += 1) {
        const row = files[index];
        if (extractsRef.current.has(row.digest)) continue;
        setCursor(index);
        const form = new FormData();
        form.append("file", row.file);
        const res = await fetch("/api/resumes/extract", { method: "POST", body: form, signal: abort.signal });
        const body = (await res.json()) as { error?: string; data?: ExtractedResume };
        if (abort.signal.aborted) return;
        if (!res.ok || !body.data) {
          setError(body.error ?? `Could not read ${row.file.name}.`);
          return;
        }
        if (onboardingCheckItems(body.data).length === 0) {
          setError(`The model did not find roles or schools in ${row.file.name}.`);
          return;
        }
        extractsRef.current.set(row.digest, body.data);
        setReadDigests((current) => (current.includes(row.digest) ? current : [...current, row.digest]));
      }
      if (abort.signal.aborted) return;
      startQuestions();
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

  function openAt(index: number) {
    const row = files[index];
    const data = row ? extractsRef.current.get(row.digest) : undefined;
    if (!row || !data) return;
    if (index === 0) setProfileExtract(data.profile);
    setExtracted(data);
    setItems(onboardingCheckItems(data));
    setCursor(index);
    setPass(index === 0 ? "verify" : "compare");
    setStep("check");
  }

  function openReadFiles() {
    setError(null);
    if (held.length === 0 && timeline && timeline.length > 0) {
      const first = files[0] ? extractsRef.current.get(files[0].digest) : undefined;
      if (first) setProfileExtract(first.profile);
      setPass("verify");
      setStep("check");
      return;
    }
    startQuestions();
  }

  function startQuestions() {
    if (held.length > 0) {
      const index = cursor > 0 ? Math.min(cursor, files.length - 1) : 1;
      if (index >= files.length) {
        void finishSession(held, heldSkills, true);
        return;
      }
      openAt(index);
      return;
    }
    const first = files[0] ? extractsRef.current.get(files[0].digest) : undefined;
    if (first) setProfileExtract(first.profile);
    setTimeline(null);
    setDeclinedPairs([]);
    setItems([]);
    setPass("verify");
    setStep("check");
  }

  function acceptTimeline(nextHeld: HeldRole[], skills: HeldSkill[]) {
    setHeld(nextHeld);
    setHeldSkills(skills);
    void finishSession(nextHeld, skills, nextHeld.length > 0);
  }

  function acceptCompared(nextHeld: HeldRole[], acceptSkills: boolean) {
    const skills = rememberSkills(heldSkills, extracted?.skills ?? [], cursor, acceptSkills);
    advance(nextHeld, skills);
  }

  function advance(nextHeld: HeldRole[], skills: HeldSkill[]) {
    for (let index = cursor + 1; index < files.length; index += 1) {
      if (!extractsRef.current.has(files[index].digest)) continue;
      setHeld(nextHeld);
      setHeldSkills(skills);
      openAt(index);
      return;
    }
    setHeld(nextHeld);
    setHeldSkills(skills);
    setPass("review");
    setStep("check");
  }

  function removeHeld(id: string) {
    const role = held.find((row) => row.id === id);
    if (!role) return;
    setHeld((current) => current.filter((row) => row.id !== id));
    setSetAsides((current) => rememberSetAside(current, role.item));
  }

  async function finishSession(roles: HeldRole[], skills: HeldSkill[], includeHistory: boolean) {
    setBusy(true);
    setError(null);
    try {
      const draft = profileAfterOnboarding({
        current: profileRef.current,
        extracted: profileExtract,
        fullName: name,
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
      const asideResponse = await fetch("/api/resume-asides", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          asides: setAsides.map((aside) => ({
            kind: aside.item.source,
            title: aside.item.title,
            organization: aside.item.org,
            startDate: aside.item.startDate,
            endDate: aside.item.endDate,
          })),
        }),
      });
      if (!asideResponse.ok) {
        setError("Could not save the roles you set aside.");
        return;
      }
      let keptHistory: { jobs: number; schools: number; skills: number } | null = null;
      if (includeHistory) {
        const history = historyFromHeld(roles, skills);
        if (history.experience.length > 0 || history.education.length > 0) {
          const saved = await fetch("/api/history", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              experience: history.experience,
              education: history.education,
              skills: history.skills,
              resumeId: resumeIds[0],
              evidence: {
                experience: history.experienceEvidence.map((source) => ({
                  resumeIds: source.files.map((index) => resumeIds[index]),
                  achievements: source.achievements.map((index) => resumeIds[index]),
                })),
                education: history.educationEvidence.map((source) => ({
                  resumeIds: source.files.map((index) => resumeIds[index]),
                })),
                skills: history.skillFiles.map((index) => (index >= 0 ? (resumeIds[index] ?? "") : "")),
              },
            }),
          });
          if (!saved.ok) {
            setError("Could not save jobs and schools.");
            return;
          }
          keptHistory = (await saved.json()) as { jobs: number; schools: number; skills: number };
        }
      }
      const res = await fetch("/api/onboarding/complete", { method: "POST" });
      const body = (await res.json()) as Me & { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Could not finish onboarding.");
        return;
      }
      await clearOnboardingDraft();
      if (!keptHistory) {
        onFinished(body, { page: "home" });
        return;
      }
      setDone({
        me: body,
        profile: prepared.value,
        summary: onboardingDone({ ...keptHistory, resumes: resumeIds.length, setAside: setAsides.length }),
      });
    } finally {
      setBusy(false);
    }
  }

  const filesRead = files.length > 0 && files.every((row) => readDigests.includes(row.digest));
  const notes = notesForStep();

  function notesForStep(): string[] {
    if (step === "name") {
      return ["Change any of this later in Profile."];
    }
    if (step === "integrations") {
      return ["You can connect these later in Settings."];
    }
    if (step === "file" && !extracting && wantsModel !== true && !filesRead) {
      return [
        "Without a model, the resume is stored but not read. Jobs and schools can be added later from Career History.",
        "It can be done later if now is not the right time.",
      ];
    }
    if (step === "file" && !extracting) {
      return [
        "One resume is enough. Add another if you have it. Every file is read before the questions start, and nothing is saved until the last continue.",
        "It can be done later if now is not the right time.",
      ];
    }
    if (step === "check") {
      const lines = [
        "We advise going through each one. A model can hallucinate, and the read can produce incorrect information or miss things.",
        "These details can be revised later as well.",
      ];
      if (pass === "compare") {
        lines.push("A role this file never mentions stays. A duty you skip stays off the role and on the file.");
      }
      return lines;
    }
    return [];
  }

  if (done) {
    return (
      <div className="onboarding">
        <div className="onboarding-stage">
          <WashProgress step={step} />
          <div className="onboarding-sheet">
            <section className="onboarding-card">
              <DoneStep
                summary={done.summary}
                profile={done.profile}
                onGo={(next) => onFinished(done.me, next)}
              />
            </section>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="onboarding">
      <div className="onboarding-stage">
        <WashProgress step={step} />
        <div
          className="onboarding-sheet"
          data-wide={step === "check" || step === "integrations" ? "true" : undefined}
        >
        <section className="onboarding-card">
          {step === "name" ? (
            <ProfileStep
              name={name}
              photoPreview={photoPreview}
              place={place}
              error={error}
              onName={setName}
              onPhoto={pickPhoto}
              onPlace={setPlace}
              onContinue={() => {
                const checked = prepareProfile({ fullName: name, ...links });
                if (!checked.ok && checked.error === "url-invalid") {
                  setError("Use a full link that starts with http:// or https://.");
                  return;
                }
                setError(null);
                setStep("model");
              }}
            />
          ) : null}

          {step === "model" ? (
            <>
              <p className="onboarding-kicker">Model</p>
              <h1>
                Should Proforna read <em>your resume?</em>
              </h1>
              <p className="onboarding-lead">
                A model reads your resume and lists your jobs and schools for you to check. You can also skip this and
                add them yourself.
              </p>
              <div className="onboarding-choices onboarding-host" role="group" aria-label="Where the model runs">
                <button
                  type="button"
                  className="onboarding-choice"
                  data-active={hosting === "local" ? "true" : undefined}
                  aria-pressed={hosting === "local"}
                  onClick={() => pickHosting("local")}
                >
                  <strong>Local</strong>
                  <span>
                    {localProbe !== "ready"
                      ? "Looking on this computer…"
                      : foundModels.length > 0
                        ? "A model is on this computer."
                        : "Scan this computer for a model."}
                  </span>
                </button>
                <button
                  type="button"
                  className="onboarding-choice"
                  data-active={hosting === "cloud" ? "true" : undefined}
                  aria-pressed={hosting === "cloud"}
                  onClick={() => pickHosting("cloud")}
                >
                  <strong>Cloud</strong>
                  <span>A cloud provider may read, keep, report, and train on what you send.</span>
                </button>
              </div>
              {hosting === "local" ? (
              <section
                className="onboarding-found"
                data-state={localProbe === "scanning" || localProbe === "idle" ? "scanning" : foundModels.length > 0 ? "found" : "missing"}
                data-active={usingFound ? "true" : undefined}
              >
                <p className="onboarding-found-head">
                  <span className="onboarding-found-dot" aria-hidden="true" />
                  {localProbe !== "ready"
                    ? "Looking for a model on this computer…"
                    : foundModels.length > 0
                      ? "Found a model on this computer"
                      : "No model found on this computer"}
                </p>
                {advancedOpen ? (
                  <LocalModels
                    localProbe={localProbe}
                    scanned={scanned}
                    endpointMode={hosting === "local" ? endpointMode : null}
                    selected={selected}
                    localUrl={localUrl}
                    scanError={scanError}
                    onScan={(from, to) => {
                      setSelected("");
                      setEndpointMode(null);
                      setLocalUrl("");
                      setBaseUrl("");
                      setError(null);
                      void scanRange(from, to);
                    }}
                    onCustomUrl={(value) => {
                      setWantsModel(true);
                      setHosting("local");
                      setLocalUrl(value);
                      setEndpointMode("custom");
                      setBaseUrl(value.trim());
                    }}
                    onCustomModel={(value) => {
                      setWantsModel(true);
                      setHosting("local");
                      setSelected(value);
                      setEndpointMode("custom");
                    }}
                  />
                ) : null}
                {!advancedOpen && localProbe === "ready" && foundModels.length > 0 ? (
                  <>
                    <label className="onboarding-field">
                      <span>Model</span>
                      <select
                        className="onboarding-model-select"
                        value={foundKey}
                        onChange={(event) => setFoundPick(event.target.value)}
                      >
                        {foundModels.map((hit) => (
                          <option key={`${hit.address} ${hit.id}`} value={`${hit.address} ${hit.id}`}>
                            {presentModelId(hit.id)}
                            {scanned.length > 1 ? ` · ${presentScanAddress(hit.address)}` : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                ) : null}
                {!advancedOpen && localProbe === "ready" && foundModels.length === 0 ? (
                  <p className="onboarding-quiet">
                    Use Advanced to scan other ports or enter an address.
                  </p>
                ) : null}
                {localProbe === "ready" ? (
                  <div className="onboarding-found-actions">
                    {!advancedOpen && foundModels.length > 0 ? (
                      <button
                        type="button"
                        className="onboarding-btn onboarding-btn-solid"
                        aria-pressed={usingFound}
                        onClick={() => {
                          const hit = foundModels.find((model) => `${model.address} ${model.id}` === foundKey);
                          if (hit) chooseLocal(hit.address, hit.id);
                        }}
                      >
                        {usingFound ? "Using this model" : "Use this model"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="onboarding-btn onboarding-btn-ghost onboarding-advanced"
                      aria-pressed={advancedOpen}
                      onClick={() => setAdvancedOpen((open) => !open)}
                    >
                      Advanced
                    </button>
                  </div>
                ) : null}
              </section>
              ) : null}
              {hosting === "cloud" ? (
                <section className="onboarding-found">
                  <label className="onboarding-field">
                    <span>Model</span>
                    <input
                      value={selected}
                      autoComplete="off"
                      placeholder="model name"
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
                </section>
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
                    setError(null);
                    setStep("name");
                  }}
                >
                  Back
                </button>
                <div className="onboarding-action-pair">
                  <button
                    type="button"
                    className="onboarding-link"
                    onClick={() => {
                      clearModel();
                      setWantsModel(false);
                      setStep("integrations");
                    }}
                  >
                    Skip, I'll add jobs myself
                  </button>
                  <button
                    type="button"
                    className="onboarding-btn onboarding-btn-solid"
                    disabled={wantsModel !== true || !modelReady}
                    onClick={() => {
                      setError(null);
                      setStep("integrations");
                    }}
                  >
                    Continue
                  </button>
                </div>
              </div>
            </>
          ) : null}

          {step === "integrations" ? (
            <>
              <h1>
                Connect an <em>account?</em>
              </h1>
              <p className="onboarding-lead">
                Optional. Turn one on if you want Proforna to use it when you ask. It does not file mail into
                Opportunities on its own.
              </p>
              <IntegrationSettings nested />
              <div className="onboarding-actions" data-split="true">
                <button
                  type="button"
                  className="onboarding-btn onboarding-btn-ghost"
                  onClick={() => setStep("model")}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="onboarding-btn onboarding-btn-solid"
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
              <p className="onboarding-kicker">Resume</p>
              <h1>
                {extracting ? (
                  <>
                    Reading <em>{files[cursor]?.file.name ?? "the resume"}.</em>
                  </>
                ) : (
                  <>
                    Import your <em>resumes.</em>
                  </>
                )}
              </h1>
              {extracting ? (
                <p className="onboarding-meta">
                  {cursor + 1} of {files.length}. The questions start after every file is read.
                </p>
              ) : null}
              {extracting ? <ReadProgress model={presentModelId(selected)} /> : null}
              {files.length === 0 ? (
                <label className="onboarding-file">
                  Drop resumes here, or click to choose
                  <input
                    ref={fileInputRef}
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
              ) : (
                <>
                  <ul className="onboarding-file-list">
                    {files.map((row, index) => {
                      const read = readDigests.includes(row.digest);
                      const reading = extracting && index === cursor && !read;
                      return (
                        <li key={row.digest}>
                          <div
                            className="onboarding-file onboarding-file-picked"
                            data-reading={reading ? "true" : undefined}
                          >
                            <span className="onboarding-file-name" title={row.file.name}>
                              {row.file.name}
                            </span>
                            <span className="onboarding-file-actions">
                              {held.length > 0 && index < cursor ? (
                                <span className="onboarding-file-state">Checked</span>
                              ) : read ? (
                                <span className="onboarding-file-state">Read</span>
                              ) : reading ? (
                                <span className="onboarding-file-state">Reading</span>
                              ) : null}
                              {reading || (held.length > 0 && index < cursor) ? null : (
                                <button
                                  type="button"
                                  className="onboarding-btn onboarding-btn-ghost onboarding-file-preview"
                                  onClick={() => removeResume(index)}
                                >
                                  Remove
                                </button>
                              )}
                              <button
                                type="button"
                                className="onboarding-btn onboarding-btn-ghost onboarding-file-preview"
                                onClick={() => {
                                  setPreviewIndex(index);
                                  setPreviewOpen(true);
                                }}
                              >
                                Preview
                              </button>
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  <button
                    type="button"
                    className="onboarding-btn onboarding-btn-ghost onboarding-file-add"
                    disabled={extracting}
                    onClick={() => fileInputRef.current?.click()}
                  >
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
              )}
                  {previewIndex != null && files[previewIndex] ? (
                    <dialog
                      ref={previewDialogRef}
                      className="onboarding-review onboarding-file-dialog"
                      aria-labelledby="onboarding-file-preview-title"
                      onClose={() => setPreviewOpen(false)}
                    >
                      <div className="onboarding-review-head">
                        <p className="onboarding-kicker">Resume</p>
                        <button
                          type="button"
                          className="onboarding-btn onboarding-btn-ghost"
                          onClick={() => setPreviewOpen(false)}
                        >
                          Close
                        </button>
                      </div>
                      <h2 id="onboarding-file-preview-title">
                        <em>{files[previewIndex].file.name}</em>
                      </h2>
                      <div className="onboarding-file-dialog-body">
                        {previewOpen ? <ResumePreview file={files[previewIndex].file} /> : null}
                      </div>
                    </dialog>
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
                      onClick={() => setStep("integrations")}
                      disabled={held.length > 0 || extracting}
                    >
                      Back
                    </button>
                    <div className="onboarding-action-pair">
                      {(wantsModel === true || (wantsModel !== false && filesRead)) && files.length > 0 ? (
                        <button
                          type="button"
                          className="onboarding-btn onboarding-btn-solid"
                          disabled={extracting || (!filesRead && (!selected || (hosting === "cloud" && !cloudKey.trim())))}
                          onClick={() => {
                            if (filesRead) openReadFiles();
                            else void readAll();
                          }}
                        >
                          {!filesRead
                            ? files.length > 1
                              ? "Read the resumes"
                              : "Extract job data"
                            : held.length > 0
                              ? "Continue"
                              : "Check what we read"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="onboarding-btn onboarding-btn-solid"
                          disabled={busy}
                          onClick={() => {
                            if (files.length > 0 && cursor >= files.length) {
                              void finishSession(held, heldSkills, true);
                              return;
                            }
                            continueWithoutRead();
                          }}
                        >
                          {busy ? "Saving…" : "Continue"}
                        </button>
                      )}
                    </div>
                  </div>
            </>
          ) : null}

          {step === "check" && pass === "verify" ? (
            <AllResumesVerify
              bundles={resumeBundles(files, extractsRef.current)}
              initialRows={timeline}
              initialDeclined={declinedPairs}
              editedItems={timeline ? [] : items}
              editedFileIndex={cursor}
              asides={setAsides}
              busy={busy}
              error={error}
              editSkills
              onBack={leaveCheck}
              onSetAside={(item) => setSetAsides((current) => rememberSetAside(current, item))}
              onForgetAside={(id) => setSetAsides((current) => dropSetAside(current, id))}
              onRows={(rows, declined) => {
                setTimeline(rows);
                setDeclinedPairs(declined);
              }}
              onDone={acceptTimeline}
            />
          ) : null}
          {step === "check" && pass === "compare" ? (
            <ResumeCompare
              key={files[cursor]?.digest ?? cursor}
              items={items}
              file={files[cursor]?.file ?? null}
              fileName={files[cursor]?.file.name ?? "Resume"}
              fileIndex={cursor}
              held={held}
              asides={setAsides}
              busy={busy}
              error={error}
              onBack={leaveCheck}
              onSetAside={(item) => setSetAsides((current) => rememberSetAside(current, item))}
              onForgetAside={(id) => setSetAsides((current) => dropSetAside(current, id))}
              onDone={acceptCompared}
            />
          ) : null}
          {step === "check" && pass === "review" ? (
            <ResumeReview
              held={held}
              fileNames={files.map((row) => row.file.name)}
              asides={setAsides}
              busy={busy}
              error={error}
              onRemove={removeHeld}
              onBack={() => setStep("file")}
              onContinue={() => void finishSession(held, heldSkills, true)}
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

function resumeBundles(queued: QueuedResume[], extracts: Map<string, ExtractedResume>): ResumeBundle[] {
  return queued.flatMap((row, fileIndex) => {
    const data = extracts.get(row.digest);
    if (!data) return [];
    return [
      {
        file: row.file,
        fileIndex,
        name: row.file.name,
        skills: data.skills ?? [],
        items: onboardingCheckItems(data),
      },
    ];
  });
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
  scanned,
  endpointMode,
  selected,
  localUrl,
  scanError,
  onScan,
  onCustomUrl,
  onCustomModel,
}: {
  localProbe: "idle" | "scanning" | "ready";
  scanned: LocalScanHit[];
  endpointMode: "scanned" | "custom" | null;
  selected: string;
  localUrl: string;
  scanError: string | null;
  onScan: (from: string, to: string) => void;
  onCustomUrl: (value: string) => void;
  onCustomModel: (value: string) => void;
}) {
  const [portFrom, setPortFrom] = useState(String(LOCAL_SCAN_PORT_MIN));
  const [portTo, setPortTo] = useState(String(LOCAL_SCAN_PORT_MAX));
  const customUrl = localUrl.trim();
  return (
    <div className="onboarding-detect-body">
      <p className="onboarding-quiet">Scan checks ports on this machine.</p>
      <div className="onboarding-scan-row">
        <label className="onboarding-field">
          <span>From</span>
          <input
            inputMode="numeric"
            value={portFrom}
            autoComplete="off"
            onChange={(event) => setPortFrom(event.target.value)}
          />
        </label>
        <label className="onboarding-field">
          <span>To</span>
          <input
            inputMode="numeric"
            value={portTo}
            autoComplete="off"
            onChange={(event) => setPortTo(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="onboarding-btn onboarding-btn-solid"
          disabled={localProbe === "scanning"}
          onClick={() => onScan(portFrom, portTo)}
        >
          {localProbe === "scanning" ? "Scanning…" : "Scan"}
        </button>
      </div>
      {scanError ? (
        <p className="onboarding-alert" role="alert">
          {scanError}
        </p>
      ) : null}
      {localProbe === "ready" && scanned.length === 0 ? (
        <p className="onboarding-quiet">No models listed.</p>
      ) : null}
      <label className="onboarding-field">
        <span>Address</span>
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

function DoneStep({
  summary,
  profile,
  onGo,
}: {
  summary: OnboardingDone;
  profile: ProfileFields;
  onGo: (next: OnboardingExit) => void;
}) {
  const saved = onboardingSavedLines(profile);
  const [fields, setFields] = useState(profile);
  const [choices, setChoices] = useState<EvidenceRoleChoice[]>([]);
  const [choiceId, setChoiceId] = useState("");
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancel = false;
    void fetch("/api/history")
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as {
          jobs?: Array<{ id: string; title: string; company: string }>;
          schools?: Array<{ id: string; institution: string; degree: string }>;
        };
      })
      .then((career) => {
        if (cancel || !career) return;
        const next = evidenceRoleChoices({ jobs: career.jobs ?? [], schools: career.schools ?? [] });
        setChoices(next);
        setChoiceId(next[0]?.id ?? "");
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, []);

  async function leave(next: OnboardingExit) {
    const changed =
      fields.headline !== profile.headline ||
      fields.city !== profile.city ||
      fields.state !== profile.state ||
      fields.bio !== profile.bio ||
      fields.linkedinUrl !== profile.linkedinUrl ||
      fields.githubUrl !== profile.githubUrl ||
      fields.portfolioUrl !== profile.portfolioUrl;
    if (changed) {
      const prepared = prepareProfile(fields);
      if (!prepared.ok) {
        setError(prepared.error === "url-invalid" ? "Use an http(s) URL for a link." : "A name is required.");
        return;
      }
      const savedProfile = await fetch("/api/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(prepared.value),
      });
      if (!savedProfile.ok) {
        setError("Could not save those profile changes.");
        return;
      }
    }
    onGo(next);
  }

  return (
    <>
      <p className="onboarding-kicker">Done</p>
      <h1>
        Your history <em>is in.</em>
      </h1>
      <ul className="onboarding-counts">
        {summary.tiles.map((tile) => (
          <li key={tile.label}>
            <strong>{tile.count}</strong>
            <span>{tile.label}</span>
          </li>
        ))}
      </ul>
      {summary.setAside ? <p className="onboarding-lead">{summary.setAside}</p> : null}
      {saved.length > 0 ? (
        <div className="onboarding-saved">
          <p>These were saved with your profile. A blank field took the value from a resume.</p>
          {profile.headline.trim() ? (
            <label className="onboarding-field">
              <span>Headline</span>
              <input value={fields.headline} onChange={(event) => setFields({ ...fields, headline: event.target.value })} />
            </label>
          ) : null}
          {profile.city.trim() && profile.state.trim() ? (
            <div className="onboarding-field-row">
              <label className="onboarding-field">
                <span>City</span>
                <input value={fields.city} onChange={(event) => setFields({ ...fields, city: event.target.value })} />
              </label>
              <label className="onboarding-field">
                <span>State</span>
                <input value={fields.state} onChange={(event) => setFields({ ...fields, state: event.target.value })} />
              </label>
            </div>
          ) : profile.city.trim() ? (
            <label className="onboarding-field">
              <span>City</span>
              <input value={fields.city} onChange={(event) => setFields({ ...fields, city: event.target.value })} />
            </label>
          ) : profile.state.trim() ? (
            <label className="onboarding-field">
              <span>State</span>
              <input value={fields.state} onChange={(event) => setFields({ ...fields, state: event.target.value })} />
            </label>
          ) : null}
          {profile.linkedinUrl.trim() ? (
            <label className="onboarding-field">
              <span>LinkedIn</span>
              <input value={fields.linkedinUrl} onChange={(event) => setFields({ ...fields, linkedinUrl: event.target.value })} />
            </label>
          ) : null}
          {profile.githubUrl.trim() ? (
            <label className="onboarding-field">
              <span>GitHub</span>
              <input value={fields.githubUrl} onChange={(event) => setFields({ ...fields, githubUrl: event.target.value })} />
            </label>
          ) : null}
          {profile.portfolioUrl.trim() ? (
            <label className="onboarding-field">
              <span>Website</span>
              <input value={fields.portfolioUrl} onChange={(event) => setFields({ ...fields, portfolioUrl: event.target.value })} />
            </label>
          ) : null}
          {profile.bio.trim() ? (
            <label className="onboarding-field">
              <span>Bio</span>
              <textarea rows={3} value={fields.bio} onChange={(event) => setFields({ ...fields, bio: event.target.value })} />
            </label>
          ) : null}
        </div>
      ) : null}
      {choices.length > 1 ? (
        <label className="onboarding-field">
          <span>Add evidence to</span>
          <select className="onboarding-model-select" value={choiceId} onChange={(event) => setChoiceId(event.target.value)}>
            {choices.map((choice) => (
              <option key={choice.id} value={choice.id}>
                {choice.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {error ? (
        <p className="onboarding-alert" role="alert">
          {error}
        </p>
      ) : null}
      <div className="onboarding-actions" data-split="true">
        <button type="button" className="onboarding-link" onClick={() => void leave({ page: "home" })}>
          Go to Home
        </button>
        <div className="onboarding-action-pair">
          {choices.length > 0 ? (
            <button
              type="button"
              className="onboarding-btn onboarding-btn-ghost"
              disabled={opening || !choiceId}
              onClick={() => {
                setOpening(true);
                void leave({ page: "history", focusJobId: choiceId });
              }}
            >
              Add evidence to a role
            </button>
          ) : null}
          <button type="button" className="onboarding-btn onboarding-btn-solid" onClick={() => void leave({ page: "history" })}>
            See your map
          </button>
        </div>
      </div>
    </>
  );
}

function ProfileStep({
  name,
  photoPreview,
  place,
  error,
  onName,
  onPhoto,
  onPlace,
  onContinue,
}: {
  name: string;
  photoPreview: string | null;
  place: OnboardingPlaceAnswer;
  error: string | null;
  onName: (value: string) => void;
  onPhoto: (file: File | null) => void;
  onPlace: (place: OnboardingPlaceAnswer) => void;
  onContinue: () => void;
}) {
  const [addressOpen, setAddressOpen] = useState(false);
  return (
    <>
      <p className="onboarding-kicker">Profile</p>
      <h1>
        Let's start with <em>your profile.</em>
      </h1>
      <p className="onboarding-lead">Proforna runs on this computer. Nothing here leaves it unless you publish.</p>
      <fieldset className="onboarding-group">
        <legend>About you · can be published</legend>
        <label className="onboarding-avatar onboarding-avatar-pick">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={(event) => onPhoto(event.target.files?.[0] ?? null)}
          />
          {photoPreview ? <img src={photoPreview} alt="Profile photo" /> : <span>Add a photo</span>}
        </label>
        <label className="onboarding-field">
          <span>Name</span>
          <input value={name} autoComplete="name" onChange={(event) => onName(event.target.value)} />
        </label>
        <CityStateFields
          place={place}
          onPlace={onPlace}
          note="A published page shows your state. It shows the city only when you publish exact locations."
        />
      </fieldset>
      {addressOpen ? (
        <fieldset className="onboarding-group" data-private="true">
          <legend>Only for you · never published</legend>
          <StreetField place={place} onPlace={onPlace} note="Used to place your home on the map." />
        </fieldset>
      ) : (
        <button
          type="button"
          className="onboarding-btn onboarding-btn-ghost onboarding-add-address"
          onClick={() => setAddressOpen(true)}
        >
          Add address
        </button>
      )}
      {error ? (
        <p className="onboarding-alert" role="alert">
          {error}
        </p>
      ) : null}
      <div className="onboarding-actions" data-end="true">
        <button
          type="button"
          className="onboarding-btn onboarding-btn-solid"
          disabled={!name.trim()}
          onClick={onContinue}
        >
          Continue
        </button>
      </div>
      {name.trim() ? null : <p className="onboarding-why">Add your name to continue.</p>}
    </>
  );
}

async function digestFile(file: File): Promise<string> {
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}