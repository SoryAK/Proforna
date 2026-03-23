"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import {
  User,
  Upload,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  FileText,
  Sparkles,
  Loader2,
  X,
  Camera,
  Plus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const STEPS = [
  { id: "welcome", label: "Welcome" },
  { id: "profile", label: "Profile" },
  { id: "resume", label: "Resume" },
  { id: "done", label: "Done" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [step, setStep] = useState(0);

  // Profile fields
  const [fullName, setFullName] = useState("");
  const [headline, setHeadline] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [bio, setBio] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [saving, setSaving] = useState(false);

  // Avatar upload
  const avatarRef = useRef<HTMLInputElement>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Resume upload
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [resumeSaved, setResumeSaved] = useState(false);
  const [parsedData, setParsedData] = useState<any>(null);
  const [savingImport, setSavingImport] = useState(false);

  // Pre-fill name from session
  const userName = session?.user?.name || "";
  if (fullName === "" && userName && step === 0) {
    // will populate on first render of step 1
  }

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  if (status === "unauthenticated") {
    router.push("/login");
    return null;
  }

  async function handleAvatarSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowed.includes(f.type)) {
      toast.error("Use JPEG, PNG, WebP, or GIF.");
      return;
    }
    if (f.size > 2 * 1024 * 1024) {
      toast.error("Image too large (2MB max).");
      return;
    }
    setUploadingAvatar(true);
    try {
      const fd = new FormData();
      fd.append("avatar", f);
      const res = await fetch("/api/avatar", { method: "POST", body: fd });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Upload failed");
      }
      const { avatarUrl } = await res.json();
      setAvatarPreview(avatarUrl);
      toast.success("Photo uploaded!");
    } catch (err: any) {
      toast.error(err.message || "Failed to upload photo.");
    } finally {
      setUploadingAvatar(false);
      if (avatarRef.current) avatarRef.current.value = "";
    }
  }

  async function saveProfile() {
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fullName || userName,
          headline,
          city,
          state,
          bio,
          linkedinUrl,
          githubUrl,
          portfolioUrl,
        }),
      });
      if (!res.ok) throw new Error("Failed to save profile");
      toast.success("Profile saved!");
      setStep(2); // go to resume step
    } catch {
      toast.error("Failed to save profile. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.type !== "application/pdf") {
      toast.error("Only PDF files are supported.");
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      toast.error("File too large (5MB max).");
      return;
    }
    setFile(f);
  }

  const sanitize = (obj: any): any => {
    if (obj === null || obj === undefined || obj === "null" || obj === "undefined") return "";
    if (typeof obj === "string") return obj;
    if (Array.isArray(obj)) return obj.map(sanitize);
    if (typeof obj === "object") {
      const out: any = {};
      for (const [k, v] of Object.entries(obj)) out[k] = sanitize(v);
      return out;
    }
    return obj;
  };

  async function handleResumeUpload() {
    if (!file) return;
    setParsing(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const parseRes = await fetch("/api/resume-parse", { method: "POST", body: formData });
      if (!parseRes.ok) {
        const errData = await parseRes.json();
        throw new Error(errData.error || "Failed to parse resume");
      }
      const parsed = await parseRes.json();
      setParsedData(sanitize(parsed.data));
    } catch (err: any) {
      toast.error(err.message || "Failed to process resume.");
    } finally {
      setParsing(false);
    }
  }

  async function handleConfirmSave() {
    if (!parsedData) return;
    setSavingImport(true);
    try {
      const saveRes = await fetch("/api/resume-import-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsedData),
      });
      if (!saveRes.ok) {
        const errData = await saveRes.json();
        throw new Error(errData.error || "Failed to save resume data");
      }

      // Also update profile with AI-extracted info if user left fields blank
      if (parsedData.profile) {
        const profileUpdates: Record<string, string> = {};
        if (!headline && parsedData.profile.headline) profileUpdates.headline = parsedData.profile.headline;
        if (!bio && parsedData.profile.bio) profileUpdates.bio = parsedData.profile.bio;
        if (!linkedinUrl && parsedData.profile.linkedinUrl) profileUpdates.linkedinUrl = parsedData.profile.linkedinUrl;
        if (!githubUrl && parsedData.profile.githubUrl) profileUpdates.githubUrl = parsedData.profile.githubUrl;
        if (!portfolioUrl && parsedData.profile.website) profileUpdates.portfolioUrl = parsedData.profile.website;
        if (!city && parsedData.profile.location) {
          const parts = parsedData.profile.location.split(",");
          if (parts[0]) profileUpdates.city = parts[0].trim();
          if (parts[1]) profileUpdates.state = parts[1].trim();
        }
        if (Object.keys(profileUpdates).length > 0) {
          await fetch("/api/profile", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(profileUpdates),
          });
        }
      }

      setParsedData(null);
      setResumeSaved(true);
      toast.success("Resume imported successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to save resume data.");
    } finally {
      setSavingImport(false);
    }
  }

  function goToDashboard() {
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-[#0a0514] text-slate-100 flex flex-col items-center justify-center px-4 py-8 relative overflow-hidden">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:32px_32px]" />
      </div>

      {/* Progress indicator */}
      <div className="relative z-10 flex items-center gap-2 mb-8">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                i < step
                  ? "bg-green-500 text-white"
                  : i === step
                  ? "bg-orange-500 text-white"
                  : "bg-slate-700 text-slate-400"
              }`}
            >
              {i < step ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
            </div>
            <span className={`text-xs hidden sm:inline ${i === step ? "text-orange-400 font-medium" : "text-slate-500"}`}>
              {s.label}
            </span>
            {i < STEPS.length - 1 && (
              <div className={`w-8 h-0.5 ${i < step ? "bg-green-500" : "bg-slate-700"}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <Card className={`relative z-10 w-full bg-slate-900/80 border-slate-700 backdrop-blur-sm ${parsedData ? "max-w-3xl" : "max-w-lg"}`}>
        <CardContent className="p-6 sm:p-8">
          {/* ━━ Step 0: Welcome ━━ */}
          {step === 0 && (
            <div className="text-center space-y-6">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-orange-500/20 flex items-center justify-center">
                <Sparkles className="w-8 h-8 text-orange-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">
                  Welcome to Resumsify{userName ? `, ${userName.split(" ")[0]}` : ""}!
                </h1>
                <p className="text-slate-400 mt-2 text-sm leading-relaxed">
                  Let's get your career profile set up. This will only take a couple of minutes.
                  We'll walk you through your basic info and give you the option to import your resume.
                </p>
              </div>
              <Button
                onClick={() => {
                  if (userName && !fullName) setFullName(userName);
                  setStep(1);
                }}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white"
              >
                Let's Get Started <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          )}

          {/* ━━ Step 1: Profile ━━ */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <User className="w-5 h-5 text-orange-400" /> Your Profile
                </h2>
                <p className="text-slate-400 text-sm mt-1">
                  Tell us a bit about yourself. You can always update this later.
                </p>
              </div>

              <div className="grid gap-4">
                {/* Avatar picker */}
                <div className="flex flex-col items-center gap-2">
                  <button
                    type="button"
                    onClick={() => avatarRef.current?.click()}
                    disabled={uploadingAvatar}
                    className="relative w-24 h-24 rounded-full border-2 border-dashed border-slate-600 hover:border-orange-500/60 transition-colors overflow-hidden flex items-center justify-center bg-slate-800 group"
                  >
                    <input
                      ref={avatarRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      onChange={handleAvatarSelect}
                    />
                    {uploadingAvatar ? (
                      <Loader2 className="w-6 h-6 animate-spin text-orange-400" />
                    ) : avatarPreview ? (
                      <>
                        <Image
                          src={avatarPreview}
                          alt="Avatar"
                          width={96}
                          height={96}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Camera className="w-5 h-5 text-white" />
                        </div>
                      </>
                    ) : (
                      <div className="text-center">
                        <Camera className="w-6 h-6 text-slate-500 mx-auto" />
                      </div>
                    )}
                  </button>
                  <span className="text-xs text-slate-500">{avatarPreview ? "Change photo" : "Add a photo"}</span>
                </div>

                <div>
                  <Label htmlFor="fullName" className="text-slate-300">Full Name *</Label>
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="John Doe"
                    className="bg-slate-800 border-slate-600 text-white mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="headline" className="text-slate-300">Professional Headline</Label>
                  <Input
                    id="headline"
                    value={headline}
                    onChange={(e) => setHeadline(e.target.value)}
                    placeholder="e.g. Senior Software Engineer"
                    className="bg-slate-800 border-slate-600 text-white mt-1"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="city" className="text-slate-300">City</Label>
                    <Input
                      id="city"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="New York"
                      className="bg-slate-800 border-slate-600 text-white mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="state" className="text-slate-300">State</Label>
                    <Input
                      id="state"
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                      placeholder="NY"
                      className="bg-slate-800 border-slate-600 text-white mt-1"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="bio" className="text-slate-300">Short Bio</Label>
                  <Textarea
                    id="bio"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="A brief summary about yourself..."
                    rows={3}
                    className="bg-slate-800 border-slate-600 text-white mt-1 resize-none"
                  />
                </div>

                <div>
                  <Label htmlFor="linkedinUrl" className="text-slate-300">LinkedIn URL</Label>
                  <Input
                    id="linkedinUrl"
                    value={linkedinUrl}
                    onChange={(e) => setLinkedinUrl(e.target.value)}
                    placeholder="https://linkedin.com/in/yourname"
                    className="bg-slate-800 border-slate-600 text-white mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="githubUrl" className="text-slate-300">GitHub URL</Label>
                  <Input
                    id="githubUrl"
                    value={githubUrl}
                    onChange={(e) => setGithubUrl(e.target.value)}
                    placeholder="https://github.com/yourname"
                    className="bg-slate-800 border-slate-600 text-white mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="portfolioUrl" className="text-slate-300">Portfolio URL</Label>
                  <Input
                    id="portfolioUrl"
                    value={portfolioUrl}
                    onChange={(e) => setPortfolioUrl(e.target.value)}
                    placeholder="https://yoursite.com"
                    className="bg-slate-800 border-slate-600 text-white mt-1"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setStep(0)}
                  className="border-slate-600 text-slate-300 hover:bg-slate-800"
                >
                  <ArrowLeft className="w-4 h-4 mr-1" /> Back
                </Button>
                <Button
                  onClick={saveProfile}
                  disabled={saving || !fullName.trim()}
                  className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
                >
                  {saving ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>
                  ) : (
                    <>Save & Continue <ArrowRight className="w-4 h-4 ml-2" /></>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* ━━ Step 2: Resume Upload ━━ */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <FileText className="w-5 h-5 text-orange-400" /> Import Your Resume
                </h2>
                <p className="text-slate-400 text-sm mt-1">
                  {parsedData
                    ? "Review the extracted data below. Edit anything that looks off, then confirm."
                    : "Have a resume ready? Upload it and we'll extract your experience, skills, and education automatically using AI. This is optional — you can always do it later."}
                </p>
              </div>

              {resumeSaved ? (
                <div className="text-center py-4">
                  <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3" />
                  <p className="text-green-300 font-medium">Resume imported successfully!</p>
                  <p className="text-slate-500 text-sm mt-1">
                    Your experience, skills, and education have been added to your profile.
                    You can review and edit them from the dashboard.
                  </p>
                </div>
              ) : parsedData ? (
                /* ── Editable Preview ── */
                <div className="overflow-y-auto border border-slate-700 rounded-lg max-h-[55vh]">
                  <div className="space-y-6 p-4">

                    {/* Profile */}
                    <section>
                      <h3 className="text-sm font-semibold text-slate-300 border-b border-slate-700 pb-2 mb-3">Profile</h3>
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs text-slate-500 mb-1 block">Headline</Label>
                            <Input value={parsedData.profile?.headline || ""} onChange={(e) => setParsedData({ ...parsedData, profile: { ...parsedData.profile, headline: e.target.value } })} className="bg-slate-800 border-slate-600 text-white" />
                          </div>
                          <div>
                            <Label className="text-xs text-slate-500 mb-1 block">Location</Label>
                            <Input value={parsedData.profile?.location || ""} onChange={(e) => setParsedData({ ...parsedData, profile: { ...parsedData.profile, location: e.target.value } })} className="bg-slate-800 border-slate-600 text-white" />
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs text-slate-500 mb-1 block">Bio / Summary</Label>
                          <Textarea rows={3} value={parsedData.profile?.bio || ""} onChange={(e) => setParsedData({ ...parsedData, profile: { ...parsedData.profile, bio: e.target.value } })} className="bg-slate-800 border-slate-600 text-white resize-none" />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <Label className="text-xs text-slate-500 mb-1 block">Website</Label>
                            <Input value={parsedData.profile?.website || ""} onChange={(e) => setParsedData({ ...parsedData, profile: { ...parsedData.profile, website: e.target.value } })} className="bg-slate-800 border-slate-600 text-white" />
                          </div>
                          <div>
                            <Label className="text-xs text-slate-500 mb-1 block">LinkedIn</Label>
                            <Input value={parsedData.profile?.linkedinUrl || ""} onChange={(e) => setParsedData({ ...parsedData, profile: { ...parsedData.profile, linkedinUrl: e.target.value } })} className="bg-slate-800 border-slate-600 text-white" />
                          </div>
                          <div>
                            <Label className="text-xs text-slate-500 mb-1 block">GitHub</Label>
                            <Input value={parsedData.profile?.githubUrl || ""} onChange={(e) => setParsedData({ ...parsedData, profile: { ...parsedData.profile, githubUrl: e.target.value } })} className="bg-slate-800 border-slate-600 text-white" />
                          </div>
                        </div>
                      </div>
                    </section>

                    {/* Experience */}
                    <section>
                      <h3 className="text-sm font-semibold text-slate-300 border-b border-slate-700 pb-2 mb-3">Experience ({parsedData.experience?.length || 0})</h3>
                      <div className="space-y-4">
                        {(parsedData.experience || []).map((exp: any, i: number) => {
                          const updateExp = (field: string, value: any) => {
                            const updated = [...parsedData.experience];
                            updated[i] = { ...updated[i], [field]: value };
                            setParsedData({ ...parsedData, experience: updated });
                          };
                          const removeExp = () => {
                            setParsedData({ ...parsedData, experience: parsedData.experience.filter((_: any, idx: number) => idx !== i) });
                          };
                          return (
                            <div key={i} className="border border-slate-700 rounded-lg p-3 bg-slate-800/50 space-y-3 relative">
                              <button type="button" onClick={removeExp} className="absolute top-2 right-2 p-1 rounded hover:bg-red-900/30" title="Remove">
                                <X className="h-4 w-4 text-red-400" />
                              </button>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pr-6">
                                <div>
                                  <Label className="text-xs text-slate-500 mb-1 block">Job Title</Label>
                                  <Input value={exp.title || ""} onChange={(e) => updateExp("title", e.target.value)} className="bg-slate-800 border-slate-600 text-white" />
                                </div>
                                <div>
                                  <Label className="text-xs text-slate-500 mb-1 block">Company</Label>
                                  <Input value={exp.company || ""} onChange={(e) => updateExp("company", e.target.value)} className="bg-slate-800 border-slate-600 text-white" />
                                </div>
                              </div>
                              <div>
                                <Label className="text-xs text-slate-500 mb-1 block">Location</Label>
                                <Input value={exp.location || ""} onChange={(e) => updateExp("location", e.target.value)} className="bg-slate-800 border-slate-600 text-white" />
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                                <div>
                                  <Label className="text-xs text-slate-500 mb-1 block">Start Date</Label>
                                  <Input type="date" value={exp.startDate || ""} onChange={(e) => updateExp("startDate", e.target.value)} className="bg-slate-800 border-slate-600 text-white" />
                                </div>
                                <div>
                                  <Label className="text-xs text-slate-500 mb-1 block">End Date</Label>
                                  <Input type="date" value={exp.endDate || ""} disabled={exp.isCurrent === true} onChange={(e) => updateExp("endDate", e.target.value)} className="bg-slate-800 border-slate-600 text-white" />
                                </div>
                                <div className="flex items-center gap-2 pb-2">
                                  <input type="checkbox" id={`exp-current-${i}`} checked={exp.isCurrent === true} onChange={(e) => updateExp("isCurrent", e.target.checked)} className="rounded border-gray-300" />
                                  <Label htmlFor={`exp-current-${i}`} className="text-xs text-slate-400 whitespace-nowrap">Current position</Label>
                                </div>
                              </div>
                              <div>
                                <Label className="text-xs text-slate-500 mb-1 block">Description</Label>
                                <Textarea rows={2} value={exp.description || ""} onChange={(e) => updateExp("description", e.target.value)} className="bg-slate-800 border-slate-600 text-white resize-none" />
                              </div>
                              <div>
                                <Label className="text-xs text-slate-500 mb-1 block">Key Achievements (one per line)</Label>
                                <Textarea
                                  rows={3}
                                  placeholder="- Led migration to microservices&#10;- Reduced latency by 40%"
                                  value={Array.isArray(exp.achievements) ? exp.achievements.filter((a: string) => a).join("\n") : ""}
                                  onChange={(e) => updateExp("achievements", e.target.value.split("\n"))}
                                  className="bg-slate-800 border-slate-600 text-white resize-none"
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>

                    {/* Education */}
                    <section>
                      <h3 className="text-sm font-semibold text-slate-300 border-b border-slate-700 pb-2 mb-3">Education ({(parsedData.education || []).length})</h3>
                      {(parsedData.education || []).length > 0 ? (
                        <div className="space-y-4">
                          {(parsedData.education || []).map((edu: any, i: number) => {
                            const updateEdu = (field: string, value: any) => {
                              const updated = [...(parsedData.education || [])];
                              updated[i] = { ...updated[i], [field]: value };
                              setParsedData({ ...parsedData, education: updated });
                            };
                            const removeEdu = () => {
                              setParsedData({ ...parsedData, education: (parsedData.education || []).filter((_: any, idx: number) => idx !== i) });
                            };
                            return (
                              <div key={i} className="border border-slate-700 rounded-lg p-3 bg-slate-800/50 space-y-3 relative">
                                <button type="button" onClick={removeEdu} className="absolute top-2 right-2 p-1 rounded hover:bg-red-900/30" title="Remove">
                                  <X className="h-4 w-4 text-red-400" />
                                </button>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pr-6">
                                  <div>
                                    <Label className="text-xs text-slate-500 mb-1 block">Institution</Label>
                                    <Input value={edu.institution || ""} onChange={(e) => updateEdu("institution", e.target.value)} className="bg-slate-800 border-slate-600 text-white" />
                                  </div>
                                  <div>
                                    <Label className="text-xs text-slate-500 mb-1 block">Degree</Label>
                                    <Input value={edu.degree || ""} onChange={(e) => updateEdu("degree", e.target.value)} className="bg-slate-800 border-slate-600 text-white" />
                                  </div>
                                </div>
                                <div>
                                  <Label className="text-xs text-slate-500 mb-1 block">Field of Study</Label>
                                  <Input value={edu.field || ""} onChange={(e) => updateEdu("field", e.target.value)} className="bg-slate-800 border-slate-600 text-white" />
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  <div>
                                    <Label className="text-xs text-slate-500 mb-1 block">Start Date</Label>
                                    <Input type="date" value={edu.startDate || ""} onChange={(e) => updateEdu("startDate", e.target.value)} className="bg-slate-800 border-slate-600 text-white" />
                                  </div>
                                  <div>
                                    <Label className="text-xs text-slate-500 mb-1 block">End Date</Label>
                                    <Input type="date" value={edu.endDate || ""} onChange={(e) => updateEdu("endDate", e.target.value)} className="bg-slate-800 border-slate-600 text-white" />
                                  </div>
                                </div>
                                <div>
                                  <Label className="text-xs text-slate-500 mb-1 block">Description</Label>
                                  <Textarea rows={2} value={edu.description || ""} onChange={(e) => updateEdu("description", e.target.value)} className="bg-slate-800 border-slate-600 text-white resize-none" />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-sm text-slate-500 italic">No education entries extracted.</p>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-3 border-slate-600 text-slate-300 hover:bg-slate-800"
                        onClick={() => setParsedData({ ...parsedData, education: [...(parsedData.education || []), { institution: "", degree: "", field: "", startDate: "", endDate: "", description: "" }] })}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" /> Add Education
                      </Button>
                    </section>

                    {/* Skills */}
                    <section>
                      <h3 className="text-sm font-semibold text-slate-300 border-b border-slate-700 pb-2 mb-3">Skills ({(parsedData.skills || []).length})</h3>
                      <div className="flex flex-wrap gap-2 mb-3">
                        {(parsedData.skills || []).map((skill: string, i: number) => (
                          <Badge key={i} variant="secondary" className="gap-1 pr-1 text-xs bg-slate-700 text-slate-200 border-slate-600">
                            {skill}
                            <button
                              type="button"
                              onClick={() => setParsedData({ ...parsedData, skills: parsedData.skills.filter((_: any, idx: number) => idx !== i) })}
                              className="ml-1 rounded-full hover:bg-red-900/30 p-0.5"
                            >
                              <X className="h-3 w-3 text-slate-400 hover:text-red-400" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                      <Input
                        placeholder="Type a skill and press Enter to add"
                        className="bg-slate-800 border-slate-600 text-white"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            const val = (e.target as HTMLInputElement).value.trim();
                            if (val) {
                              setParsedData({ ...parsedData, skills: [...(parsedData.skills || []), val] });
                              (e.target as HTMLInputElement).value = "";
                            }
                          }
                        }}
                      />
                    </section>

                  </div>
                </div>
              ) : (
                <>
                  {/* Drop zone */}
                  <div
                    onClick={() => fileRef.current?.click()}
                    className="border-2 border-dashed border-slate-600 rounded-xl p-8 text-center cursor-pointer hover:border-orange-500/50 hover:bg-slate-800/50 transition-colors"
                  >
                    <input
                      ref={fileRef}
                      type="file"
                      accept="application/pdf"
                      className="hidden"
                      onChange={handleFileSelect}
                    />
                    {file ? (
                      <div className="flex items-center justify-center gap-3">
                        <FileText className="w-8 h-8 text-orange-400" />
                        <div className="text-left">
                          <p className="text-white font-medium text-sm">{file.name}</p>
                          <p className="text-slate-500 text-xs">{(file.size / 1024).toFixed(0)} KB</p>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); setFile(null); }}
                          className="ml-2 p-1 rounded hover:bg-slate-700"
                        >
                          <X className="w-4 h-4 text-slate-400" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <Upload className="w-10 h-10 text-slate-500 mx-auto mb-3" />
                        <p className="text-slate-300 text-sm font-medium">Click to upload your resume</p>
                        <p className="text-slate-500 text-xs mt-1">PDF only, up to 5MB</p>
                      </>
                    )}
                  </div>

                  {file && (
                    <Button
                      onClick={handleResumeUpload}
                      disabled={parsing}
                      className="w-full bg-orange-500 hover:bg-orange-600 text-white"
                    >
                      {parsing ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing resume...</>
                      ) : (
                        <><Sparkles className="w-4 h-4 mr-2" /> Import with AI</>
                      )}
                    </Button>
                  )}
                </>
              )}

              <div className="flex gap-3 pt-2">
                {parsedData ? (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => setParsedData(null)}
                      disabled={savingImport}
                      className="border-slate-600 text-slate-300 hover:bg-slate-800"
                    >
                      <ArrowLeft className="w-4 h-4 mr-1" /> Re-upload
                    </Button>
                    <Button
                      onClick={handleConfirmSave}
                      disabled={savingImport}
                      className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
                    >
                      {savingImport ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>
                      ) : (
                        <>Confirm & Save <ArrowRight className="w-4 h-4 ml-2" /></>
                      )}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => setStep(1)}
                      disabled={parsing}
                      className="border-slate-600 text-slate-300 hover:bg-slate-800"
                    >
                      <ArrowLeft className="w-4 h-4 mr-1" /> Back
                    </Button>
                    <Button
                      onClick={() => setStep(3)}
                      disabled={parsing}
                      variant={resumeSaved ? "default" : "outline"}
                      className={
                        resumeSaved
                          ? "flex-1 bg-orange-500 hover:bg-orange-600 text-white"
                          : "flex-1 border-slate-600 text-slate-300 hover:bg-slate-800"
                      }
                    >
                      {resumeSaved ? "Continue" : "Skip for Now"} <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ━━ Step 3: Done ━━ */}
          {step === 3 && (
            <div className="text-center space-y-6">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-green-500/20 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-green-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">You're All Set!</h1>
                <p className="text-slate-400 mt-2 text-sm leading-relaxed">
                  Your profile is ready. Head to the dashboard to explore your career tracker,
                  manage applications, and build your interactive resume.
                </p>
              </div>
              <Button
                onClick={goToDashboard}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white"
              >
                Go to Dashboard <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Footer hint */}
      <p className="relative z-10 text-slate-600 text-xs mt-6">
        You can update all of this from your dashboard at any time.
      </p>
    </div>
  );
}
