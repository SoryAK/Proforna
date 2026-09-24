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
  keptOnboardingHistory,
  onboardingCheckItems,
  profileAfterOnboarding,
  ONBOARDING_NO_PLACE,
  type OnboardingCheckItem,
  type OnboardingLinkAnswer,
  type OnboardingPlaceAnswer,
} from "./onboarding-review";
export {
  PROFILE_AVATAR_MAX_BYTES,
  PROFILE_AVATAR_TYPES,
  avatarExtension,
  isAvatarType,
  prepareProfile,
  type ProfileFields,
} from "./profile";
export {
  COMMAND_SYSTEM_PROMPT,
  EXTRACT_FACTS_SYSTEM_PROMPT,
  INSPECT_SYSTEM_PROMPT,
  SUGGEST_REPLY_SYSTEM_PROMPT,
  parseExtractedWorklogFacts,
  parseSuggestedReply,
  planAgentRun,
  type AgencyError,
  type AgentPurpose,
  type AgentRun,
  type AgentScope,
  type CapabilityGrant,
} from "./agency";
export {
  prepareCommandMessage,
  prepareCommandSession,
  presentCommandHistory,
  titleFromOccupantTurn,
  type CommandMessage,
  type CommandSession,
  type CommandSessionError,
  type CommandSpeaker,
} from "./command-session";
export {
  DEFAULT_LOCAL_BASE_URL,
  LLAMA_CPP_BASE_URL,
  OPENAI_BASE_URL,
  OPENROUTER_BASE_URL,
  prepareModelConnection,
  type ModelHosting,
} from "./model-connection";
export { parseDiscoveredModels } from "./model-list";
export {
  LOCAL_ONBOARDING_ENDPOINTS,
  planModelOnboarding,
  presentModelId,
  suggestChatModel,
  type LocalProbeResult,
  type ModelOnboardingSurface,
  type ModelProviderId,
} from "./model-onboarding";
export {
  classifyResumePreview,
  type ResumePreviewKind,
} from "./resume-preview";
export { linesFromPdfRuns, type PdfTextRun } from "./pdf-text";
export {
  EXTRACT_SYSTEM_PROMPT,
  emptyExtractedResume,
  fillProfileFromExtract,
  isExtractReviewComplete,
  isExtractableResumeText,
  parseExtractedResume,
  parseExtractedResumeText,
  parseHistoryResumeId,
  type ExtractedResume,
  type ExtractedSite,
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
  CAREER_HISTORY_SECTIONS,
  classifyCareerHistorySection,
  formatHistoryGist,
  formatHistoryPlace,
  groupCareerHistory,
  presentCareerHistoryStats,
  searchCareerHistory,
  sortCareerHistory,
  type CareerHistoryGroup,
  type CareerHistoryItem,
  type CareerHistoryStats,
} from "./career-history";
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
  planResumeImportFacts,
  prepareCareerFact,
  prepareEvidence,
  type CareerFactVersion,
  type CareerMemoryError,
  type CareerMemoryState,
  type Evidence,
  type ResumeImportRole,
  type Sensitivity,
} from "./career-memory";
export {
  prepareWorklogEntry,
  planWorklogFactChangeSet,
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
  planProjectionAccessDecision,
  planProjectionGrant,
  planProjectionRevoke,
  type InteractiveProjection,
  type ProjectionDisclosure,
  type ProjectionError,
  type ProjectionVisibility,
} from "./projection";
export {
  presentInboundAccessRequest,
  planOpportunityNetworkPromotion,
  resolveInboundAccessRequest,
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
  inboundRaisesNotice,
  planSuggestedReplyChangeSet,
  prepareContactMessage,
  presentInboundMessageNotice,
  type ContactMessage,
  type ConversationError,
  type MessageDirection,
} from "./conversation";
export {
  noticeHrefForDestination,
  presentOccupantNotices,
  type OccupantNotice,
  type OccupantNoticeHref,
  type OccupantNoticeKind,
} from "./notices";
export {
  CURATED_CAPABILITIES,
  PORTABLE_FORMAT_VERSION,
  validatePortableManifest,
  type IntegrationConnection,
  type IntegrationKind,
  type PortableManifest,
} from "./portability";
export {
  prepareResidence,
  residenceForMap,
  residencesToClose,
  type Residence,
  type ResidenceError,
  type ResidenceSpan,
  type RoleSpan,
} from "./residence";
export {
  DEFAULT_MAP_ICONS,
  DEFAULT_MAP_SETTINGS,
  MAP_ICON_CHOICES,
  MAP_THEMES,
  parseMapIcons,
  prepareMapSettings,
  type MapPinIcons,
  type MapPinKind,
  type MapPinTheme,
  type MapProvider,
  type MapSettings,
  type MapSettingsError,
  type MapThemeId,
} from "./map-settings";
export {
  EMPTY_WORK_MAP_DETAILS,
  attachFactsToWorkMapRole,
  buildWorkMapSnapshot,
  normalizeSlug,
  normalizeWorkMapDetails,
  planWorkMapPublicationSettings,
  planWorkMapRoleFactSync,
  prepareWorkMapLocation,
  prepareWorkMapRoleCreate,
  presentWorkMapPlace,
  roleCoverPhoto,
  publicationAllowsSnapshot,
  publicationNeedsAudienceConfirm,
  type PreparedWorkMapLocation,
  type WorkMapClaim,
  type WorkMapLocation,
  type WorkMapMedia,
  type WorkMapMoment,
  type WorkMapPlace,
  type WorkMapPublicationSettings,
  type WorkMapPublishSection,
  type WorkMapRole,
  type WorkMapRoleDetails,
  type WorkMapShare,
  type WorkMapSnapshot,
} from "./work-map";
export {
  careerFrame,
  careerMoments,
  careerMonth,
  careerMonths,
  careerSpan,
  nextCareerMoment,
  residenceAt,
  rolesActiveAt,
  rolesStartedBy,
  type CareerFrame,
  type CareerMoment,
  type CareerMomentKind,
  type CareerTimelineResidence,
  type CareerTimelineRole,
} from "./career-timeline";
