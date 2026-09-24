import { useState, type ReactNode } from "react";

export function YesNo({
  value,
  onYes,
  onNo,
}: {
  value: boolean | null;
  onYes: () => void;
  onNo: () => void;
}) {
  return (
    <div className="onboarding-chips">
      <button type="button" aria-pressed={value === true} onClick={onYes}>
        Yes
      </button>
      <button type="button" aria-pressed={value === false} onClick={onNo}>
        No
      </button>
    </div>
  );
}

export function FoundOrOffer({
  kicker,
  found,
  foundHeading,
  offerHeading,
  fields,
  note,
  canContinue,
  onBack,
  onContinue,
}: {
  kicker: string;
  found: boolean;
  foundHeading: ReactNode;
  offerHeading: ReactNode;
  fields: ReactNode;
  note?: ReactNode;
  canContinue: boolean;
  onBack: () => void;
  onContinue: (skipped: boolean) => void;
}) {
  const [offer, setOffer] = useState<boolean | null>(found ? true : null);
  const showing = found || offer === true;
  const ready = offer === false || (offer === true && canContinue);
  return (
    <>
      <p className="onboarding-kicker">{kicker}</p>
      <h1>{found ? foundHeading : offerHeading}</h1>
      <p className="onboarding-lead">
        {found ? "From the resume. Change anything that is wrong." : "Nothing was in the file."}
      </p>
      {found ? null : <YesNo value={offer} onYes={() => setOffer(true)} onNo={() => setOffer(false)} />}
      {showing ? fields : null}
      {showing ? note : null}
      <div className="onboarding-actions" data-split="true">
        <button type="button" className="onboarding-btn onboarding-btn-ghost" onClick={onBack}>
          Back
        </button>
        <button
          type="button"
          className="onboarding-btn onboarding-btn-solid"
          disabled={!ready}
          onClick={() => onContinue(offer === false)}
        >
          {found ? "Looks right" : "Continue"}
        </button>
      </div>
    </>
  );
}
