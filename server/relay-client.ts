import type { ProjectionRelay, RelayProjection } from "./projections";

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

export class RelayTransportError extends Error {
  constructor(
    readonly status: number,
    readonly response: string,
  ) {
    super(`Relay request failed (${status}).`);
  }
}
