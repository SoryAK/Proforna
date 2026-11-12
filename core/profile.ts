import { isHttpUrl } from "./model-connection";

export const PROFILE_AVATAR_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export const PROFILE_AVATAR_MAX_BYTES = 5 * 1024 * 1024;

export type ProfileFields = {
  firstName: string;
  lastName: string;
  fullName: string;
  headline: string;
  address: string;
  city: string;
  state: string;
  bio: string;
  linkedinUrl: string;
  githubUrl: string;
  portfolioUrl: string;
};

export type ProfilePrepareError = "name-required" | "url-invalid";

export type ProfileInput = {
  firstName?: unknown;
  lastName?: unknown;
  fullName?: unknown;
  headline?: unknown;
  address?: unknown;
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

/** First word is the given name. The rest is the family name. */
export function splitPersonName(fullName: string): { firstName: string; lastName: string } {
  const cleaned = fullName.trim().replace(/\s+/g, " ");
  const space = cleaned.indexOf(" ");
  if (space < 0) return { firstName: cleaned, lastName: "" };
  return { firstName: cleaned.slice(0, space), lastName: cleaned.slice(space + 1) };
}

export function joinPersonName(firstName: string, lastName: string): string {
  return [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
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
  const parts =
    input.firstName !== undefined || input.lastName !== undefined
      ? { firstName: text(input.firstName), lastName: text(input.lastName) }
      : splitPersonName(text(input.fullName));
  const fullName = joinPersonName(parts.firstName, parts.lastName);
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
      firstName: parts.firstName,
      lastName: parts.lastName,
      fullName,
      headline: text(input.headline),
      address: text(input.address),
      city: text(input.city),
      state: text(input.state),
      bio: text(input.bio),
      linkedinUrl,
      githubUrl,
      portfolioUrl,
    },
  };
}
