-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("provider","providerAccountId")
);

-- CreateTable
CREATE TABLE "Session" (
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("identifier","token")
);

-- CreateTable
CREATE TABLE "JobApplication" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "url" TEXT,
    "location" TEXT,
    "type" TEXT NOT NULL DEFAULT 'remote',
    "status" TEXT NOT NULL DEFAULT 'wishlist',
    "salaryMin" INTEGER,
    "salaryMax" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "appliedDate" TIMESTAMP(3),
    "notes" TEXT,
    "offerPayType" TEXT,
    "offerPayRate" TEXT,
    "offerSalary" INTEGER,
    "offerPayFrequency" TEXT,
    "offerHoursPerWeek" DOUBLE PRECISION,
    "offerOtHours" DOUBLE PRECISION,
    "offerOtRate" DOUBLE PRECISION DEFAULT 1.5,
    "offerSigningBonus" INTEGER,
    "offerAnnualBonus" INTEGER,
    "offerEquity" TEXT,
    "offer401kMatch" DOUBLE PRECISION,
    "offerPtoDays" INTEGER,
    "offerHealthCost" DOUBLE PRECISION,
    "offerStartDate" TIMESTAMP(3),
    "offerNotes" TEXT,
    "ein" TEXT,
    "resumeVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Interview" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobApplicationId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'phone',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER DEFAULT 60,
    "location" TEXT,
    "interviewerName" TEXT,
    "interviewerRole" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "rating" INTEGER,
    "prepNotes" TEXT,
    "questions" TEXT,
    "reflection" TEXT,
    "reflectionRating" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Interview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "company" TEXT,
    "role" TEXT,
    "linkedinUrl" TEXT,
    "relationship" TEXT NOT NULL DEFAULT 'other',
    "notes" TEXT,
    "lastContactedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecruiterSubmission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recruiterName" TEXT NOT NULL,
    "recruiterEmail" TEXT NOT NULL,
    "company" TEXT,
    "linkedinUrl" TEXT,
    "jobTitle" TEXT NOT NULL,
    "jobDescription" TEXT,
    "salaryMin" INTEGER,
    "salaryMax" INTEGER,
    "location" TEXT,
    "jobType" TEXT,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "contactId" TEXT,
    "applicationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecruiterSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'technical',
    "proficiency" TEXT NOT NULL DEFAULT 'intermediate',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Certification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "credentialUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Certification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "provider" TEXT,
    "type" TEXT NOT NULL DEFAULT 'course',
    "status" TEXT NOT NULL DEFAULT 'not_started',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "url" TEXT,
    "hoursSpent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "skills" TEXT,
    "notes" TEXT,
    "tags" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResumeVersion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filePath" TEXT,
    "fileName" TEXT,
    "fileSize" INTEGER,
    "targetRole" TEXT,
    "notes" TEXT,
    "versionNumber" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResumeVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InteractiveResume" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "targetRole" TEXT,
    "summary" TEXT,
    "theme" TEXT NOT NULL DEFAULT 'modern',
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "sections" TEXT,
    "customContent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InteractiveResume_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResumeView" (
    "id" TEXT NOT NULL,
    "resumeId" TEXT NOT NULL,
    "referrer" TEXT,
    "userAgent" TEXT,
    "sectionsViewed" TEXT,
    "durationSeconds" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResumeView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fullName" TEXT,
    "headline" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "avatarUrl" TEXT,
    "city" TEXT,
    "state" TEXT,
    "linkedinUrl" TEXT,
    "githubUrl" TEXT,
    "portfolioUrl" TEXT,
    "availability" TEXT NOT NULL DEFAULT 'open_to_work',
    "bio" TEXT,
    "preferredRoles" TEXT,
    "targetSalaryMin" INTEGER,
    "targetSalaryMax" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "locationPreference" TEXT,
    "showSkills" BOOLEAN NOT NULL DEFAULT true,
    "showResume" BOOLEAN NOT NULL DEFAULT true,
    "showCertifications" BOOLEAN NOT NULL DEFAULT true,
    "showCurrentRole" BOOLEAN NOT NULL DEFAULT true,
    "portalSlug" TEXT NOT NULL DEFAULT 'portal',
    "filingStatus" TEXT NOT NULL DEFAULT 'single',
    "federalTaxRate" DOUBLE PRECISION,
    "stateTaxRate" DOUBLE PRECISION,
    "monthlyExpenses" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CurrentPosition" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "department" TEXT,
    "location" TEXT,
    "type" TEXT NOT NULL DEFAULT 'remote',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "salary" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "description" TEXT,
    "responsibilities" TEXT,
    "techStack" TEXT,
    "managerName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "ein" TEXT,
    "legalName" TEXT,
    "companySynopsis" TEXT,
    "industry" TEXT,
    "website" TEXT,
    "address" TEXT,
    "focus" TEXT,
    "schedule" TEXT,
    "payRate" TEXT,
    "payType" TEXT NOT NULL DEFAULT 'salary',
    "differentials" TEXT,
    "payFrequency" TEXT NOT NULL DEFAULT 'biweekly',
    "rotatingSchedule" BOOLEAN NOT NULL DEFAULT false,
    "hoursPerWeek" DOUBLE PRECISION,
    "scheduleBHours" DOUBLE PRECISION,
    "otHoursA" DOUBLE PRECISION,
    "otHoursB" DOUBLE PRECISION,
    "otRate" DOUBLE PRECISION DEFAULT 1.5,
    "annualRaiseMin" DOUBLE PRECISION,
    "annualRaiseMax" DOUBLE PRECISION,
    "estimatorSettings" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CurrentPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'hardware',
    "manufacturer" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "assetTag" TEXT,
    "assignedDate" TIMESTAMP(3),
    "returnedDate" TIMESTAMP(3),
    "condition" TEXT NOT NULL DEFAULT 'good',
    "licenseKey" TEXT,
    "version" TEXT,
    "expiresAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentResource" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'manual',
    "title" TEXT NOT NULL,
    "content" TEXT,
    "fileName" TEXT,
    "fileData" BYTEA,
    "fileMime" TEXT,
    "url" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipmentResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkLog" (
    "id" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "category" TEXT NOT NULL DEFAULT 'task',
    "hours" DOUBLE PRECISION,
    "tags" TEXT,
    "accomplishment" BOOLEAN NOT NULL DEFAULT false,
    "impact" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompensationEvent" (
    "id" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'base_salary',
    "title" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompensationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Benefit" (
    "id" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'health',
    "name" TEXT NOT NULL,
    "provider" TEXT,
    "coverage" TEXT,
    "employerCost" INTEGER,
    "employeeCost" INTEGER,
    "notes" TEXT,
    "enrolledAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Benefit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeOffBalance" (
    "id" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'pto',
    "totalDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "usedDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "year" INTEGER NOT NULL,
    "accrual" TEXT NOT NULL DEFAULT 'annual',
    "carryOver" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeOffBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeOffEntry" (
    "id" TEXT NOT NULL,
    "balanceId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "days" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeOffEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaycheckRecord" (
    "id" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "payPeriodStart" TIMESTAMP(3),
    "payPeriodEnd" TIMESTAMP(3),
    "grossPay" DOUBLE PRECISION,
    "netPay" DOUBLE PRECISION,
    "payRate" DOUBLE PRECISION,
    "regularHours" DOUBLE PRECISION,
    "overtimeHours" DOUBLE PRECISION,
    "ytdGross" DOUBLE PRECISION,
    "ytdNet" DOUBLE PRECISION,
    "ytdFederalTax" DOUBLE PRECISION,
    "ytdStateTax" DOUBLE PRECISION,
    "ytdSocialSec" DOUBLE PRECISION,
    "ytdMedicare" DOUBLE PRECISION,
    "ytdRetirement" DOUBLE PRECISION,
    "ytdHealthIns" DOUBLE PRECISION,
    "ytdTotalDed" DOUBLE PRECISION,
    "taxPercentages" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaycheckRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareerGoal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "targetDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'not_started',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CareerGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Milestone" (
    "id" TEXT NOT NULL,
    "careerGoalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Milestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareerPath" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "targetRole" TEXT,
    "targetSalaryMin" INTEGER,
    "targetSalaryMax" INTEGER,
    "industry" TEXT,
    "level" TEXT NOT NULL DEFAULT 'mid',
    "requiredSkills" TEXT,
    "timelineYears" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CareerPath_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareerPathMilestone" (
    "id" TEXT NOT NULL,
    "pathId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CareerPathMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareerSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalSkills" INTEGER NOT NULL DEFAULT 0,
    "avgProficiency" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "incomeGross" DOUBLE PRECISION,
    "incomeNet" DOUBLE PRECISION,
    "activeGoals" INTEGER NOT NULL DEFAULT 0,
    "completedGoals" INTEGER NOT NULL DEFAULT 0,
    "certCount" INTEGER NOT NULL DEFAULT 0,
    "applicationsOpen" INTEGER NOT NULL DEFAULT 0,
    "interviewsCount" INTEGER NOT NULL DEFAULT 0,
    "currentRole" TEXT,
    "currentCompany" TEXT,
    "overallScore" DOUBLE PRECISION,
    "metadata" TEXT,

    CONSTRAINT "CareerSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectionScore" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "pathId" TEXT NOT NULL,
    "skillMatch" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "incomeAlignment" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "goalAlignment" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overallScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gaps" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DirectionScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareerIncomeYear" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "grossIncome" DOUBLE PRECISION NOT NULL,
    "netIncome" DOUBLE PRECISION,
    "jobCount" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CareerIncomeYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareerIncomeEntry" (
    "id" TEXT NOT NULL,
    "yearId" TEXT NOT NULL,
    "employer" TEXT NOT NULL,
    "grossIncome" DOUBLE PRECISION NOT NULL,
    "netIncome" DOUBLE PRECISION,
    "ein" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CareerIncomeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "W2Record" (
    "id" TEXT NOT NULL,
    "yearId" TEXT NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "employerName" TEXT,
    "employerEIN" TEXT,
    "employerAddress" TEXT,
    "state" TEXT,
    "wages" DOUBLE PRECISION,
    "federalTaxWithheld" DOUBLE PRECISION,
    "socialSecurityWages" DOUBLE PRECISION,
    "socialSecurityTax" DOUBLE PRECISION,
    "medicareWages" DOUBLE PRECISION,
    "medicareTax" DOUBLE PRECISION,
    "stateWages" DOUBLE PRECISION,
    "stateTaxWithheld" DOUBLE PRECISION,
    "localWages" DOUBLE PRECISION,
    "localTaxWithheld" DOUBLE PRECISION,
    "netIncome" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "W2Record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WageTier" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "hourlyRate" DOUBLE PRECISION NOT NULL,
    "yearlyRate" DOUBLE PRECISION NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WageTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "tokenExpiry" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Email" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "subject" TEXT,
    "sender" TEXT NOT NULL,
    "recipient" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "snippet" TEXT,
    "body" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "labels" TEXT,
    "applicationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Email_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "remindAt" TIMESTAMP(3) NOT NULL,
    "isDismissed" BOOLEAN NOT NULL DEFAULT false,
    "snoozedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'other',
    "entityType" TEXT,
    "entityId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchFeed" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastFetchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchFeed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchArticle" (
    "id" TEXT NOT NULL,
    "feedId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "source" TEXT,
    "summary" TEXT,
    "content" TEXT,
    "publishedAt" TIMESTAMP(3),
    "imageUrl" TEXT,
    "isBookmarked" BOOLEAN NOT NULL DEFAULT false,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketSearch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "occupation" TEXT,
    "area" TEXT,
    "dataType" TEXT NOT NULL DEFAULT 'wages',
    "lastData" TEXT,
    "lastFetchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketSearch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ein" TEXT NOT NULL,
    "name" TEXT,
    "address" TEXT,
    "state" TEXT,
    "industry" TEXT,
    "naicsCode" TEXT,
    "website" TEXT,
    "employeeCount" INTEGER,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "secCIK" TEXT,
    "form5500Data" TEXT,
    "oshaData" TEXT,
    "secData" TEXT,
    "sosData" TEXT,
    "researchNotes" TEXT,
    "lastFetchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "InteractiveResume_slug_key" ON "InteractiveResume"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_userId_key" ON "UserProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_portalSlug_key" ON "UserProfile"("portalSlug");

-- CreateIndex
CREATE UNIQUE INDEX "DirectionScore_snapshotId_pathId_key" ON "DirectionScore"("snapshotId", "pathId");

-- CreateIndex
CREATE UNIQUE INDEX "CareerIncomeYear_userId_year_key" ON "CareerIncomeYear"("userId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "EmailAccount_userId_provider_email_key" ON "EmailAccount"("userId", "provider", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Email_accountId_messageId_key" ON "Email"("accountId", "messageId");

-- CreateIndex
CREATE UNIQUE INDEX "ResearchFeed_userId_url_key" ON "ResearchFeed"("userId", "url");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyProfile_userId_ein_key" ON "CompanyProfile"("userId", "ein");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_resumeVersionId_fkey" FOREIGN KEY ("resumeVersionId") REFERENCES "ResumeVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_jobApplicationId_fkey" FOREIGN KEY ("jobApplicationId") REFERENCES "JobApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecruiterSubmission" ADD CONSTRAINT "RecruiterSubmission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Skill" ADD CONSTRAINT "Skill_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certification" ADD CONSTRAINT "Certification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningItem" ADD CONSTRAINT "LearningItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResumeVersion" ADD CONSTRAINT "ResumeVersion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InteractiveResume" ADD CONSTRAINT "InteractiveResume_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResumeView" ADD CONSTRAINT "ResumeView_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "InteractiveResume"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurrentPosition" ADD CONSTRAINT "CurrentPosition_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "CurrentPosition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentResource" ADD CONSTRAINT "EquipmentResource_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkLog" ADD CONSTRAINT "WorkLog_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "CurrentPosition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompensationEvent" ADD CONSTRAINT "CompensationEvent_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "CurrentPosition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Benefit" ADD CONSTRAINT "Benefit_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "CurrentPosition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeOffBalance" ADD CONSTRAINT "TimeOffBalance_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "CurrentPosition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeOffEntry" ADD CONSTRAINT "TimeOffEntry_balanceId_fkey" FOREIGN KEY ("balanceId") REFERENCES "TimeOffBalance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaycheckRecord" ADD CONSTRAINT "PaycheckRecord_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "CurrentPosition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareerGoal" ADD CONSTRAINT "CareerGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_careerGoalId_fkey" FOREIGN KEY ("careerGoalId") REFERENCES "CareerGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareerPath" ADD CONSTRAINT "CareerPath_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareerPathMilestone" ADD CONSTRAINT "CareerPathMilestone_pathId_fkey" FOREIGN KEY ("pathId") REFERENCES "CareerPath"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareerSnapshot" ADD CONSTRAINT "CareerSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectionScore" ADD CONSTRAINT "DirectionScore_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "CareerSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectionScore" ADD CONSTRAINT "DirectionScore_pathId_fkey" FOREIGN KEY ("pathId") REFERENCES "CareerPath"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareerIncomeYear" ADD CONSTRAINT "CareerIncomeYear_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareerIncomeEntry" ADD CONSTRAINT "CareerIncomeEntry_yearId_fkey" FOREIGN KEY ("yearId") REFERENCES "CareerIncomeYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "W2Record" ADD CONSTRAINT "W2Record_yearId_fkey" FOREIGN KEY ("yearId") REFERENCES "CareerIncomeYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WageTier" ADD CONSTRAINT "WageTier_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailAccount" ADD CONSTRAINT "EmailAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Email" ADD CONSTRAINT "Email_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Email" ADD CONSTRAINT "Email_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "JobApplication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchFeed" ADD CONSTRAINT "ResearchFeed_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchArticle" ADD CONSTRAINT "ResearchArticle_feedId_fkey" FOREIGN KEY ("feedId") REFERENCES "ResearchFeed"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketSearch" ADD CONSTRAINT "MarketSearch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyProfile" ADD CONSTRAINT "CompanyProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
