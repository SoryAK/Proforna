import type { ProviderId } from "./types";

/**
 * Provider-side error that carries the upstream HTTP status and (when
 * applicable) a `retryAfter` hint in seconds. Routes can catch this to
 * propagate quota-aware responses without string-matching the message.
 *
 * @example
 * try {
 *   const { json } = await ai.generate({ task: "extract", messages });
 * } catch (e) {
 *   if (e instanceof AIProviderError) {
 *     return NextResponse.json(
 *       { error: e.message, retryAfter: e.retryAfter },
 *       { status: e.status ?? 500 },
 *     );
 *   }
 *   throw e;
 * }
 */
export class AIProviderError extends Error {
  readonly status?: number;
  readonly retryAfter?: number;
  readonly providerId?: ProviderId;

  constructor(opts: {
    message: string;
    status?: number;
    retryAfter?: number;
    providerId?: ProviderId;
  }) {
    super(opts.message);
    this.name = "AIProviderError";
    this.status = opts.status;
    this.retryAfter = opts.retryAfter;
    this.providerId = opts.providerId;
  }
}
