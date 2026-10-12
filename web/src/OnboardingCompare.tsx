import { useState } from "react";
import {
  addHeldRole,
  applySameRole,
  hintHeldRoles,
  hintSetAside,
  roleFieldDiffs,
  type HeldRole,
  type ResumeFieldDiff,
  type ResumeFieldTake,
  type ResumeMatchReason,
  type SetAsideRole,
} from "@core/resume-compare";
import { isBlankOnboardingCheckItem, type OnboardingCheckItem } from "@core/onboarding-review";
import { CheckOverview } from "./OnboardingCheck";

export function ResumeCompare({
  items,
  file,
  fileName,
  fileIndex,
  held,
  asides,
  busy,
  error,
  onBack,
  onSetAside,
  onForgetAside,
  onDone,
}: {
  items: OnboardingCheckItem[];
  file: File | null;
  fileName: string;
  fileIndex: number;
  held: HeldRole[];
  asides: SetAsideRole[];
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onSetAside: (item: OnboardingCheckItem) => void;
  onForgetAside: (id: string) => void;
  onDone: (held: HeldRole[], acceptSkills: boolean) => void;
}) {
  const incoming = items.filter((item) => !isBlankOnboardingCheckItem(item));
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"choose" | "fields" | "new">("choose");
  const [draftHeld, setDraftHeld] = useState(held);
  const [roleId, setRoleId] = useState<string | null>(null);
  const [diffIndex, setDiffIndex] = useState(0);
  const [takes, setTakes] = useState<ResumeFieldTake[]>([]);
  const [draft, setDraft] = useState<OnboardingCheckItem | null>(null);
  const [acceptSkills, setAcceptSkills] = useState(false);
  const current = incoming[index];

  function advance(from: number, nextHeld: HeldRole[], skills: boolean) {
    if (from + 1 >= incoming.length) {
      onDone(nextHeld, skills);
      return;
    }
    setDraftHeld(nextHeld);
    setAcceptSkills(skills);
    setIndex(from + 1);
    setPhase("choose");
    setRoleId(null);
    setDiffIndex(0);
    setTakes([]);
    setDraft(null);
  }

  if (!current) {
    return (
      <>
        <p className="onboarding-kicker">Resume</p>
        <h1>
          Nothing new in <em>{fileName}</em>
        </h1>
        <div className="onboarding-actions" data-split="true">
          <button type="button" className="onboarding-btn onboarding-btn-ghost" onClick={onBack}>
            Back
          </button>
          <button
            type="button"
            className="onboarding-btn onboarding-btn-solid"
            disabled={busy}
            onClick={() => onDone(draftHeld, acceptSkills)}
          >
            {busy ? "Saving…" : "Continue"}
          </button>
        </div>
      </>
    );
  }

  if (phase === "new" && draft) {
    return (
      <CheckOverview
        items={[draft]}
        file={file}
        busy={busy}
        error={error}
        onChange={(next) => {
          const item = next[0] ?? null;
          setDraft(item);
          if (!item) setPhase("choose");
        }}
        onBack={() => setPhase("choose")}
        onContinue={(kept) => {
          const item = kept.find((row) => !isBlankOnboardingCheckItem(row));
          const nextHeld = item ? addHeldRole(draftHeld, item, fileIndex) : draftHeld;
          const skills = acceptSkills || item?.source === "job";
          const aside = item ? hintSetAside(asides, item) : null;
          if (aside) onForgetAside(aside.id);
          advance(index, nextHeld, skills);
        }}
      />
    );
  }

  const hints = hintHeldRoles(draftHeld, current);
  const aside = hintSetAside(asides, current);
  const promotion = hints.some((hint) => hint.reason === "promotion");
  const hinted = new Set(hints.map((hint) => hint.roleId));
  const others = draftHeld.filter((role) => role.item.source === current.source && !hinted.has(role.id));
  const selected = draftHeld.find((role) => role.id === roleId) ?? null;
  const diffs = selected ? roleFieldDiffs(selected.item, current) : [];
  const diff = diffs[diffIndex];
  const noun = current.kind === "School" ? "school" : "role";

  function newRoleButton() {
    return (
      <button
        type="button"
        className="onboarding-choice"
        disabled={busy}
        onClick={() => {
          setDraft({ ...current, achievements: [...current.achievements] });
          setPhase("new");
        }}
      >
        <strong>New {noun}</strong>
        <span>Keep it beside the roles you already have.</span>
      </button>
    );
  }

  function commitSame(nextTakes: ResumeFieldTake[]) {
    if (!selected) return;
    const nextRole = applySameRole(selected, current, fileIndex, nextTakes);
    const nextHeld = draftHeld.map((role) => (role.id === selected.id ? nextRole : role));
    const skills = acceptSkills || (nextTakes.length > 0 && selected.item.source === "job");
    advance(index, nextHeld, skills);
  }

  return (
    <div className="onboarding-compare">
      <p className="onboarding-kicker">Resume</p>
      {phase === "fields" && selected ? (
        <>
          <h1>
            {diff ? (
              <>
                Which <em>{fieldLabel(diff, current)}</em>?
              </>
            ) : (
              <>
                Nothing here changes that <em>{noun}.</em>
              </>
            )}
          </h1>
          <p className="onboarding-meta">
            {fileName} · {index + 1} of {incoming.length}
          </p>
          <p className="onboarding-meta">
            {selected.item.title || selected.item.org}
            {selected.item.org ? ` · ${selected.item.org}` : ""}
          </p>
          {diff ? (
            <div className="onboarding-diff">
              <p>
                <span className="onboarding-diff-label">Kept</span>
                <br />
                {sideText(diff, "kept")}
              </p>
              <p>
                <span className="onboarding-diff-label">This resume</span>
                <br />
                {sideText(diff, "incoming")}
              </p>
            </div>
          ) : (
            <p className="onboarding-meta">The wording you already kept stays.</p>
          )}
          {error ? (
            <p className="onboarding-alert" role="alert">
              {error}
            </p>
          ) : null}
          <div className="onboarding-actions" data-split="true">
            <button type="button" className="onboarding-btn onboarding-btn-ghost" onClick={() => setPhase("choose")}>
              Back
            </button>
            <div className="onboarding-action-pair">
              {diff ? (
                <>
                  <button
                    type="button"
                    className="onboarding-btn onboarding-btn-ghost"
                    disabled={busy}
                    onClick={() => {
                      if (diffIndex + 1 >= diffs.length) commitSame(takes);
                      else setDiffIndex(diffIndex + 1);
                    }}
                  >
                    {diff.field === "achievement" ? "Leave it off" : "Keep this"}
                  </button>
                  <button
                    type="button"
                    className="onboarding-btn onboarding-btn-solid"
                    disabled={busy}
                    onClick={() => {
                      const take = toTake(diff);
                      const nextTakes = [...takes, take];
                      setTakes(nextTakes);
                      if (diffIndex + 1 >= diffs.length) commitSame(nextTakes);
                      else setDiffIndex(diffIndex + 1);
                    }}
                  >
                    {diff.field === "achievement" ? "Add it" : "Use this resume"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="onboarding-btn onboarding-btn-solid"
                  disabled={busy}
                  onClick={() => commitSame(takes)}
                >
                  {busy ? "Saving…" : "Continue"}
                </button>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          <h1>
            Does this match a <em>{noun}?</em>
          </h1>
          <p className="onboarding-meta">{fileName}</p>
          <p className="onboarding-meta">
            <span className="onboarding-diff-label">This resume · {index + 1} of {incoming.length}</span>
            <br />
            {[current.title, current.org, current.span].filter(Boolean).join(" · ")}
          </p>
          <p className="onboarding-meta">Roles this resume does not mention stay as they are.</p>
          {aside ? (
            <p className="onboarding-meta">You set this aside before. You can add it, or leave it aside.</p>
          ) : null}
          <div className="onboarding-choices">
            {promotion ? newRoleButton() : null}
            {hints.map((hint) => {
              const role = draftHeld.find((row) => row.id === hint.roleId);
              if (!role) return null;
              return (
                <button
                  key={role.id}
                  type="button"
                  className="onboarding-choice"
                  disabled={busy}
                  onClick={() => {
                    setRoleId(role.id);
                    setTakes([]);
                    setDiffIndex(0);
                    setPhase("fields");
                  }}
                >
                  <strong>{hintLabel(hint.reason)}</strong>
                  <span>
                    {[role.item.title, role.item.org, role.item.span].filter(Boolean).join(" · ")}
                  </span>
                </button>
              );
            })}
            {others.map((role) => (
              <button
                key={role.id}
                type="button"
                className="onboarding-choice"
                disabled={busy}
                onClick={() => {
                  setRoleId(role.id);
                  setTakes([]);
                  setDiffIndex(0);
                  setPhase("fields");
                }}
              >
                <strong>{role.item.title || role.item.org}</strong>
                <span>
                  {["Kept role", role.item.org, role.item.span].filter(Boolean).join(" · ")}
                </span>
              </button>
            ))}
            {promotion ? null : newRoleButton()}
            <button
              type="button"
              className="onboarding-choice"
              disabled={busy}
              onClick={() => {
                onSetAside(current);
                advance(index, draftHeld, acceptSkills);
              }}
            >
              <strong>Not this one</strong>
              <span>Leave it on the file. It does not become a role.</span>
            </button>
          </div>
          {error ? (
            <p className="onboarding-alert" role="alert">
              {error}
            </p>
          ) : null}
          <div className="onboarding-actions" data-split="true">
            <button type="button" className="onboarding-btn onboarding-btn-ghost" onClick={onBack}>
              Back
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function hintLabel(reason: ResumeMatchReason): string {
  if (reason === "promotion") return "May be a later role";
  if (reason === "employer-and-dates") return "Might be this role";
  return "Same employer";
}

function fieldLabel(diff: ResumeFieldDiff, item: OnboardingCheckItem): string {
  if (diff.field === "org") return item.kind === "School" ? "school" : "employer";
  if (diff.field === "achievement") return "duty";
  if (diff.field === "isCurrent") return "present";
  if (diff.field === "startDate") return "start";
  if (diff.field === "endDate") return "end";
  if (diff.field === "description") return "summary";
  if (diff.field === "field") return "field";
  if (diff.field === "place") return "place";
  return "title";
}

function sideText(diff: ResumeFieldDiff, side: "kept" | "incoming"): string {
  if (diff.field === "achievement") return side === "incoming" ? diff.incoming : "Not on the role";
  if (diff.field === "isCurrent") return (side === "kept" ? diff.kept : diff.incoming) ? "Present" : "Ended";
  const text = side === "kept" ? diff.kept : diff.incoming;
  return text || "Blank";
}

function toTake(diff: ResumeFieldDiff): ResumeFieldTake {
  if (diff.field === "achievement") return { field: "achievement", text: diff.incoming };
  return { field: diff.field };
}
