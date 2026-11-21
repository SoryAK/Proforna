import type { RelayRequestState } from "../core/index";
import type { ProjectionRelay, RelayProjection } from "./projections";
import type { RelayAsk, RequestRelay } from "./requests";

export function createHttpProjectionRelay(
  baseUrl: string,
  ownerToken: string,
): ProjectionRelay {
  const root = baseUrl.replace(/\/+$/, "");
  async function request(
    path: string,
    init: RequestInit,
  ): Promise<void> {
    const response = await fetch(`${root}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${ownerToken}`,
        "content-type": "application/json",
        ...init.headers,
      },
    });
    if (!response.ok) {
      throw new RelayTransportError(response.status, await response.text());
    }
  }
  return {
    async publish(projection: RelayProjection) {
      await request(`/relay/publications/${encodeURIComponent(projection.slug)}`, {
        method: "PUT",
        body: JSON.stringify({ projection }),
      });
    },
    async revoke(slug: string) {
      await request(`/relay/publications/${encodeURIComponent(slug)}`, {
        method: "DELETE",
      });
    },
    async grant(slug: string, grant: { token: string; expiresAt: string }) {
      await request(
        `/relay/publications/${encodeURIComponent(slug)}/grants`,
        { method: "POST", body: JSON.stringify(grant) },
      );
    },
  };
}

/** Requests on the Relay: create or change, withdraw, and read back answers. */
export function createHttpRequestRelay(baseUrl: string, ownerToken: string): RequestRelay {
  const root = baseUrl.replace(/\/+$/, "");
  async function call(path: string, init: RequestInit): Promise<Response> {
    const response = await fetch(`${root}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${ownerToken}`,
        "content-type": "application/json",
        ...init.headers,
      },
    });
    if (!response.ok) throw new RelayTransportError(response.status, await response.text());
    return response;
  }
  return {
    async putAsk(tokenHash: string, ask: RelayAsk) {
      await call(`/relay/asks/${tokenHash}`, { method: "PUT", body: JSON.stringify(ask) });
    },
    async withdrawAsk(tokenHash: string) {
      await call(`/relay/asks/${tokenHash}`, { method: "DELETE" });
    },
    async askStates(tokenHashes: string[]) {
      const response = await call("/relay/asks/states", {
        method: "POST",
        body: JSON.stringify({ hashes: tokenHashes }),
      });
      return ((await response.json()) as { states: Record<string, RelayRequestState> }).states;
    },
  };
}

export class RelayTransportError extends Error {
  constructor(
    readonly status: number,
    readonly response: string,
  ) {
    super(`Relay request failed (${status}).`);
  }
}
