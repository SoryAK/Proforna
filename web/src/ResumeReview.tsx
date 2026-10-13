import { roleTookFile, type HeldRole, type SetAsideRole } from "@core/resume-compare";

export function ResumeReview({
  held,
  fileNames,
  asides,
  busy,
  error,
  onRemove,
  onBack,
  onContinue,
}: {
  held: HeldRole[];
  fileNames: string[];
  asides: SetAsideRole[];
  busy: boolean;
  error: string | null;
  onRemove: (id: string) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <>
      <p className="onboarding-kicker">Resume</p>
      <h1>
        Here is the career <em>so far.</em>
      </h1>
      <p className="onboarding-meta">Nothing is saved until you continue.</p>
      {held.length === 0 ? <p className="onboarding-meta">No roles or schools are kept.</p> : null}
      <ul className="onboarding-choices">
        {held.map((role) => {
          const names = fileNames.filter((_, index) => roleTookFile(role, index));
          return (
            <li key={role.id}>
              <div className="onboarding-choice">
                <strong>{role.item.title || role.item.org}</strong>
                <span>{[role.item.org, role.item.span].filter(Boolean).join(" · ")}</span>
                {names.length > 0 ? <span>From {names.join(" and ")}</span> : null}
                <button type="button" className="onboarding-btn onboarding-btn-ghost" onClick={() => onRemove(role.id)}>
                  Set aside
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {asides.length > 0 ? (
        <p className="onboarding-meta">
          Set aside: {asides.map((aside) => aside.item.title || aside.item.org).join(", ")}
        </p>
      ) : null}
      {error ? (
        <p className="onboarding-alert" role="alert">
          {error}
        </p>
      ) : null}
      <div className="onboarding-actions" data-split="true">
        <button type="button" className="onboarding-btn onboarding-btn-ghost" onClick={onBack}>
          Back
        </button>
        <button type="button" className="onboarding-btn onboarding-btn-solid" disabled={busy} onClick={onContinue}>
          {busy ? "Saving…" : "Continue"}
        </button>
      </div>
    </>
  );
}
