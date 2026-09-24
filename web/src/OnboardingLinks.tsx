import { useState } from "react";
import { isHttpUrl } from "@core/model-connection";
import type { OnboardingLinkAnswer } from "@core/onboarding-review";
import { FoundOrOffer } from "./onboarding-offer";

export function LinksStep({
  links,
  onLinks,
  onBack,
  onContinue,
}: {
  links: OnboardingLinkAnswer;
  onLinks: (links: OnboardingLinkAnswer) => void;
  onBack: () => void;
  onContinue: (skipped: boolean) => void;
}) {
  const [fromFile] = useState(() =>
    Boolean(links.linkedinUrl.trim() || links.githubUrl.trim() || links.portfolioUrl.trim()),
  );
  const typed = [links.linkedinUrl, links.githubUrl, links.portfolioUrl].map((value) => value.trim()).filter(Boolean);
  const linksReady = typed.every((value) => isHttpUrl(value));
  return (
    <FoundOrOffer
      kicker="Links"
      found={fromFile}
      foundHeading={
        <>
          Are these <em>links</em> right?
        </>
      }
      offerHeading={
        <>
          Add LinkedIn, GitHub, <em>or a site?</em>
        </>
      }
      fields={<LinkFields links={links} onLinks={onLinks} />}
      note={typed.length > 0 && !linksReady ? <p className="onboarding-quiet">Use an http(s) link.</p> : null}
      canContinue={typed.length > 0 && linksReady}
      onBack={onBack}
      onContinue={onContinue}
    />
  );
}

function LinkFields({
  links,
  onLinks,
}: {
  links: OnboardingLinkAnswer;
  onLinks: (links: OnboardingLinkAnswer) => void;
}) {
  return (
    <>
      <label className="onboarding-field">
        <span>LinkedIn</span>
        <input
          value={links.linkedinUrl}
          autoComplete="url"
          placeholder="https://www.linkedin.com/in/…"
          onChange={(event) => onLinks({ ...links, linkedinUrl: event.target.value })}
        />
      </label>
      <label className="onboarding-field">
        <span>GitHub</span>
        <input
          value={links.githubUrl}
          autoComplete="url"
          placeholder="https://github.com/…"
          onChange={(event) => onLinks({ ...links, githubUrl: event.target.value })}
        />
      </label>
      <label className="onboarding-field">
        <span>Site</span>
        <input
          value={links.portfolioUrl}
          autoComplete="url"
          placeholder="https://"
          onChange={(event) => onLinks({ ...links, portfolioUrl: event.target.value })}
        />
      </label>
    </>
  );
}
