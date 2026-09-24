import { useEffect, useState } from "react";
import { needsOnboarding } from "@core/onboarding";
import type { CareerFile } from "@core/career-file";
import { DevPrototypeScreen, readDevPrototype, readReviewOnboarding } from "./dev-routes";
import { Home } from "./Home";
import { Onboarding } from "./Onboarding";
import type { OnboardingProfileValue } from "./OnboardingProfile";

type Me = {
  occupant: { id: string };
  profile: OnboardingProfileValue & { onboardingCompletedAt: string | null };
};

const EMPTY_CAREER: CareerFile = { jobs: [], schools: [], skills: [] };

export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [career, setCareer] = useState<CareerFile>(EMPTY_CAREER);
  const [error, setError] = useState<string | null>(null);
  const [careerError, setCareerError] = useState<string | null>(null);
  const [prototype, setPrototype] = useState(readDevPrototype);
  const [reviewOnboarding, setReviewOnboarding] = useState(readReviewOnboarding);

  useEffect(() => {
    function onHash() {
      setPrototype(readDevPrototype());
      setReviewOnboarding(readReviewOnboarding());
    }
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (prototype) return;
    void load();
  }, [prototype]);

  async function load() {
    try {
      const meRes = await fetch("/api/me");
      if (!meRes.ok) throw new Error(`me ${meRes.status}`);
      setMe((await meRes.json()) as Me);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "load failed");
      return;
    }
    await loadCareer();
  }

  async function loadCareer() {
    try {
      const res = await fetch("/api/history");
      if (!res.ok) throw new Error("Could not load work history.");
      setCareer((await res.json()) as CareerFile);
      setCareerError(null);
    } catch {
      setCareer(EMPTY_CAREER);
      setCareerError("Could not load work history.");
    }
  }

  if (prototype) {
    return <DevPrototypeScreen kind={prototype} />;
  }

  if (error) {
    return (
      <div className="boot">
        <h1>Proforna</h1>
        <p role="alert">{error}</p>
      </div>
    );
  }

  if (!me) {
    return (
      <div className="boot">
        <h1>Proforna</h1>
        <p>Checking…</p>
      </div>
    );
  }

  if (needsOnboarding(me.profile) || reviewOnboarding) {
    return (
      <Onboarding
        initialProfile={me.profile}
        onFinished={(next) => {
          setMe(next);
          setReviewOnboarding(false);
          if (readReviewOnboarding()) window.location.hash = "#/history";
          void loadCareer();
        }}
      />
    );
  }

  return (
    <Home
      profile={me.profile}
      career={career}
      careerError={careerError}
      onProfileSaved={(profile) =>
        setMe({
          ...me,
          profile: { ...me.profile, ...profile },
        })
      }
    />
  );
}
