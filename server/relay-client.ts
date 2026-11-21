import type { RelayRequestState } from "../core/index";
import type { ProjectionRelay, RelayProjection } from "./projections";
import type { InboundAccessRequest, RelayAsk, RequestRelay } from "./requests";

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
  async function read(path: string): Promise<Response> {
    const response = await fetch(`${root}${path}`, {
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    if (!response.ok) throw new RelayTransportError(response.status, await response.text());
    return response;
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
    async revokeGrant(slug: string, tokenHash: string) {
      await request(
        `/relay/publications/${encodeURIComponent(slug)}/grants/${encodeURIComponent(tokenHash)}`,
        { method: "DELETE" },
      );
    },
    async erase(slug: string) {
      await request(`/relay/publications/${encodeURIComponent(slug)}/erase`, {
        method: "POST",
      });
    },
    async grant(slug: string, grant: { token: string; expiresAt: string; sections?: string[] | null }) {
      await request(
        `/relay/publications/${encodeURIComponent(slug)}/grants`,
        { method: "POST", body: JSON.stringify(grant) },
      );
    },
    async updateGrant(slug: string, tokenHash: string, change: { expiresAt: string; sections: string[] | null }) {
      await request(
        `/relay/publications/${encodeURIComponent(slug)}/grants/${encodeURIComponent(tokenHash)}`,
        { method: "PATCH", body: JSON.stringify(change) },
      );
    },
    async grantOpens(after: string) {
      const response = await read(`/relay/grants/opens?after=${encodeURIComponent(after)}`);
      return ((await response.json()) as {
        opens: Array<{ id: string; slug: string; tokenHash: string; openedAt: string }>;
      }).opens;
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
    async forgetJoin(tokenHash: string) {
      await call(`/relay/asks/${tokenHash}/join`, { method: "DELETE" });
    },
    async inbound(after: string) {
      const response = await call(`/relay/inbound?after=${encodeURIComponent(after)}`, { method: "GET" });
      return ((await response.json()) as { requests: InboundAccessRequest[] }).requests;
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
