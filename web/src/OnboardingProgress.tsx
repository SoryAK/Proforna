export type Step = "welcome" | "models" | "model-setup" | "resume";

const SHORT = ["Welcome", "Model?", "Resume"] as const;
const LONG = ["Welcome", "Model?", "Config", "Resume"] as const;

export function progressIndex(step: Step, modelPath: boolean): number {
  if (step === "welcome") return 0;
  if (step === "models") return 1;
  if (step === "model-setup") return 2;
  return modelPath ? 3 : 2;
}

export function stepKicker(step: Step, modelPath: boolean): string {
  if (step === "welcome") return "Step 01 — Welcome";
  if (step === "models") return "Step 02 — Models";
  if (step === "model-setup") return "Step 03 — Config";
  return modelPath ? "Step 04 — Resume" : "Step 03 — Resume";
}

export function OnboardingProgress({
  step,
  modelPath,
}: {
  step: Step;
  modelPath: boolean;
}) {
  const labels = modelPath ? LONG : SHORT;
  const current = progressIndex(step, modelPath);

  return (
    <ol className="onboarding-progress" aria-label="Onboarding progress">
      {labels.map((label, i) => {
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
            {i < labels.length - 1 ? (
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
