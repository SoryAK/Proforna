import { isPublicAddress } from "./linked-page";
import { isLinkedEvidenceUrl } from "./work-map";

export type FrameHeaderSet = {
  frameOptions: string | null;
  contentSecurityPolicy: string | string[] | null;
};

export function isFrameTarget(value: string): boolean {
  if (!isLinkedEvidenceUrl(value)) return false;
  let host = "";
  try {
    host = new URL(value).hostname.replace(/^\[|\]$/g, "").toLowerCase();
  } catch {
    return false;
  }
  if (!host || host === "localhost" || host.endsWith(".localhost")) return false;
  if (host.includes(":") || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return isPublicAddress(host);
  return true;
}

export function pageAllowsFrame(headers: FrameHeaderSet): boolean {
  const frameOptions = (headers.frameOptions ?? "").split(",")[0]?.trim().toLowerCase() ?? "";
  if (frameOptions === "deny" || frameOptions === "sameorigin") return false;
  const policies = headerPolicies(headers.contentSecurityPolicy);
  return policies.every(ancestorsAllow);
}

function headerPolicies(value: string | string[] | null): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function ancestorsAllow(policy: string): boolean {
  const directive = policy
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.toLowerCase().startsWith("frame-ancestors"));
  if (!directive) return true;
  const sources = directive
    .split(/\s+/)
    .slice(1)
    .map((source) => source.toLowerCase().replace(/^['"]|['"]$/g, ""));
  if (sources.length === 0 || sources.includes("none")) return false;
  return sources.some((source) => source === "*" || source === "https:" || source === "http:");
}
