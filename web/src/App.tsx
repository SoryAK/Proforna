import { useEffect, useState } from "react";
import { needsOnboarding } from "@core/onboarding";
import { Onboarding } from "./Onboarding";

type Health = { ok: boolean; product: string; db: string };
type Me = {
  occupant: { id: string };
  profile: { fullName: string; onboardingCompletedAt: string | null };
};

export function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/health").then(async (res) => {
        if (!res.ok) throw new Error(`health ${res.status}`);
        return (await res.json()) as Health;
      }),
      fetch("/api/me").then(async (res) => {
        if (!res.ok) throw new Error(`me ${res.status}`);
        return (await res.json()) as Me;
      }),
    ])
      .then(([nextHealth, nextMe]) => {
        setHealth(nextHealth);
        setMe(nextMe);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "load failed"),
      );
  }, []);

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

  if (needsOnboarding(me.profile)) {
    return (
      <Onboarding
        initialName={me.profile.fullName}
        onFinished={setMe}
      />
    );
  }

  return (
    <main>
      <h1>Home</h1>
      <p>
        Welcome{me.profile.fullName ? `, ${me.profile.fullName}` : ""}. Occupant{" "}
        <code>{me.occupant.id}</code>.
      </p>
      {health ? (
        <p>
          {health.product} is up. Database {health.db}.
        </p>
      ) : null}
    </main>
  );
}
