import { useRef, useState } from "react";
import type { OnboardingPlaceAnswer } from "@core/onboarding-review";
import { FoundOrOffer } from "./onboarding-offer";
import { splitPlaceAddress, type PlaceHit } from "./place-search";
import { usePlaceSuggestions } from "./use-place-suggestions";

export function AddressStep({
  place,
  onPlace,
  onBack,
  onContinue,
}: {
  place: OnboardingPlaceAnswer;
  onPlace: (place: OnboardingPlaceAnswer) => void;
  onBack: () => void;
  onContinue: (skipped: boolean) => void;
}) {
  const [fromFile] = useState(() => Boolean(place.street.trim() || place.city.trim() || place.state.trim()));
  return (
    <FoundOrOffer
      kicker="Address"
      found={fromFile}
      foundHeading={
        <>
          Is this <em>address</em> right?
        </>
      }
      offerHeading={
        <>
          Add your <em>address?</em>
        </>
      }
      fields={<AddressFields place={place} onPlace={onPlace} />}
      canContinue={Boolean(place.street.trim() || place.city.trim())}
      onBack={onBack}
      onContinue={onContinue}
    />
  );
}

function AddressFields({
  place,
  onPlace,
}: {
  place: OnboardingPlaceAnswer;
  onPlace: (place: OnboardingPlaceAnswer) => void;
}) {
  const applied = useRef("");
  const hits = usePlaceSuggestions(place.street === applied.current ? "" : place.street);

  function choose(hit: PlaceHit) {
    const parts = splitPlaceAddress(hit.address);
    applied.current = parts.street;
    onPlace({ street: parts.street, city: parts.city, state: parts.state });
  }

  return (
    <>
      <label className="onboarding-field">
        <span>Street</span>
        <input
          value={place.street}
          autoComplete="off"
          role="combobox"
          aria-expanded={hits.length > 0}
          aria-autocomplete="list"
          onChange={(event) => {
            applied.current = "";
            onPlace({ ...place, street: event.target.value });
          }}
        />
      </label>
      {hits.length > 0 ? (
        <ul className="onboarding-suggest" role="listbox">
          {hits.map((hit) => (
            <li key={`${hit.address}-${hit.latitude}`}>
              <button type="button" onClick={() => choose(hit)}>
                {hit.address}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="onboarding-field-row">
        <label className="onboarding-field">
          <span>City</span>
          <input
            value={place.city}
            autoComplete="address-level2"
            onChange={(event) => onPlace({ ...place, city: event.target.value })}
          />
        </label>
        <label className="onboarding-field">
          <span>State</span>
          <input
            value={place.state}
            autoComplete="address-level1"
            onChange={(event) => onPlace({ ...place, state: event.target.value })}
          />
        </label>
      </div>
    </>
  );
}
