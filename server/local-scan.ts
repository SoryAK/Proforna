import net from "node:net";
import {
  LOCAL_SCAN_PORT_MAX,
  LOCAL_SCAN_PORT_MIN,
  presentRangeHits,
  type LocalScanHit,
} from "../core/model-onboarding";
import { listOpenAiCompatModels } from "./openai-compat";

const CONNECT_CONCURRENCY = 128;
const CONNECT_TIMEOUT_MS = 150;
const READ_CONCURRENCY = 8;
const READ_TIMEOUT_MS = 800;

export function localScanPorts(
  min = LOCAL_SCAN_PORT_MIN,
  max = LOCAL_SCAN_PORT_MAX,
): number[] {
  const start = Math.min(min, max);
  const end = Math.max(min, max);
  const ports: number[] = [];
  for (let port = start; port <= end; port += 1) ports.push(port);
  return ports;
}

export async function scanLocalModels(input?: {
  ports?: number[];
  signal?: AbortSignal;
  connect?: (port: number, signal?: AbortSignal) => Promise<boolean>;
}): Promise<LocalScanHit[]> {
  const ports = input?.ports ?? localScanPorts();
  const signal = input?.signal;
  const connect = input?.connect ?? ((port, next) => portAccepts(port, next));
  const open: number[] = [];
  await mapPool(ports, CONNECT_CONCURRENCY, async (port) => {
    if (signal?.aborted) return;
    if (await connect(port, signal)) open.push(port);
  });
  const found: LocalScanHit[] = [];
  await mapPool(open, READ_CONCURRENCY, async (port) => {
    if (signal?.aborted) return;
    const baseUrl = `http://127.0.0.1:${port}/v1`;
    const result = await listOpenAiCompatModels({
      baseUrl,
      timeoutMs: READ_TIMEOUT_MS,
      signal,
    });
    if (result.ok && result.models.length > 0) found.push({ baseUrl, models: result.models });
  });
  return presentRangeHits(found);
}

function portAccepts(port: number, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port, family: 4 });
    let settled = false;
    const finish = (open: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      socket.destroy();
      resolve(open);
    };
    const onAbort = () => finish(false);
    const timer = setTimeout(() => finish(false), CONNECT_TIMEOUT_MS);
    signal?.addEventListener("abort", onAbort, { once: true });
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

async function mapPool<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  let index = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      if (current !== undefined) await worker(current);
    }
  });
  await Promise.all(runners);
}
