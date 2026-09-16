import { useEffect, useState } from "react";

type Health = { ok: boolean; product: string; db: string };

export function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then(async (res) => {
        if (!res.ok) throw new Error(`health ${res.status}`);
        return (await res.json()) as Health;
      })
      .then(setHealth)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "health failed"),
      );
  }, []);

  return (
    <main>
      <h1>Proforna</h1>
      <p>Personal career management.</p>
      {error ? <p role="alert">{error}</p> : null}
      {health ? (
        <p>
          {health.product} is up. Database {health.db}.
        </p>
      ) : error ? null : (
        <p>Checking…</p>
      )}
    </main>
  );
}
