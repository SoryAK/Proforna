export const APPLICATION_STATUSES = [
  "wishlist",
  "applied",
  "screening",
  "interviewing",
  "offer",
  "accepted",
  "rejected",
  "withdrawn",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  wishlist: "Wishlist",
  applied: "Applied",
  screening: "Screening",
  interviewing: "Interviewing",
  offer: "Offer",
  accepted: "Accepted",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

export const STATUS_COLORS: Record<ApplicationStatus, string> = {
  wishlist: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  applied: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  screening: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  interviewing: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  offer: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  accepted: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  withdrawn: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
};

export const INTERVIEW_TYPES = ["phone", "technical", "behavioral", "onsite", "panel"] as const;
export type InterviewType = (typeof INTERVIEW_TYPES)[number];

export const INTERVIEW_STATUSES = ["scheduled", "completed", "cancelled"] as const;
export type InterviewStatus = (typeof INTERVIEW_STATUSES)[number];

export const JOB_TYPES = ["remote", "hybrid", "onsite"] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const RELATIONSHIP_TYPES = ["recruiter", "referral", "colleague", "mentor", "other"] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

export const SKILL_CATEGORIES = ["technical", "soft", "language", "tool"] as const;
export type SkillCategory = (typeof SKILL_CATEGORIES)[number];

export const PROFICIENCY_LEVELS = ["beginner", "intermediate", "advanced", "expert"] as const;
export type ProficiencyLevel = (typeof PROFICIENCY_LEVELS)[number];

export const GOAL_STATUSES = ["not_started", "in_progress", "completed", "abandoned"] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

export const PRIORITIES = ["low", "medium", "high"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const AVAILABILITY_STATUSES = ["open_to_work", "selectively_open", "not_looking"] as const;
export type AvailabilityStatus = (typeof AVAILABILITY_STATUSES)[number];

export const AVAILABILITY_LABELS: Record<AvailabilityStatus, string> = {
  open_to_work: "Open to Work",
  selectively_open: "Selectively Open",
  not_looking: "Not Looking",
};

export const AVAILABILITY_COLORS: Record<AvailabilityStatus, string> = {
  open_to_work: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  selectively_open: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  not_looking: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

export const SUBMISSION_STATUSES = ["new", "reviewed", "archived"] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export const SUBMISSION_LABELS: Record<SubmissionStatus, string> = {
  new: "New",
  reviewed: "Reviewed",
  archived: "Archived",
};

export const SUBMISSION_COLORS: Record<SubmissionStatus, string> = {
  new: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  reviewed: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  archived: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

export const NAV_ITEMS = [
  { label: "Home", href: "/dashboard", icon: "Home" },
  { label: "Jobs", href: "/current-position", icon: "Building2" },
  { label: "Job Search", href: "/job-search", icon: "Search" },
  { label: "Career Analytics", href: "/career-growth", icon: "TrendingUp" },
  { label: "Insights", href: "/insights", icon: "BarChart3" },
  { label: "Research", href: "/research", icon: "BookOpen" },
  { label: "Documents", href: "/docs", icon: "FolderOpen" },
  { label: "Portal Settings", href: "/portal-settings", icon: "Globe" },
] as const;
