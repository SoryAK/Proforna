/** Product identity for shells. Management logic lives in this folder. */
export const PRODUCT = {
  name: "Proforna",
  kind: "personal-career-management",
} as const;

export {
  isOnboardingProfileComplete,
  needsOnboarding,
  type OnboardingProfile,
} from "./onboarding";
export {
  DEFAULT_LOCAL_BASE_URL,
  prepareModelConnection,
  type ModelHosting,
} from "./model-connection";
export { parseDiscoveredModels } from "./model-list";
export {
  classifyResumePreview,
  type ResumePreviewKind,
} from "./resume-preview";
export { linesFromPdfRuns, type PdfTextRun } from "./pdf-text";
export {
  EXTRACT_SYSTEM_PROMPT,
  emptyExtractedResume,
  isExtractableResumeText,
  parseExtractedResume,
  parseExtractedResumeText,
  type ExtractedResume,
} from "./resume-extract";
