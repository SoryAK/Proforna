import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  MapPin,
  DollarSign,
  Building2,
  Clock,
  Star,
  ExternalLink,
  Briefcase,
  GraduationCap,
  Calendar,
  Mail,
} from "lucide-react";

const TYPE_LABELS: Record<string, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
};
const EMPLOYMENT_LABELS: Record<string, string> = {
  full_time: "Full-Time",
  part_time: "Part-Time",
  contract: "Contract",
  internship: "Internship",
  temporary: "Temporary",
};
const LEVEL_LABELS: Record<string, string> = {
  entry: "Entry Level",
  mid: "Mid Level",
  senior: "Senior",
  lead: "Lead",
  executive: "Executive",
};
const FREQ_SHORT: Record<string, string> = { hourly: "/hr", yearly: "/yr" };

function fmtSalary(min: number | null, max: number | null, currency: string, freq: string) {
  const f = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  if (min && max) return `${f(min)} – ${f(max)}${FREQ_SHORT[freq] ?? ""}`;
  if (min) return `From ${f(min)}${FREQ_SHORT[freq] ?? ""}`;
  if (max) return `Up to ${f(max)}${FREQ_SHORT[freq] ?? ""}`;
  return null;
}

export default async function JobDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const posting = await prisma.jobPosting.findUnique({
    where: { slug },
  });

  if (!posting || !posting.isPublished) notFound();

  // Increment view count (fire-and-forget)
  prisma.jobPosting.update({
    where: { id: posting.id },
    data: { viewCount: { increment: 1 } },
  }).catch(() => {});

  const salary = fmtSalary(posting.salaryMin, posting.salaryMax, posting.currency, posting.payFrequency);
  const tech = posting.techStack?.split(",").map((t) => t.trim()).filter(Boolean) ?? [];
  const requirements = posting.requirements?.split("\n").filter(Boolean) ?? [];
  const niceToHave = posting.niceToHave?.split("\n").filter(Boolean) ?? [];
  const benefits = posting.benefits?.split("\n").filter(Boolean) ?? [];
  const expired = posting.expiresAt && posting.expiresAt < new Date();

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Header Card */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/40 dark:to-indigo-900/40">
                <Building2 className="h-7 w-7 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h1 className="text-2xl font-bold">{posting.role}</h1>
                  {posting.isFeatured && (
                    <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                      <Star className="h-3 w-3 mr-0.5" /> Featured
                    </Badge>
                  )}
                  {expired && <Badge variant="destructive">Expired</Badge>}
                </div>
                <p className="text-muted-foreground">
                  {posting.company}
                  {posting.department ? ` · ${posting.department}` : ""}
                </p>

                {/* Meta row */}
                <div className="flex flex-wrap gap-2 mt-3">
                  {posting.location && (
                    <Badge variant="secondary" className="gap-1">
                      <MapPin className="h-3 w-3" /> {posting.location}
                    </Badge>
                  )}
                  <Badge variant="secondary">
                    <Briefcase className="h-3 w-3 mr-1" /> {TYPE_LABELS[posting.type] ?? posting.type}
                  </Badge>
                  <Badge variant="secondary">
                    <Clock className="h-3 w-3 mr-1" /> {EMPLOYMENT_LABELS[posting.employmentType] ?? posting.employmentType}
                  </Badge>
                  <Badge variant="secondary">
                    <GraduationCap className="h-3 w-3 mr-1" /> {LEVEL_LABELS[posting.experienceLevel] ?? posting.experienceLevel}
                  </Badge>
                </div>

                {salary && (
                  <div className="mt-3 flex items-center gap-1.5 text-lg font-semibold text-emerald-600 dark:text-emerald-400">
                    <DollarSign className="h-5 w-5" /> {salary}
                  </div>
                )}
              </div>
            </div>

            {/* CTA */}
            <div className="flex gap-3 mt-6">
              {posting.applicationUrl && (
                <a href={posting.applicationUrl} target="_blank" rel="noopener noreferrer">
                  <Button size="lg" className="gap-2">
                    Apply Now <ExternalLink className="h-4 w-4" />
                  </Button>
                </a>
              )}
              {posting.contactEmail && (
                <a href={`mailto:${posting.contactEmail}`}>
                  <Button variant="outline" size="lg" className="gap-2">
                    <Mail className="h-4 w-4" /> Email
                  </Button>
                </a>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Description */}
        <Card>
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold mb-3">About the Role</h2>
            <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
              {posting.description}
            </div>
          </CardContent>
        </Card>

        {/* Requirements */}
        {requirements.length > 0 && (
          <Card>
            <CardContent className="p-6">
              <h2 className="text-lg font-semibold mb-3">Requirements</h2>
              <ul className="space-y-1.5">
                {requirements.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                    {r}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Nice to Have */}
        {niceToHave.length > 0 && (
          <Card>
            <CardContent className="p-6">
              <h2 className="text-lg font-semibold mb-3">Nice to Have</h2>
              <ul className="space-y-1.5">
                {niceToHave.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-purple-500" />
                    {r}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Benefits */}
        {benefits.length > 0 && (
          <Card>
            <CardContent className="p-6">
              <h2 className="text-lg font-semibold mb-3">Benefits & Perks</h2>
              <ul className="space-y-1.5">
                {benefits.map((b, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                    {b}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Tech Stack */}
        {tech.length > 0 && (
          <Card>
            <CardContent className="p-6">
              <h2 className="text-lg font-semibold mb-3">Tech Stack</h2>
              <div className="flex flex-wrap gap-2">
                {tech.map((t) => (
                  <Badge key={t} variant="secondary" className="text-xs">
                    {t}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Footer info */}
        <div className="flex items-center justify-between text-xs text-muted-foreground px-1 pb-4">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            Posted {new Date(posting.createdAt).toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </span>
          {posting.expiresAt && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {expired ? "Expired" : `Expires ${new Date(posting.expiresAt).toLocaleDateString()}`}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
