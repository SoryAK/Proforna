export interface DashboardData {
  stats: {
    totalApplications: number;
    activeApplications: number;
    interviews: number;
    upcomingInterviews: number;
    contacts: number;
    skills: number;
    goals: number;
    resumes: number;
    newSubmissions: number;
  };
  pipeline: { status: string; count: number }[];
  recentActivity: {
    id: string;
    entityType: string;
    action: string;
    description: string;
    createdAt: string;
  }[];
  currentPosition: {
    id: string;
    company: string;
    role: string;
    department: string | null;
    location: string | null;
    type: string;
    startDate: string;
    salary: number | null;
    currency: string;
    description: string | null;
    responsibilities: string | null;
    techStack: string | null;
    payType: string;
    payRate: string | null;
    payFrequency: string;
    hoursPerWeek: number | null;
    scheduleBHours: number | null;
    rotatingSchedule: boolean;
    otHoursA: number | null;
    otHoursB: number | null;
    otRate: number | null;
    differentials: string | null;
    estimatorSettings: string | null;
  } | null;
  profile: {
    fullName: string | null;
    headline: string | null;
    email: string | null;
    phone: string | null;
    avatarUrl: string | null;
    city: string | null;
    state: string | null;
    linkedinUrl: string | null;
    githubUrl: string | null;
    portfolioUrl: string | null;
    schedulingUrl: string | null;
    availability: string;
    bio: string | null;
    preferredRoles: string | null;
    locationPreference: string | null;
    targetSalaryMin: number | null;
    targetSalaryMax: number | null;
    currency: string;
  } | null;
  topSkills: {
    id: string;
    name: string;
    category: string;
    proficiency: string;
  }[];
  certifications: {
    id: string;
    name: string;
    issuer: string;
    issueDate: string;
    expiryDate: string | null;
    credentialUrl: string | null;
  }[];
  activeGoals: {
    id: string;
    title: string;
    description: string | null;
    targetDate: string | null;
    status: string;
    priority: string;
    milestones: { id: string; title: string; completed: boolean }[];
  }[];
  cfm: {
    incomeYears: {
      id: string;
      year: number;
      grossIncome: number;
      netIncome: number | null;
      jobCount: number;
    }[];
    wageTiers: {
      id: string;
      label: string;
      hourlyRate: number;
      yearlyRate: number;
      color: string;
    }[];
  };
  upcomingInterviewDetails: {
    id: string;
    type: string;
    scheduledAt: string;
    durationMinutes: number | null;
    location: string | null;
    interviewerName: string | null;
    interviewerRole: string | null;
    jobApplication: { company: string; role: string };
  }[];
  expiringCertifications: {
    id: string;
    name: string;
    issuer: string;
    expiryDate: string | null;
  }[];
  learningSummary: {
    total: number;
    inProgress: number;
    completed: number;
    totalHours: number;
    recentItems: {
      id: string;
      title: string;
      status: string;
      progress: number;
      provider: string | null;
    }[];
  };
  cdmSummary: {
    overallScore: number | null;
    capturedAt: string;
    pathCount: number;
    paths: { title: string; score: number; skillMatch: number }[];
  } | null;
  unreadArticleCount: number;
  recentArticles: {
    id: string;
    title: string;
    url: string;
    source: string | null;
    summary: string | null;
    publishedAt: string | null;
    imageUrl: string | null;
    feed: { title: string; category: string };
  }[];
}

export type EditProfileForm = {
  fullName: string;
  headline: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  linkedinUrl: string;
  githubUrl: string;
  portfolioUrl: string;
  schedulingUrl: string;
  availability: string;
  bio: string;
  preferredRoles: string;
  locationPreference: string;
  avatarUrl: string;
};
