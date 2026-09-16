import { useEffect, useState } from "react";

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

  return (
    <main>
      <h1>Proforna</h1>
      <p>Personal career management.</p>
      {error ? <p role="alert">{error}</p> : null}
      {me ? (
        <p>
          Occupant <code>{me.occupant.id}</code>
          {me.profile.fullName ? ` — ${me.profile.fullName}` : ""}. No account
          to create.
        </p>
      ) : error ? null : (
        <p>Checking…</p>
      )}
      {health ? (
        <p>
          {health.product} is up. Database {health.db}.
        </p>
      ) : null}
    </main>
  );
}
