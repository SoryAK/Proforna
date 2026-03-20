"use client";

import { useEffect, useState } from "react";
import {
  ChevronDown,
  MapPin,
  Briefcase,
  Code2,
  Award,
  Calendar,
  Building2,
  User,
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

const profPct: Record<string, number> = {
  beginner: 25,
  intermediate: 50,
  advanced: 75,
  expert: 100,
};
const profColor: Record<string, string> = {
  beginner: "bg-gray-400",
  intermediate: "bg-orange-500",
  advanced: "bg-indigo-500",
  expert: "bg-emerald-500",
};

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function Section({
  title,
  icon: Icon,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
      >
        <Icon className="h-4 w-4 text-orange-600 shrink-0" />
        <span className="text-sm font-semibold flex-1">{title}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && <div className="px-4 pb-3 text-sm">{children}</div>}
    </div>
  );
}

export function InteractiveResumeSidebar({ slug }: { slug: string }) {
  const [data, setData] = useState<ResumeData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`/api/interactive-resumes/public/${encodeURIComponent(slug)}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(setData)
      .catch(() => setError(true));
  }, [slug]);

  if (error) {
    return (
      <div className="p-4 text-center text-muted-foreground text-sm">
        <User className="h-8 w-8 mx-auto mb-2 opacity-40" />
        Resume unavailable
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-4 space-y-3 animate-pulse">
        <div className="h-12 bg-muted rounded" />
        <div className="h-8 bg-muted rounded w-3/4" />
        <div className="h-24 bg-muted rounded" />
      </div>
    );
  }

  const { resume, profile, skills, certifications, experience } = data;
  const sorted = [...resume.sections].filter((s) => s.visible).sort((a, b) => a.order - b.order);

  const skillsByCategory = skills.reduce<Record<string, Skill[]>>((acc, s) => {
    (acc[s.category || "Other"] ??= []).push(s);
    return acc;
  }, {});

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          {profile?.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt=""
              className="h-10 w-10 rounded-full object-cover ring-2 ring-orange-200"
            />
          ) : (
            <div className="h-10 w-10 rounded-full bg-orange-100 flex items-center justify-center">
              <User className="h-5 w-5 text-orange-600" />
            </div>
          )}
          <div className="min-w-0">
            <h3 className="font-semibold text-sm truncate">
              {profile?.fullName || resume.title}
            </h3>
            {(resume.targetRole || profile?.headline) && (
              <p className="text-xs text-orange-600 truncate">
                {resume.targetRole || profile?.headline}
              </p>
            )}
            {profile?.city && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {profile.city}{profile.state && `, ${profile.state}`}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Sections */}
      {sorted.map((section) => {
        if (section.type === "summary" && resume.summary) {
          return (
            <Section key="summary" title="Summary" icon={Briefcase}>
              <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
                {resume.summary}
              </p>
            </Section>
          );
        }

        if (section.type === "experience" && experience.length > 0) {
          return (
            <Section key="experience" title="Experience" icon={Building2}>
              <div className="space-y-3">
                {experience.map((pos) => (
                  <div key={pos.id} className="pl-3 border-l-2 border-orange-200">
                    <p className="font-medium text-foreground">{pos.role}</p>
                    <p className="text-xs text-orange-600">{pos.company}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Calendar className="h-3 w-3" />
                      {fmtDate(pos.startDate)} – {pos.endDate ? fmtDate(pos.endDate) : "Present"}
                    </p>
                    {pos.techStack && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {pos.techStack.split(",").map((t) => (
                          <span
                            key={t.trim()}
                            className="px-1.5 py-0.5 text-[10px] rounded bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300"
                          >
                            {t.trim()}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          );
        }

        if (section.type === "skills" && skills.length > 0) {
          return (
            <Section key="skills" title="Skills" icon={Code2}>
              <div className="space-y-3">
                {Object.entries(skillsByCategory).map(([cat, items]) => (
                  <div key={cat}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                      {cat}
                    </p>
                    <div className="space-y-1.5">
                      {items.map((s) => (
                        <div key={s.id} className="flex items-center gap-2">
                          <span className="w-20 text-xs truncate">{s.name}</span>
                          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full ${profColor[s.proficiency] || "bg-gray-400"}`}
                              style={{ width: `${profPct[s.proficiency] || 25}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          );
        }

        if (section.type === "certifications" && certifications.length > 0) {
          return (
            <Section key="certifications" title="Certifications" icon={Award} defaultOpen={false}>
              <div className="space-y-2">
                {certifications.map((cert) => (
                  <div key={cert.id}>
                    <p className="font-medium text-foreground">{cert.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {cert.issuer} · {fmtDate(cert.issueDate)}
                    </p>
                  </div>
                ))}
              </div>
            </Section>
          );
        }

        return null;
      })}
    </div>
  );
}
