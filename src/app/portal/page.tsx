"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Briefcase,
  MapPin,
  DollarSign,
  Send,
  CheckCircle2,
  FileText,
  Award,
  Sparkles,
  Building2,
  Calendar,
  Code2,
} from "lucide-react";
import {
  AVAILABILITY_LABELS,
  AVAILABILITY_COLORS,
  PROFICIENCY_LEVELS,
  type AvailabilityStatus,
} from "@/lib/constants";

interface PortalData {
  availability: AvailabilityStatus;
  bio: string | null;
  preferredRoles: string | null;
  targetSalaryMin: number | null;
  targetSalaryMax: number | null;
  currency: string;
  locationPreference: string | null;
  showSkills: boolean;
  showResume: boolean;
  showCertifications: boolean;
  showCurrentRole: boolean;
  skills: { id: string; name: string; category: string; proficiency: string }[];
  certifications: { id: string; name: string; issuer: string; issueDate: string }[];
  hasActiveResume: boolean;
  currentPosition: {
    id: string;
    company: string;
    role: string;
    department: string | null;
    location: string | null;
    type: string;
    startDate: string;
    techStack: string | null;
    description: string | null;
  } | null;
}

const emptyForm = {
  recruiterName: "",
  recruiterEmail: "",
  company: "",
  linkedinUrl: "",
  jobTitle: "",
  jobDescription: "",
  salaryMin: "",
  salaryMax: "",
  location: "",
  jobType: "remote",
  message: "",
};

const proficiencyWidth: Record<string, string> = {
  beginner: "w-1/4",
  intermediate: "w-1/2",
  advanced: "w-3/4",
  expert: "w-full",
};

export default function PortalPage() {
  const [form, setForm] = useState(emptyForm);
  const [submitted, setSubmitted] = useState(false);

  const { data: portal, isLoading } = useQuery<PortalData>({
    queryKey: ["portal"],
    queryFn: () => fetch("/api/portal").then((r) => r.json()),
  });

  const submitMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch("/api/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => {
        if (!r.ok) return r.json().then((e) => Promise.reject(e));
        return r.json();
      }),
    onSuccess: () => {
      setSubmitted(true);
      toast.success("Submission sent successfully!");
    },
    onError: (err: { error?: string }) => {
      toast.error(err.error || "Failed to submit");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitMutation.mutate({
      ...form,
      salaryMin: form.salaryMin ? parseInt(form.salaryMin) : null,
      salaryMax: form.salaryMax ? parseInt(form.salaryMax) : null,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-gray-500">Loading portal...</div>
      </div>
    );
  }

  if (!portal || portal.availability === undefined) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">Portal not configured yet.</p>
      </div>
    );
  }

  const availLabel = AVAILABILITY_LABELS[portal.availability] || portal.availability;
  const availColor = AVAILABILITY_COLORS[portal.availability] || "";
  const roles = portal.preferredRoles?.split(",").map((r) => r.trim()).filter(Boolean) || [];
  const skillsByCategory = portal.skills.reduce<Record<string, typeof portal.skills>>(
    (acc, s) => {
      (acc[s.category] ??= []).push(s);
      return acc;
    },
    {}
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur dark:bg-gray-950/80">
        <div className="container mx-auto max-w-4xl px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Briefcase className="h-6 w-6 text-blue-600" />
                Recruiter Portal
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Powered by Resumsify
              </p>
            </div>
            <Badge className={`${availColor} text-sm px-3 py-1`}>
              {availLabel}
            </Badge>
          </div>
        </div>
      </header>

      <div className="container mx-auto max-w-4xl px-6 py-8 space-y-8">
        {/* About Section */}
        {(portal.bio || roles.length > 0 || portal.locationPreference) && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-blue-600" />
                About the Candidate
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {portal.bio && (
                <p className="text-gray-700 dark:text-gray-300">{portal.bio}</p>
              )}
              <div className="flex flex-wrap gap-4 text-sm">
                {roles.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-gray-400" />
                    <span className="text-gray-600 dark:text-gray-400">Looking for:</span>
                    <div className="flex gap-1">
                      {roles.map((r) => (
                        <Badge key={r} variant="secondary">{r}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {portal.locationPreference && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-gray-400" />
                    <span className="text-gray-600 dark:text-gray-400">{portal.locationPreference}</span>
                  </div>
                )}
                {portal.targetSalaryMin && portal.targetSalaryMax && (
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-gray-400" />
                    <span className="text-gray-600 dark:text-gray-400">
                      {portal.currency} {portal.targetSalaryMin.toLocaleString()} - {portal.targetSalaryMax.toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Current Role Section */}
        {portal.showCurrentRole && portal.currentPosition && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-emerald-600" />
                Current Role
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-lg font-semibold">{portal.currentPosition.role}</p>
                <p className="text-gray-600 dark:text-gray-400 flex items-center gap-1.5">
                  <Building2 className="h-4 w-4" />
                  {portal.currentPosition.company}
                  {portal.currentPosition.department && (
                    <span className="text-sm">· {portal.currentPosition.department}</span>
                  )}
                </p>
              </div>
              <div className="flex flex-wrap gap-3 text-sm">
                {portal.currentPosition.location && (
                  <div className="flex items-center gap-1.5 text-gray-500">
                    <MapPin className="h-3.5 w-3.5" />
                    {portal.currentPosition.location}
                  </div>
                )}
                <div className="flex items-center gap-1.5 text-gray-500">
                  <Calendar className="h-3.5 w-3.5" />
                  Since {new Date(portal.currentPosition.startDate).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                </div>
                <Badge variant="outline" className="capitalize text-xs">
                  {portal.currentPosition.type}
                </Badge>
              </div>
              {portal.currentPosition.description && (
                <p className="text-sm text-gray-600 dark:text-gray-400 pt-1">
                  {portal.currentPosition.description}
                </p>
              )}
              {portal.currentPosition.techStack && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {portal.currentPosition.techStack.split(",").map((t) => (
                    <Badge key={t.trim()} variant="secondary" className="text-xs">
                      <Code2 className="h-3 w-3 mr-1" />
                      {t.trim()}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Skills Section */}
        {portal.showSkills && portal.skills.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-600" />
                Skills & Expertise
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {Object.entries(skillsByCategory).map(([cat, skills]) => (
                  <div key={cat}>
                    <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                      {cat}
                    </h4>
                    <div className="space-y-2">
                      {skills.map((skill) => (
                        <div key={skill.id} className="flex items-center gap-3">
                          <span className="text-sm w-28 text-gray-700 dark:text-gray-300">
                            {skill.name}
                          </span>
                          <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full bg-blue-500 rounded-full ${
                                proficiencyWidth[skill.proficiency] || "w-1/2"
                              }`}
                            />
                          </div>
                          <span className="text-xs text-gray-400 w-20 text-right capitalize">
                            {skill.proficiency}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Certifications */}
        {portal.showCertifications && portal.certifications.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="h-5 w-5 text-amber-600" />
                Certifications
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2">
                {portal.certifications.map((cert) => (
                  <div key={cert.id} className="rounded-lg border p-3">
                    <p className="font-medium text-sm">{cert.name}</p>
                    <p className="text-xs text-gray-500">{cert.issuer}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Resume Availability */}
        {portal.showResume && portal.hasActiveResume && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-green-600" />
                Resume
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3 p-4 rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <div>
                  <p className="font-medium text-green-800 dark:text-green-200">
                    Resume available
                  </p>
                  <p className="text-sm text-green-600 dark:text-green-400">
                    Request via the form below and the candidate will share it directly.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Submission Form */}
        {submitted ? (
          <Card>
            <CardContent className="py-12 text-center">
              <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">Thank You!</h3>
              <p className="text-gray-500">
                Your submission has been received. The candidate will review it shortly.
              </p>
              <Button
                className="mt-6"
                variant="outline"
                onClick={() => {
                  setSubmitted(false);
                  setForm(emptyForm);
                }}
              >
                Submit Another Opportunity
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5 text-blue-600" />
                Submit an Opportunity
              </CardTitle>
              <p className="text-sm text-gray-500">
                Share a job opportunity or reach out to the candidate.
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Your Info */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                    Your Information
                  </h4>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="text-sm font-medium mb-1 block">
                        Name <span className="text-red-500">*</span>
                      </label>
                      <Input
                        required
                        placeholder="Jane Doe"
                        value={form.recruiterName}
                        onChange={(e) =>
                          setForm({ ...form, recruiterName: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">
                        Email <span className="text-red-500">*</span>
                      </label>
                      <Input
                        required
                        type="email"
                        placeholder="jane@company.com"
                        value={form.recruiterEmail}
                        onChange={(e) =>
                          setForm({ ...form, recruiterEmail: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">
                        Company
                      </label>
                      <Input
                        placeholder="Acme Corp"
                        value={form.company}
                        onChange={(e) =>
                          setForm({ ...form, company: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">
                        LinkedIn URL
                      </label>
                      <Input
                        placeholder="https://linkedin.com/in/..."
                        value={form.linkedinUrl}
                        onChange={(e) =>
                          setForm({ ...form, linkedinUrl: e.target.value })
                        }
                      />
                    </div>
                  </div>
                </div>

                {/* Job Details */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                    Job Details
                  </h4>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label className="text-sm font-medium mb-1 block">
                        Job Title <span className="text-red-500">*</span>
                      </label>
                      <Input
                        required
                        placeholder="Senior Software Engineer"
                        value={form.jobTitle}
                        onChange={(e) =>
                          setForm({ ...form, jobTitle: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">
                        Location
                      </label>
                      <Input
                        placeholder="San Francisco, CA"
                        value={form.location}
                        onChange={(e) =>
                          setForm({ ...form, location: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">
                        Work Type
                      </label>
                      <Select
                        value={form.jobType}
                        onValueChange={(v) =>
                          setForm({ ...form, jobType: v ?? "remote" })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="remote">Remote</SelectItem>
                          <SelectItem value="hybrid">Hybrid</SelectItem>
                          <SelectItem value="onsite">On-site</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">
                        Salary Min (USD)
                      </label>
                      <Input
                        type="number"
                        placeholder="100000"
                        value={form.salaryMin}
                        onChange={(e) =>
                          setForm({ ...form, salaryMin: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">
                        Salary Max (USD)
                      </label>
                      <Input
                        type="number"
                        placeholder="180000"
                        value={form.salaryMax}
                        onChange={(e) =>
                          setForm({ ...form, salaryMax: e.target.value })
                        }
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-sm font-medium mb-1 block">
                        Job Description
                      </label>
                      <Textarea
                        placeholder="Tell the candidate about the role, team, and what you're looking for..."
                        rows={4}
                        value={form.jobDescription}
                        onChange={(e) =>
                          setForm({ ...form, jobDescription: e.target.value })
                        }
                      />
                    </div>
                  </div>
                </div>

                {/* Message */}
                <div>
                  <label className="text-sm font-medium mb-1 block">
                    Personal Message
                  </label>
                  <Textarea
                    placeholder="Any additional notes for the candidate..."
                    rows={3}
                    value={form.message}
                    onChange={(e) =>
                      setForm({ ...form, message: e.target.value })
                    }
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={submitMutation.isPending}
                >
                  {submitMutation.isPending ? (
                    "Submitting..."
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Submit Opportunity
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <footer className="text-center py-6 text-xs text-gray-400">
          Powered by Resumsify — Career Tracker
        </footer>
      </div>
    </div>
  );
}
