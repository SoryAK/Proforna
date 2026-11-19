import { useEffect, useState } from "react";
import type { RelayStatus } from "@core/projection";

const RELAY_CHANGED = "docier:relay-changed";

export function announceRelayChange() {
  window.dispatchEvent(new Event(RELAY_CHANGED));
}

export function useRelayStatus(revision: number): RelayStatus | null {
  const [status, setStatus] = useState<RelayStatus | null>(null);
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    const bump = () => setPulse((value) => value + 1);
    window.addEventListener(RELAY_CHANGED, bump);
    window.addEventListener("focus", bump);
    const timer = window.setInterval(bump, 30_000);
    return () => {
      window.removeEventListener(RELAY_CHANGED, bump);
      window.removeEventListener("focus", bump);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/work-map/relay", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as { relay?: RelayStatus };
        if (body.relay) setStatus(body.relay);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [revision, pulse]);

  return status;
}
