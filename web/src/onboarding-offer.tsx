import { useState, type ReactNode } from "react";

export function YesNo({ onYes, onNo }: { onYes: () => void; onNo: () => void }) {
  return (
    <div className="onboarding-action-pair">
      <button type="button" className="onboarding-btn onboarding-btn-ghost" onClick={onNo}>
        No
      </button>
      <button type="button" className="onboarding-btn onboarding-btn-solid" onClick={onYes}>
        Yes
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
      {showing ? fields : null}
      {showing ? note : null}
      <div className="onboarding-actions" data-split="true">
        <button type="button" className="onboarding-btn onboarding-btn-ghost" onClick={onBack}>
          Back
        </button>
        {found || offer === true ? (
          <button
            type="button"
            className="onboarding-btn onboarding-btn-solid"
            disabled={!ready}
            onClick={() => onContinue(offer === false)}
          >
            {found ? "Looks right" : "Continue"}
          </button>
        ) : (
          <YesNo
            onYes={() => setOffer(true)}
            onNo={() => {
              setOffer(false);
              onContinue(true);
            }}
          />
        )}
      </div>
    </>
  );
}
