"use client";

import { useEffect, useState, useRef, use } from "react";
import {
  ChevronDown,
  MapPin,
  Mail,
  ExternalLink,
  Briefcase,
  Award,
  Code2,
  Calendar,
  Building2,
  Lock,
  ShieldCheck,
  Eye,
  Send,
  CheckCircle2,
  UserCircle2,
} from "lucide-react";
import ResumeWorkMap, { type ResumeWorkItem } from "@/components/resume-work-map";
import ResumeImmersiveMap, { type ImmersiveWorkItem } from "@/components/resume-immersive-map";

interface SectionConfig {
  type: string;
  visible: boolean;
  order: number;
  settings?: Record<string, unknown>;
}

interface Profile {
  fullName: string | null;
  headline: string | null;
  avatarUrl: string | null;
  email: string | null;
  phone?: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  portfolioUrl: string | null;
  schedulingUrl?: string | null;
  city: string | null;
  state: string | null;
}

interface Skill {
  id: string;
  name: string;
  category: string;
  proficiency: string;
}

interface Certification {
  id: string;
  name: string;
  issuer: string;
  issueDate: string;
  expiryDate: string | null;
  credentialUrl: string | null;
}

interface Position {
  id: string;
  company: string;
  role: string;
  title: string | null;
  department: string | null;
  location: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  type: string;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  techStack: string | null;
  description: string | null;
  responsibilities?: string | null;
  accomplishments?: string | null;
  industry?: string | null;
  workMode?: string | null;
  scheduleType?: string | null;
  companySize?: string | null;
  teamSize?: number | null;
  managerName?: string | null;
  degree?: string | null;
  major?: string | null;
  coverImage?: string | null;
  coverImageY?: number | null;
  // ── Compensation ──
  salaryAmount?: number | null;
  salaryType?: string | null;
  salaryCurrency?: string | null;
  bonusAmount?: number | null;
  payType?: string | null;
  payFrequency?: string | null;
  hoursPerWeek?: number | null;
  hybridDays?: number | null;
  schedule?: string | null;
  shiftNotes?: string | null;
  // ── Skills / Commute / Uniform ──
  skillsUsed?: string | null;
  commuteMinutes?: number | null;
  commuteDistance?: number | null;
  commuteMode?: string | null;
  uniformData?: string | null;
  // ── Relations ──
  galleryPhotos?: { id: string; filePath: string; caption?: string | null; fileName: string }[];
  attachments?: { id: string; label: string; category: string; fileName: string; filePath: string; fileMime: string; fileSize: number }[];
  equipment?: { id: string; name: string; category: string; manufacturer?: string | null; model?: string | null; photos?: { id: string; filePath: string; isCover: boolean }[] }[];
}

interface ResumeData {
  visibility: "public" | "stealth" | "anonymous";
  profileId?: string;
  resume: {
    title: string;
    targetRole: string | null;
    summary: string | null;
    theme: string;
    sections: SectionConfig[];
    updatedAt?: string;
  };
  profile: Profile | null;
  skills: Skill[];
  certifications: Certification[];
  experience: Position[];
  viewerOverride?: { targetRole: string | null; focusSections: string[] | null } | null;
}

const proficiencyPercent: Record<string, number> = {
  beginner: 25,
  intermediate: 50,
  advanced: 75,
  expert: 100,
};

const proficiencyColor: Record<string, string> = {
  beginner: "bg-gray-400",
  intermediate: "bg-orange-500",
  advanced: "bg-indigo-500",
  expert: "bg-emerald-500",
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

function ExpandableSection({
  title,
  icon: Icon,
  children,
  defaultOpen = false,
  onToggle,
  highlight = false,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  defaultOpen?: boolean;
  onToggle?: (open: boolean) => void;
  highlight?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      className={`border-b border-gray-200 dark:border-gray-700 last:border-b-0 ${
        highlight ? "ring-2 ring-amber-400/70 dark:ring-amber-500/60 bg-amber-50/40 dark:bg-amber-900/10 rounded-md" : ""
      }`}
    >
      {highlight && (
        <div className="px-6 pt-2 -mb-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
          Recommended for this opportunity
        </div>
      )}
      <button
        onClick={() => {
          setOpen(!open);
          onToggle?.(!open);
        }}
        className="flex w-full items-center gap-3 px-6 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <Icon className="h-5 w-5 text-indigo-500 shrink-0" />
        <span className="font-semibold text-gray-900 dark:text-gray-100 flex-1">
          {title}
        </span>
        <ChevronDown
          className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open && (
        <div className="px-6 pb-5 animate-in slide-in-from-top-1 duration-200">
          {children}
        </div>
      )}
    </div>
  );
}

/* ── Access Request Form (shown for stealth/anonymous profiles) ── */
function AccessRequestForm({ profileId }: { profileId: string }) {
  const [form, setForm] = useState({ name: "", email: "", company: "", linkedin: "", message: "" });
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("sending");
    try {
      const res = await fetch("/api/access-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId, ...form }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to submit");
      }
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  };

  if (status === "sent") {
    return (
      <div className="text-center py-8 px-6">
        <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Request Sent!</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          The candidate will review your request and you&apos;ll receive a link to view the full profile if approved.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
      <div className="text-center mb-4">
        <Lock className="h-8 w-8 text-indigo-500 mx-auto mb-2" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Request Full Profile Access
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          This candidate&apos;s identity is protected. Provide your details to request access.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          required
          placeholder="Your Name *"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <input
          required
          type="email"
          placeholder="Work Email *"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          placeholder="Company"
          value={form.company}
          onChange={(e) => setForm({ ...form, company: e.target.value })}
          className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <input
          placeholder="LinkedIn URL"
          value={form.linkedin}
          onChange={(e) => setForm({ ...form, linkedin: e.target.value })}
          className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
      <textarea
        placeholder="Why would you like to connect with this candidate?"
        rows={2}
        value={form.message}
        onChange={(e) => setForm({ ...form, message: e.target.value })}
        className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      <button
        type="submit"
        disabled={status === "sending"}
        className="w-full py-2.5 rounded-lg bg-indigo-600 text-white font-medium text-sm hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
      >
        <Send className="h-4 w-4" />
        {status === "sending" ? "Submitting..." : "Request Full Identity & Contact Info"}
      </button>
      {status === "error" && (
        <p className="text-sm text-red-500 text-center">Failed to submit request. Please try again.</p>
      )}
    </form>
  );
}

/* ── Stealth Banner ── */
function StealthBanner({ visibility }: { visibility: string }) {
  if (visibility === "public") return null;
  return (
    <div className="bg-amber-50 dark:bg-amber-950/50 border-b border-amber-200 dark:border-amber-800">
      <div className="max-w-3xl mx-auto px-6 py-2.5 flex items-center gap-2 text-sm">
        <ShieldCheck className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
        <span className="text-amber-800 dark:text-amber-200">
          {visibility === "stealth"
            ? "This candidate's identity is protected. Request access to see full details."
            : "This profile is anonymous. Only skills and qualifications are visible."}
        </span>
      </div>
    </div>
  );
}

export default function InteractiveResumePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const [data, setData] = useState<ResumeData | null>(null);
  const [error, setError] = useState(false);
  const sectionsViewed = useRef<Set<string>>(new Set());
  const startTime = useRef(Date.now());

  useEffect(() => {
    // Check for token in URL (magic link or single-use)
    const searchParams = new URLSearchParams(window.location.search);
    const token = searchParams.get("token");
    const url = `/api/interactive-resumes/public/${encodeURIComponent(slug)}${token ? `?token=${encodeURIComponent(token)}` : ""}`;

    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then(setData)
      .catch(() => setError(true));
  }, [slug]);

  // Track view on load
  useEffect(() => {
    if (!data) return;
    fetch(`/api/interactive-resumes/view/${encodeURIComponent(slug)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        referrer: document.referrer || null,
        userAgent: navigator.userAgent,
      }),
    }).catch(() => {});

    // Track duration on unload
    const handleUnload = () => {
      const duration = Math.round((Date.now() - startTime.current) / 1000);
      navigator.sendBeacon(
        `/api/interactive-resumes/view/${encodeURIComponent(slug)}`,
        JSON.stringify({
          referrer: document.referrer || null,
          userAgent: navigator.userAgent,
          sectionsViewed: JSON.stringify([...sectionsViewed.current]),
          durationSeconds: duration,
        })
      );
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [data, slug]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Resume Not Found
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            This resume may have been removed or is not yet published.
          </p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="animate-pulse space-y-4 w-full max-w-2xl px-6">
          <div className="h-8 bg-gray-200 dark:bg-gray-800 rounded w-1/2" />
          <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-3/4" />
          <div className="h-32 bg-gray-200 dark:bg-gray-800 rounded" />
          <div className="h-32 bg-gray-200 dark:bg-gray-800 rounded" />
        </div>
      </div>
    );
  }

  const { resume, profile, skills, certifications, experience } = data;
  const visibility = data.visibility || "public";
  const viewerOverride = data.viewerOverride || null;
  const effectiveTargetRole = viewerOverride?.targetRole || resume.targetRole;
  const focusSet = new Set((viewerOverride?.focusSections || []).filter(Boolean));
  const isRestricted = visibility === "stealth" || visibility === "anonymous";
  const sorted = [...resume.sections]
    .filter((s) => s.visible)
    .sort((a, b) => a.order - b.order);

  // Group skills by category
  const skillsByCategory = skills.reduce<Record<string, Skill[]>>((acc, s) => {
    const cat = s.category || "Other";
    (acc[cat] ??= []).push(s);
    return acc;
  }, {});

  const trackSection = (type: string) => {
    sectionsViewed.current.add(type);
  };

  // ── Immersive map mode: full-page work map when not restricted and we have geocoded experience ──
  const experienceSection = sorted.find((s) => s.type === "experience" && s.visible);
  const geocodedCount = experience.filter((p) => typeof p.lat === "number" && typeof p.lng === "number").length;
  const immersiveDefault = (experienceSection?.settings?.experienceView as string | undefined) !== "list";
  const useImmersive = !isRestricted && experienceSection && geocodedCount > 0 && immersiveDefault;

  if (useImmersive) {
    const immersiveItems: ImmersiveWorkItem[] = experience.map((pos) => ({
      id: pos.id,
      type: pos.type,
      company: pos.company,
      role: pos.role,
      title: pos.title,
      department: pos.department,
      address: pos.address,
      location: pos.location,
      lat: pos.lat,
      lng: pos.lng,
      startDate: pos.startDate,
      endDate: pos.endDate,
      isActive: pos.isActive,
      coverImage: pos.coverImage,
      coverImageY: pos.coverImageY,
      description: pos.description,
      responsibilities: pos.responsibilities,
      techStack: pos.techStack,
      accomplishments: pos.accomplishments,
      industry: pos.industry,
      workMode: pos.workMode,
      scheduleType: pos.scheduleType,
      companySize: pos.companySize,
      teamSize: pos.teamSize,
      managerName: pos.managerName,
      degree: pos.degree,
      major: pos.major,
      salaryAmount: pos.salaryAmount,
      salaryType: pos.salaryType,
      salaryCurrency: pos.salaryCurrency,
      bonusAmount: pos.bonusAmount,
      payType: pos.payType,
      payFrequency: pos.payFrequency,
      hoursPerWeek: pos.hoursPerWeek,
      hybridDays: pos.hybridDays,
      schedule: pos.schedule,
      shiftNotes: pos.shiftNotes,
      skillsUsed: pos.skillsUsed,
      commuteMinutes: pos.commuteMinutes,
      commuteDistance: pos.commuteDistance,
      commuteMode: pos.commuteMode,
      uniformData: pos.uniformData,
      galleryPhotos: pos.galleryPhotos,
      attachments: pos.attachments,
      equipment: pos.equipment,
    }));
    return (
      <>
        <StealthBanner visibility={visibility} />
        {visibility === "public" && profile?.fullName && (
          <script
            type="application/ld+json"
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "Person",
                name: profile.fullName,
                jobTitle: profile.headline ?? undefined,
                description: resume.summary ?? undefined,
                image: profile.avatarUrl ?? undefined,
                email: profile.email ?? undefined,
                url: profile.portfolioUrl ?? undefined,
                sameAs: [profile.linkedinUrl, profile.githubUrl, profile.portfolioUrl].filter(Boolean),
                address: profile.city || profile.state ? {
                  "@type": "PostalAddress",
                  addressLocality: profile.city ?? undefined,
                  addressRegion: profile.state ?? undefined,
                } : undefined,
                knowsAbout: skills.slice(0, 25).map((s) => s.name),
                hasCredential: certifications.map((c) => ({
                  "@type": "EducationalOccupationalCredential",
                  name: c.name,
                  recognizedBy: c.issuer ? { "@type": "Organization", name: c.issuer } : undefined,
                  url: c.credentialUrl ?? undefined,
                  dateCreated: c.issueDate ?? undefined,
                })),
                workExperience: experience.map((pos) => ({
                  "@type": "OrganizationRole",
                  roleName: pos.title || pos.role || undefined,
                  startDate: pos.startDate || undefined,
                  endDate: pos.endDate || undefined,
                  worksFor: { "@type": "Organization", name: pos.company },
                })),
              }),
            }}
          />
        )}
        <ResumeImmersiveMap
          items={immersiveItems}
          profile={profile}
          skills={sorted.some((s) => s.type === "skills") ? skills : []}
          certifications={sorted.some((s) => s.type === "certifications") ? certifications : []}
          summary={sorted.some((s) => s.type === "summary") ? resume.summary : null}
          updatedAt={resume.updatedAt}
          slug={slug}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-950 dark:to-gray-900">
      <StealthBanner visibility={visibility} />
      {/* Header */}
      <header className="border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-5">
          <div className="flex items-start gap-4">
            {profile?.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt=""
                className="h-14 w-14 rounded-full object-cover ring-2 ring-indigo-100 dark:ring-indigo-900"
              />
            ) : isRestricted ? (
              <div className="h-14 w-14 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center ring-2 ring-indigo-200 dark:ring-indigo-800">
                <UserCircle2 className="h-8 w-8 text-indigo-400" />
              </div>
            ) : null}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50 truncate">
                  {profile?.fullName || resume.title}
                </h1>
                {isRestricted && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
                    <Eye className="h-3 w-3" />
                    {visibility === "stealth" ? "Identity Protected" : "Anonymous"}
                  </span>
                )}
              </div>
              {(effectiveTargetRole || profile?.headline) && (
                <p className="text-indigo-600 dark:text-indigo-400 font-medium mt-0.5">
                  {effectiveTargetRole || profile?.headline}
                </p>
              )}
              {viewerOverride?.targetRole && (
                <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">
                  Tailored for this opportunity
                </p>
              )}
              {profile?.city && (
                <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {profile.city}
                  {profile.state && `, ${profile.state}`}
                </p>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Body */}
      <main className="max-w-3xl mx-auto py-6">
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
          {sorted.map((section) => {
            if (section.type === "summary" && resume.summary) {
              return (
                <ExpandableSection
                  key="summary"
                  title="Summary"
                  icon={Briefcase}
                  defaultOpen
                  onToggle={() => trackSection("summary")}
                  highlight={focusSet.has("summary")}
                >
                  <p className="text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-line">
                    {resume.summary}
                  </p>
                </ExpandableSection>
              );
            }

            if (section.type === "experience" && experience.length > 0) {
              const workItems: ResumeWorkItem[] = experience.map((pos) => ({
                id: pos.id,
                type: pos.type,
                company: pos.company,
                title: pos.title || pos.role,
                address: pos.address,
                location: pos.location,
                lat: pos.lat,
                lng: pos.lng,
                startDate: pos.startDate,
                endDate: pos.endDate,
              }));
              const expView = (section.settings?.experienceView as
                | "map"
                | "list"
                | "both"
                | undefined) || "map";
              return (
                <ExpandableSection
                  key="experience"
                  title="Experience"
                  icon={Building2}
                  defaultOpen
                  onToggle={() => trackSection("experience")}
                  highlight={focusSet.has("experience")}
                >
                  <ResumeWorkMap
                    items={workItems}
                    forceListOnly={isRestricted}
                    defaultView={expView}
                  />
                </ExpandableSection>
              );
            }

            if (section.type === "skills" && skills.length > 0) {
              return (
                <ExpandableSection
                  key="skills"
                  title="Skills"
                  icon={Code2}
                  defaultOpen
                  onToggle={() => trackSection("skills")}
                  highlight={focusSet.has("skills")}
                >
                  <div className="space-y-4">
                    {Object.entries(skillsByCategory).map(([cat, items]) => (
                      <div key={cat}>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">
                          {cat}
                        </h4>
                        <div className="space-y-2">
                          {items.map((s) => (
                            <div key={s.id} className="flex items-center gap-3">
                              <span className="w-28 text-sm text-gray-700 dark:text-gray-300 truncate">
                                {s.name}
                              </span>
                              <div className="flex-1 h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${proficiencyColor[s.proficiency] || "bg-gray-400"}`}
                                  style={{
                                    width: `${proficiencyPercent[s.proficiency] || 25}%`,
                                  }}
                                />
                              </div>
                              <span className="text-xs text-gray-400 w-20 text-right capitalize">
                                {s.proficiency}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </ExpandableSection>
              );
            }

            if (section.type === "certifications" && certifications.length > 0) {
              return (
                <ExpandableSection
                  key="certifications"
                  title="Certifications"
                  icon={Award}
                  defaultOpen={false}
                  onToggle={() => trackSection("certifications")}
                  highlight={focusSet.has("certifications")}
                >
                  <div className="space-y-3">
                    {certifications.map((cert) => (
                      <div
                        key={cert.id}
                        className="flex items-start justify-between"
                      >
                        <div>
                          <h4 className="font-medium text-gray-900 dark:text-gray-100">
                            {cert.name}
                          </h4>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {cert.issuer} · {formatDate(cert.issueDate)}
                          </p>
                        </div>
                        {cert.credentialUrl && (
                          <a
                            href={cert.credentialUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-500 hover:text-indigo-600 shrink-0"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </ExpandableSection>
              );
            }

            if (section.type === "contact" && profile) {
              const links = [
                profile.email && {
                  label: profile.email,
                  href: `mailto:${profile.email}`,
                  icon: Mail,
                },
                profile.phone && {
                  label: profile.phone,
                  href: `tel:${profile.phone.replace(/[^+0-9]/g, "")}`,
                  icon: Mail,
                },
                profile.linkedinUrl && {
                  label: "LinkedIn",
                  href: profile.linkedinUrl,
                  icon: ExternalLink,
                },
                profile.githubUrl && {
                  label: "GitHub",
                  href: profile.githubUrl,
                  icon: Code2,
                },
                profile.portfolioUrl && {
                  label: "Portfolio",
                  href: profile.portfolioUrl,
                  icon: ExternalLink,
                },
              ].filter(Boolean) as {
                label: string;
                href: string;
                icon: React.ComponentType<{ className?: string }>;
              }[];

              if (links.length === 0) return null;

              return (
                <ExpandableSection
                  key="contact"
                  title="Contact"
                  icon={Mail}
                  defaultOpen={false}
                  onToggle={() => trackSection("contact")}
                  highlight={focusSet.has("contact")}
                >
                  <div className="flex flex-wrap gap-3">
                    {links.map((link) => (
                      <a
                        key={link.href}
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                      >
                        <link.icon className="h-4 w-4" />
                        {link.label}
                      </a>
                    ))}
                  </div>
                </ExpandableSection>
              );
            }

            return null;
          })}
        </div>

        {/* Access Request Form for restricted profiles */}
        {isRestricted && data.profileId && (
          <div className="mt-6 bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
            <AccessRequestForm profileId={data.profileId} />
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 dark:text-gray-600 mt-6">
          Built with Resumsify
        </p>
      </main>
    </div>
  );
}
