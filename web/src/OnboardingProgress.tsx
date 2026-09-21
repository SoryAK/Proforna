export type Step = "welcome" | "models" | "resume";

const LABELS = ["Welcome", "Model?", "Resume"] as const;

export function progressIndex(step: Step): number {
  if (step === "welcome") return 0;
  if (step === "models") return 1;
  return 2;
}

export function stepKicker(step: Step): string {
  if (step === "welcome") return "Step 01 — Welcome";
  if (step === "models") return "Step 02 — Models";
  return "Step 03 — Resume";
}

export function OnboardingProgress({ step }: { step: Step }) {
  const current = progressIndex(step);

  return (
    <ol className="onboarding-progress" aria-label="Onboarding progress">
      {LABELS.map((label, i) => {
        const state = i < current ? "done" : i === current ? "current" : "todo";
        return (
          <li key={label} className="onboarding-progress-step">
            <span
              className="onboarding-progress-dot"
              data-state={state}
              aria-current={state === "current" ? "step" : undefined}
            >
              {state === "done" ? "✓" : i + 1}
            </span>
            <span className="onboarding-progress-label" data-state={state}>
              {label}
            </span>
            {i < LABELS.length - 1 ? (
              <span
                className="onboarding-progress-bar"
                data-done={i < current}
                aria-hidden="true"
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
