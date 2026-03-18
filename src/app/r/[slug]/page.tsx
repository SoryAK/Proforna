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
} from "lucide-react";

interface SectionConfig {
  type: string;
  visible: boolean;
  order: number;
}

interface Profile {
  fullName: string | null;
  headline: string | null;
  avatarUrl: string | null;
  email: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  portfolioUrl: string | null;
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
  department: string | null;
  location: string | null;
  type: string;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  techStack: string | null;
  description: string | null;
}

interface ResumeData {
  resume: {
    title: string;
    targetRole: string | null;
    summary: string | null;
    theme: string;
    sections: SectionConfig[];
  };
  profile: Profile | null;
  skills: Skill[];
  certifications: Certification[];
  experience: Position[];
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
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  defaultOpen?: boolean;
  onToggle?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-gray-200 dark:border-gray-700 last:border-b-0">
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
    fetch(`/api/interactive-resumes/public/${encodeURIComponent(slug)}`)
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-950 dark:to-gray-900">
      {/* Header */}
      <header className="border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-5">
          <div className="flex items-start gap-4">
            {profile?.avatarUrl && (
              <img
                src={profile.avatarUrl}
                alt=""
                className="h-14 w-14 rounded-full object-cover ring-2 ring-indigo-100 dark:ring-indigo-900"
              />
            )}
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50 truncate">
                {profile?.fullName || resume.title}
              </h1>
              {(resume.targetRole || profile?.headline) && (
                <p className="text-indigo-600 dark:text-indigo-400 font-medium mt-0.5">
                  {resume.targetRole || profile?.headline}
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
                >
                  <p className="text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-line">
                    {resume.summary}
                  </p>
                </ExpandableSection>
              );
            }

            if (section.type === "experience" && experience.length > 0) {
              return (
                <ExpandableSection
                  key="experience"
                  title="Experience"
                  icon={Building2}
                  defaultOpen
                  onToggle={() => trackSection("experience")}
                >
                  <div className="space-y-5">
                    {experience.map((pos) => (
                      <div key={pos.id} className="relative pl-4 border-l-2 border-indigo-200 dark:border-indigo-800">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                            {pos.role}
                          </h3>
                          <span className="text-indigo-600 dark:text-indigo-400">
                            @ {pos.company}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-x-4 text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            {formatDate(pos.startDate)} –{" "}
                            {pos.endDate ? formatDate(pos.endDate) : "Present"}
                          </span>
                          {pos.location && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5" />
                              {pos.location}
                            </span>
                          )}
                        </div>
                        {pos.description && (
                          <p className="text-gray-600 dark:text-gray-400 text-sm mt-2 whitespace-pre-line">
                            {pos.description}
                          </p>
                        )}
                        {pos.techStack && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {pos.techStack.split(",").map((t) => (
                              <span
                                key={t.trim()}
                                className="px-2 py-0.5 text-xs rounded-full bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
                              >
                                {t.trim()}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
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

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 dark:text-gray-600 mt-6">
          Built with Resumsify
        </p>
      </main>
    </div>
  );
}
