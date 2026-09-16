import { isHttpUrl } from "./model-connection";

export const PROFILE_AVATAR_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export const PROFILE_AVATAR_MAX_BYTES = 5 * 1024 * 1024;

export type ProfileFields = {
  fullName: string;
  headline: string;
  city: string;
  state: string;
  bio: string;
  linkedinUrl: string;
  githubUrl: string;
  portfolioUrl: string;
};

export type ProfilePrepareError = "name-required" | "url-invalid";

export type ProfileInput = {
  fullName?: unknown;
  headline?: unknown;
  city?: unknown;
  state?: unknown;
  bio?: unknown;
  linkedinUrl?: unknown;
  githubUrl?: unknown;
  portfolioUrl?: unknown;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function optionalHttpUrl(value: unknown): string | null {
  const url = text(value);
  if (!url) return "";
  return isHttpUrl(url) ? url : null;
}

export function isAvatarType(mime: string): boolean {
  return (PROFILE_AVATAR_TYPES as readonly string[]).includes(mime);
}

export function avatarExtension(mime: string): string | null {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return null;
}

export function prepareProfile(
  input: ProfileInput,
):
  | { ok: true; value: ProfileFields }
  | { ok: false; error: ProfilePrepareError } {
  const fullName = text(input.fullName);
  if (!fullName) return { ok: false, error: "name-required" };

  const linkedinUrl = optionalHttpUrl(input.linkedinUrl);
  const githubUrl = optionalHttpUrl(input.githubUrl);
  const portfolioUrl = optionalHttpUrl(input.portfolioUrl);
  if (linkedinUrl === null || githubUrl === null || portfolioUrl === null) {
    return { ok: false, error: "url-invalid" };
  }

  return {
    ok: true,
    value: {
      fullName,
      headline: text(input.headline),
      city: text(input.city),
      state: text(input.state),
      bio: text(input.bio),
      linkedinUrl,
      githubUrl,
      portfolioUrl,
    },
  };
}
