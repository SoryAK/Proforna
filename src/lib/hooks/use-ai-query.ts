"use client";

import {
  useMutation,
  useQuery,
  type UseMutationOptions,
  type UseMutationResult,
  type UseQueryOptions,
  type UseQueryResult,
} from "@tanstack/react-query";

import { type AIMeta, unwrapAIEnvelope } from "@/lib/ai/envelope";

/**
 * AI route consumer hooks introduced by ADR-0045.
 *
 * Both wrap their TanStack counterpart and replace `data` with the unwrapped
 * payload from the { data, _ai } envelope (see src/lib/ai/envelope.ts) while
 * adding a sibling `ai` field for <AIProvenanceChip />.
 *
 * Pure unwrap logic lives in envelope.ts and is fully test-covered there;
 * these hooks intentionally stay thin so they need no jsdom test stack
 * (vitest config is node-only — see ADR-0018 + user-memory).
 *
 * Routes that have not yet been migrated to the envelope return bare data;
 * `unwrapAIEnvelope` yields `ai: undefined` in that case so chip render
 * sites no-op without exploding during the Day 2 migration.
 */

export type UseAIQueryResult<T> = Omit<UseQueryResult<unknown, Error>, "data"> & {
  data: T | undefined;
  ai: AIMeta | undefined;
};

export type UseAIMutationResult<TInput, TOutput> = Omit<
  UseMutationResult<unknown, Error, TInput>,
  "data"
> & {
  data: TOutput | undefined;
  ai: AIMeta | undefined;
};

type AIQueryOptions = Omit<
  UseQueryOptions<unknown, Error, unknown, readonly unknown[]>,
  "queryFn"
> & {
  /** AI route URL (must return either an AIEnvelope or bare JSON). */
  url: string;
  /** Optional request init override (defaults to plain GET). */
  init?: RequestInit;
};

/**
 * GET-style AI route hook. Wraps `useQuery` and returns `{ data, ai, ...rest }`
 * where `data` is the unwrapped envelope payload.
 */
export function useAIQuery<T>(opts: AIQueryOptions): UseAIQueryResult<T> {
  const { url, init, ...rest } = opts;
  const query = useQuery({
    ...rest,
    queryFn: async () => {
      const res = await fetch(url, init);
      if (!res.ok) {
        throw new Error(`AI request failed: ${res.status} ${res.statusText}`);
      }
      return res.json();
    },
  });
  const { data, ai } = unwrapAIEnvelope<T>(query.data);
  return { ...query, data, ai } as UseAIQueryResult<T>;
}

type AIMutationOptions<TInput> = Omit<
  UseMutationOptions<unknown, Error, TInput>,
  "mutationFn"
> & {
  /** AI route URL (POST endpoint that returns an AIEnvelope or bare JSON). */
  url: string;
  /**
   * Override the request shape. Defaults to POST + `application/json` body
   * of `JSON.stringify(input)`. Override for multipart (e.g. resume-parse).
   */
  buildRequest?: (input: TInput) => RequestInit;
};

/**
 * POST-style AI route hook. Wraps `useMutation`; `data` and `ai` reflect
 * the most recent successful call.
 */
export function useAIMutation<TInput, TOutput>(
  opts: AIMutationOptions<TInput>,
): UseAIMutationResult<TInput, TOutput> {
  const { url, buildRequest, ...rest } = opts;
  const mutation = useMutation({
    ...rest,
    mutationFn: async (input: TInput) => {
      const init: RequestInit =
        buildRequest?.(input) ?? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        };
      const res = await fetch(url, init);
      if (!res.ok) {
        throw new Error(`AI request failed: ${res.status} ${res.statusText}`);
      }
      return res.json();
    },
  });
  const { data, ai } = unwrapAIEnvelope<TOutput>(mutation.data);
  return { ...mutation, data, ai } as UseAIMutationResult<TInput, TOutput>;
}
