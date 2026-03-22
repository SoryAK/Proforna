import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";

export async function POST() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    // Clear existing data for this user
    await prisma.recruiterSubmission.deleteMany({ where: { userId } });
    await prisma.currentPosition.deleteMany({ where: { userId } });
    await prisma.userProfile.deleteMany({ where: { userId } });
    await prisma.activityLog.deleteMany({ where: { userId } });
    await prisma.reminder.deleteMany({ where: { userId } });
    await prisma.milestone.deleteMany({ where: { careerGoal: { userId } } });
    await prisma.careerGoal.deleteMany({ where: { userId } });
    await prisma.resumeVersion.deleteMany({ where: { userId } });
    await prisma.certification.deleteMany({ where: { userId } });
    await prisma.skill.deleteMany({ where: { userId } });
    await prisma.contact.deleteMany({ where: { userId } });
    await prisma.interview.deleteMany({ where: { jobApplication: { userId } } });
    await prisma.jobApplication.deleteMany({ where: { userId } });

    // Job Applications
    const app1 = await prisma.jobApplication.create({
      data: { userId, company: "Google", role: "Senior Frontend Engineer", url: "https://careers.google.com/jobs/123", location: "Mountain View, CA", type: "hybrid", status: "interviewing", salaryMin: 180000, salaryMax: 250000, currency: "USD", appliedDate: new Date("2026-02-15"), notes: "Referred by John from the Chrome team" },
    });
    const app2 = await prisma.jobApplication.create({
      data: { userId, company: "Stripe", role: "Full Stack Developer", url: "https://stripe.com/jobs/456", location: "San Francisco, CA", type: "remote", status: "applied", salaryMin: 160000, salaryMax: 220000, currency: "USD", appliedDate: new Date("2026-03-01"), notes: "Applied through their website" },
    });
    const app3 = await prisma.jobApplication.create({
      data: { userId, company: "Microsoft", role: "Software Engineer II", location: "Redmond, WA", type: "hybrid", status: "offer", salaryMin: 150000, salaryMax: 200000, currency: "USD", appliedDate: new Date("2026-01-20"), notes: "Offer received! Need to respond by March 20" },
    });
    const app4 = await prisma.jobApplication.create({
      data: { userId, company: "Vercel", role: "Developer Experience Engineer", type: "remote", status: "screening", salaryMin: 140000, salaryMax: 190000, currency: "USD", appliedDate: new Date("2026-03-05") },
    });
    const app5 = await prisma.jobApplication.create({
      data: { userId, company: "Netflix", role: "UI Engineer", location: "Los Gatos, CA", type: "onsite", status: "rejected", salaryMin: 200000, salaryMax: 300000, currency: "USD", appliedDate: new Date("2026-01-10"), notes: "Rejected after technical round" },
    });
    await prisma.jobApplication.create({
      data: { userId, company: "Shopify", role: "Frontend Developer", type: "remote", status: "wishlist", salaryMin: 130000, salaryMax: 180000, currency: "USD" },
    });
    await prisma.jobApplication.create({
      data: { userId, company: "Airbnb", role: "Software Engineer", location: "San Francisco, CA", type: "hybrid", status: "applied", salaryMin: 170000, salaryMax: 240000, currency: "USD", appliedDate: new Date("2026-03-10") },
    });

    // Interviews
    await prisma.interview.create({ data: { userId, jobApplicationId: app1.id, type: "phone", scheduledAt: new Date("2026-03-03T10:00:00"), durationMinutes: 30, interviewerName: "Sarah Chen", interviewerRole: "Recruiter", status: "completed", rating: 4, notes: "Went well, discussed experience with React and Next.js" } });
    await prisma.interview.create({ data: { userId, jobApplicationId: app1.id, type: "technical", scheduledAt: new Date("2026-03-16T14:00:00"), durationMinutes: 90, interviewerName: "Mike Johnson", interviewerRole: "Senior Engineer", status: "scheduled", notes: "System design + coding challenge" } });
    await prisma.interview.create({ data: { userId, jobApplicationId: app2.id, type: "phone", scheduledAt: new Date("2026-03-18T11:00:00"), durationMinutes: 45, status: "scheduled" } });
    await prisma.interview.create({ data: { userId, jobApplicationId: app3.id, type: "onsite", scheduledAt: new Date("2026-02-25T09:00:00"), durationMinutes: 240, interviewerName: "Panel", status: "completed", rating: 5, notes: "Full loop - 4 interviews. All went great!" } });
    await prisma.interview.create({ data: { userId, jobApplicationId: app5.id, type: "technical", scheduledAt: new Date("2026-02-01T15:00:00"), durationMinutes: 60, interviewerName: "Alex Rivera", interviewerRole: "Staff Engineer", status: "completed", rating: 2, notes: "Struggled with the system design question" } });

    // Contacts
    await prisma.contact.create({ data: { userId, name: "John Smith", email: "john.smith@google.com", company: "Google", role: "Senior Engineer", relationship: "referral", linkedinUrl: "https://linkedin.com/in/johnsmith", notes: "Met at React Conf 2025. Referred me to the Chrome team.", lastContactedAt: new Date("2026-02-10") } });
    await prisma.contact.create({ data: { userId, name: "Emily Davis", email: "emily@techrecruiter.com", company: "TechRecruit Inc", role: "Senior Recruiter", relationship: "recruiter", phone: "+1-555-0123", notes: "Specializes in FAANG placements", lastContactedAt: new Date("2026-03-08") } });
    await prisma.contact.create({ data: { userId, name: "David Park", email: "dpark@stripe.com", company: "Stripe", role: "Engineering Manager", relationship: "colleague", linkedinUrl: "https://linkedin.com/in/davidpark", notes: "Former coworker at previous company", lastContactedAt: new Date("2026-02-28") } });
    await prisma.contact.create({ data: { userId, name: "Lisa Wang", email: "lisa.wang@mentor.dev", role: "CTO", company: "StartupXYZ", relationship: "mentor", notes: "Monthly mentorship calls. Great career advice.", lastContactedAt: new Date("2026-03-01") } });

    // Skills
    const skills = [
      { name: "React", category: "technical", proficiency: "expert" },
      { name: "TypeScript", category: "technical", proficiency: "expert" },
      { name: "Next.js", category: "technical", proficiency: "advanced" },
      { name: "Node.js", category: "technical", proficiency: "advanced" },
      { name: "PostgreSQL", category: "technical", proficiency: "intermediate" },
      { name: "Python", category: "technical", proficiency: "intermediate" },
      { name: "AWS", category: "tool", proficiency: "intermediate" },
      { name: "Docker", category: "tool", proficiency: "intermediate" },
      { name: "Git", category: "tool", proficiency: "advanced" },
      { name: "Figma", category: "tool", proficiency: "beginner" },
      { name: "Communication", category: "soft", proficiency: "advanced" },
      { name: "Leadership", category: "soft", proficiency: "intermediate" },
      { name: "English", category: "language", proficiency: "expert" },
      { name: "Spanish", category: "language", proficiency: "beginner" },
    ];
    for (const skill of skills) await prisma.skill.create({ data: { userId, ...skill } });

    // Certifications
    await prisma.certification.create({ data: { userId, name: "AWS Solutions Architect Associate", issuer: "Amazon Web Services", issueDate: new Date("2025-06-15"), expiryDate: new Date("2028-06-15"), credentialUrl: "https://aws.amazon.com/verification/123" } });
    await prisma.certification.create({ data: { userId, name: "Meta Front-End Developer Professional Certificate", issuer: "Meta / Coursera", issueDate: new Date("2025-03-01"), credentialUrl: "https://coursera.org/verify/456" } });

    // Resume Versions
    await prisma.resumeVersion.create({ data: { userId, name: "General SWE Resume", targetRole: "Software Engineer", versionNumber: 3, isActive: true, notes: "Updated with latest project experience" } });
    await prisma.resumeVersion.create({ data: { userId, name: "Frontend Specialist Resume", targetRole: "Frontend Engineer", versionNumber: 2, isActive: false, notes: "Emphasizes React, Next.js, and UI/UX skills" } });
    await prisma.resumeVersion.create({ data: { userId, name: "Full Stack Resume", targetRole: "Full Stack Developer", versionNumber: 1, isActive: false } });

    // Career Goals
    const goal1 = await prisma.careerGoal.create({ data: { userId, title: "Land a Senior Engineer role at a top tech company", description: "Secure a senior-level position with competitive compensation", targetDate: new Date("2026-06-01"), status: "in_progress", priority: "high" } });
    const goal2 = await prisma.careerGoal.create({ data: { userId, title: "Complete System Design course", description: "Finish the Grokking System Design course for interview prep", targetDate: new Date("2026-04-15"), status: "in_progress", priority: "high" } });
    const goal3 = await prisma.careerGoal.create({ data: { userId, title: "Build open source portfolio", description: "Contribute to 3 major open source projects", targetDate: new Date("2026-12-31"), status: "not_started", priority: "medium" } });

    // Milestones
    await prisma.milestone.createMany({
      data: [
        { careerGoalId: goal1.id, title: "Update resume", completed: true, completedAt: new Date("2026-02-01") },
        { careerGoalId: goal1.id, title: "Apply to 10+ companies", completed: true, completedAt: new Date("2026-03-01") },
        { careerGoalId: goal1.id, title: "Get at least 3 interviews", completed: true, completedAt: new Date("2026-03-10") },
        { careerGoalId: goal1.id, title: "Receive offer", completed: true, completedAt: new Date("2026-03-12") },
        { careerGoalId: goal1.id, title: "Negotiate and accept", completed: false },
        { careerGoalId: goal2.id, title: "Complete Module 1-3: Basics", completed: true, completedAt: new Date("2026-02-15") },
        { careerGoalId: goal2.id, title: "Complete Module 4-6: Advanced", completed: true, completedAt: new Date("2026-03-05") },
        { careerGoalId: goal2.id, title: "Complete Module 7-10: Practice", completed: false },
        { careerGoalId: goal2.id, title: "Do 5 mock system design interviews", completed: false },
        { careerGoalId: goal3.id, title: "Find 3 projects to contribute to", completed: false },
        { careerGoalId: goal3.id, title: "Submit first PR", completed: false },
        { careerGoalId: goal3.id, title: "Get 3 PRs merged", completed: false },
      ],
    });

    // Activity Log
    await prisma.activityLog.createMany({
      data: [
        { userId, entityType: "application", entityId: app1.id, action: "created", description: "Applied to Google - Senior Frontend Engineer", createdAt: new Date("2026-02-15") },
        { userId, entityType: "application", entityId: app2.id, action: "created", description: "Applied to Stripe - Full Stack Developer", createdAt: new Date("2026-03-01") },
        { userId, entityType: "application", entityId: app3.id, action: "status_changed", description: "Microsoft - Offer received!", createdAt: new Date("2026-03-12") },
        { userId, entityType: "application", entityId: app4.id, action: "created", description: "Applied to Vercel - DX Engineer", createdAt: new Date("2026-03-05") },
        { userId, entityType: "application", entityId: app1.id, action: "status_changed", description: "Google - Moved to Interviewing", createdAt: new Date("2026-03-03") },
        { userId, entityType: "goal", entityId: goal2.id, action: "updated", description: "Completed Module 4-6 of System Design course", createdAt: new Date("2026-03-05") },
      ],
    });

    // Reminders
    await prisma.reminder.createMany({
      data: [
        { userId, entityType: "interview", entityId: app1.id, title: "Google Technical Interview tomorrow at 2 PM", remindAt: new Date("2026-03-15T14:00:00") },
        { userId, entityType: "interview", entityId: app2.id, title: "Stripe Phone Screen in 4 days", remindAt: new Date("2026-03-17T11:00:00") },
        { userId, entityType: "goal", entityId: goal2.id, title: "System Design course deadline in 1 month", remindAt: new Date("2026-04-08T09:00:00") },
      ],
    });

    // User Profile (Portal Settings)
    await prisma.userProfile.create({
      data: {
        userId,
        availability: "open_to_work",
        bio: "Full-stack engineer with 5+ years of experience building modern web applications. Passionate about developer experience, performance, and clean architecture.",
        preferredRoles: "Senior Frontend Engineer, Full Stack Developer, Tech Lead",
        targetSalaryMin: 150000,
        targetSalaryMax: 250000,
        currency: "USD",
        locationPreference: "Remote, San Francisco, New York",
        showSkills: true,
        showResume: true,
        showCertifications: true,
        showCurrentRole: true,
      },
    });

    // Current Position
    await prisma.currentPosition.create({
      data: {
        userId,
        company: "TechStartup Inc",
        role: "Senior Frontend Engineer",
        department: "Engineering",
        location: "San Francisco, CA",
        type: "remote",
        startDate: new Date("2024-09-01"),
        salary: 175000,
        currency: "USD",
        description: "Leading frontend development for the core product platform, building performant React-based UIs serving 50k+ daily active users.",
        responsibilities: "Lead frontend architecture and technical decisions\nMentor 3 junior engineers on the team\nConduct code reviews and define best practices\nCollaborate with design and product on new features\nOptimize bundle size and Core Web Vitals",
        techStack: "React, TypeScript, Next.js, TailwindCSS, GraphQL, PostgreSQL",
        managerName: "Sarah Johnson",
        isActive: true,
      },
    });

    await prisma.currentPosition.create({
      data: {
        userId,
        company: "WebAgency Co",
        role: "Frontend Developer",
        department: "Development",
        location: "Austin, TX",
        type: "hybrid",
        startDate: new Date("2022-03-15"),
        endDate: new Date("2024-08-31"),
        salary: 120000,
        currency: "USD",
        description: "Built client-facing web applications for Fortune 500 companies.",
        responsibilities: "Developed responsive web applications\nIntegrated REST APIs\nImplemented automated testing",
        techStack: "React, JavaScript, SASS, Node.js, Jest",
        managerName: "Mike Rodriguez",
        isActive: false,
      },
    });

    // Sample Recruiter Submissions
    const sub1Contact = await prisma.contact.create({
      data: { userId, name: "Rachel Kim", email: "rachel@talentco.io", company: "TalentCo", relationship: "recruiter", notes: "Auto-imported from recruiter portal submission" },
    });
    const sub1App = await prisma.jobApplication.create({
      data: { userId, company: "TalentCo", role: "Staff Frontend Engineer", type: "remote", status: "wishlist", salaryMin: 200000, salaryMax: 280000, notes: "Submitted via recruiter portal by Rachel Kim\n\nMessage: I came across your profile and think you'd be a great fit for this role at a Series C fintech startup." },
    });
    await prisma.recruiterSubmission.create({
      data: {
        userId,
        recruiterName: "Rachel Kim",
        recruiterEmail: "rachel@talentco.io",
        company: "TalentCo",
        linkedinUrl: "https://linkedin.com/in/rachelkim",
        jobTitle: "Staff Frontend Engineer",
        jobDescription: "Lead the frontend architecture for a growing fintech platform. You'll work with React, TypeScript, and Next.js to build performant, accessible user interfaces.",
        salaryMin: 200000,
        salaryMax: 280000,
        location: "Remote",
        jobType: "remote",
        message: "I came across your profile and think you'd be a great fit for this role at a Series C fintech startup.",
        status: "new",
        contactId: sub1Contact.id,
        applicationId: sub1App.id,
      },
    });

    const sub2Contact = await prisma.contact.create({
      data: { userId, name: "Marcus Chen", email: "marcus@bigcorp.com", company: "BigCorp Inc", relationship: "recruiter", notes: "Auto-imported from recruiter portal submission" },
    });
    const sub2App = await prisma.jobApplication.create({
      data: { userId, company: "BigCorp Inc", role: "Senior Software Engineer", location: "New York, NY", type: "hybrid", status: "wishlist", salaryMin: 175000, salaryMax: 230000, notes: "Submitted via recruiter portal by Marcus Chen" },
    });
    await prisma.recruiterSubmission.create({
      data: {
        userId,
        recruiterName: "Marcus Chen",
        recruiterEmail: "marcus@bigcorp.com",
        company: "BigCorp Inc",
        jobTitle: "Senior Software Engineer",
        jobDescription: "Join our platform team to build scalable microservices. Experience with Node.js and distributed systems preferred.",
        salaryMin: 175000,
        salaryMax: 230000,
        location: "New York, NY",
        jobType: "hybrid",
        status: "reviewed",
        contactId: sub2Contact.id,
        applicationId: sub2App.id,
      },
    });

    return NextResponse.json({ success: true, message: "Database seeded successfully!" });
  } catch (error) {
    console.error("Seed error:", error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
