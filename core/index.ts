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
  PROFILE_AVATAR_MAX_BYTES,
  PROFILE_AVATAR_TYPES,
  avatarExtension,
  isAvatarType,
  prepareProfile,
  type ProfileFields,
} from "./profile";
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
export {
  currentJob,
  currentJobs,
  formatCareerSpan,
  presentCareerFile,
  type CareerFile,
  type CareerJob,
  type CareerSchool,
} from "./career-file";
export {
  searchCareerFile,
  type CareerSearchHit,
} from "./career-search";
export {
  authorizeChangeSet,
  createApproval,
  hashChangeSet,
  prepareChangeSet,
  stableStringify,
  type Approval,
  type AuditEvent,
  type ChangeOperation,
  type ChangeSet,
  type GovernanceError,
} from "./governance";
export {
  canonicalFacts,
  commitCareerFactChanges,
  prepareCareerFact,
  prepareEvidence,
  type CareerFactVersion,
  type CareerMemoryError,
  type CareerMemoryState,
  type Evidence,
  type Sensitivity,
} from "./career-memory";
export {
  prepareWorklogEntry,
  proposeFactsFromWorklog,
  type WorklogEntry,
  type WorklogError,
  type WorklogFactProposal,
} from "./worklog";
export {
  assertClaimsTraceable,
  buildResumeRevision,
  prepareResumeVariant,
  type ResumeClaim,
  type ResumeRevision,
  type ResumeStudioError,
  type ResumeVariant,
} from "./resume-studio";
export {
  buildInteractiveProjection,
  canViewProjection,
  mayPublishProjection,
  type InteractiveProjection,
  type ProjectionDisclosure,
  type ProjectionError,
  type ProjectionVisibility,
} from "./projection";
export {
  prepareExternalAction,
  prepareOpportunity,
  transitionApplication,
  type Application,
  type ApplicationStage,
  type CareerManagementError,
  type CareerPlan,
  type CareerTask,
  type Contact,
  type ExternalAction,
  type ExternalActionKind,
  type Opportunity,
  type OpportunityKind,
} from "./career-management";
export {
  CURATED_CAPABILITIES,
  PORTABLE_FORMAT_VERSION,
  validatePortableManifest,
  type IntegrationConnection,
  type IntegrationKind,
  type PortableManifest,
} from "./portability";
export {
  EMPTY_WORK_MAP_DETAILS,
  attachFactsToWorkMapRole,
  buildWorkMapSnapshot,
  normalizeSlug,
  planWorkMapRoleFactSync,
  type WorkMapClaim,
  type WorkMapLocation,
  type WorkMapMedia,
  type WorkMapMoment,
  type WorkMapPublicationSettings,
  type WorkMapPublishSection,
  type WorkMapRole,
  type WorkMapRoleDetails,
  type WorkMapSnapshot,
} from "./work-map";
