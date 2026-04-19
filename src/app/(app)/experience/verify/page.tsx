"use client";

import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowLeft,
  Building2,
  Calendar,
  DollarSign,
  Shield,
  Download,
  Loader2,
  Info,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

/* ── Types ── */

interface EquifaxEmployer {
  employerName: string;
  employerCode: string | null;
  ein: string | null;
  hireDate: string | null;
  separationDate: string | null;
  status: string;
  jobTitle: string | null;
  payFrequency: string | null;
  basePay: number | null;
  payRate: string | null;
  totalCompensation: number | null;
  lastPayDate: string | null;
}

interface ExtractedData {
  reportDate: string | null;
  employeeName: string | null;
  employers: EquifaxEmployer[];
}

interface ComparisonField {
  field: string;
  label: string;
  equifaxValue: string | null;
  appValue: string | null;
  match: boolean;
}

interface ComparisonResult {
  status: "matched" | "discrepancy" | "missing-from-app" | "missing-from-report";
  equifaxRecord: EquifaxEmployer | null;
  workHistoryRecord: {
    id: string;
    company: string;
    title: string | null;
    ein: string | null;
    startDate: string | null;
    endDate: string | null;
    isActive: boolean;
    salaryAmount: number | null;
    salaryType: string | null;
    payRate: string | null;
    payFrequency: string | null;
    legalName: string | null;
  } | null;
  fields: ComparisonField[];
  matchScore: number;
}

interface ComparisonSummary {
  total: number;
  matched: number;
  discrepancies: number;
  missingFromApp: number;
  missingFromReport: number;
}

/* ── Step Components ── */

type Step = "upload" | "preview" | "compare" | "done";

const STATUS_CONFIG = {
  matched: { color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300", icon: CheckCircle2, label: "Verified Match" },
  discrepancy: { color: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300", icon: AlertTriangle, label: "Discrepancy" },
  "missing-from-app": { color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300", icon: Download, label: "Not in App" },
  "missing-from-report": { color: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400", icon: Info, label: "Not in Report" },
} as const;

export default function VerifyEmploymentPage() {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("upload");
  const [uploading, setUploading] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [comparisons, setComparisons] = useState<ComparisonResult[]>([]);
  const [summary, setSummary] = useState<ComparisonSummary | null>(null);
  const [selectedImports, setSelectedImports] = useState<Set<number>>(new Set());
  const [selectedUpdates, setSelectedUpdates] = useState<Set<number>>(new Set());
  const [expandedIdx, setExpandedIdx] = useState<Set<number>>(new Set());

  /* ── Upload ── */
  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      toast.error("Only PDF files are supported");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File too large (10MB max)");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/employment-report/upload", {
        method: "POST",
        body: formData,
      });
      const result = await res.json();

      if (!res.ok) throw new Error(result.error || "Upload failed");

      setExtractedData(result.data);
      setStep("preview");
      toast.success(`Extracted ${result.employerCount} employer record(s)`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    } finally {
      setUploading(false);
      if (e.target) e.target.value = "";
    }
  }, []);

  /* ── Compare ── */
  const handleCompare = useCallback(async () => {
    if (!extractedData) return;
    setComparing(true);
    try {
      const res = await fetch("/api/employment-report/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employers: extractedData.employers }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Comparison failed");

      setComparisons(result.comparisons);
      setSummary(result.summary);
      setStep("compare");

      // Auto-select all "missing-from-app" for import and "discrepancy" for update
      const imports = new Set<number>();
      const updates = new Set<number>();
      result.comparisons.forEach((c: ComparisonResult, i: number) => {
        if (c.status === "missing-from-app") imports.add(i);
        if (c.status === "discrepancy") updates.add(i);
      });
      setSelectedImports(imports);
      setSelectedUpdates(updates);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    } finally {
      setComparing(false);
    }
  }, [extractedData]);

  /* ── Import/Update ── */
  const handleImport = useCallback(async () => {
    const actions: { action: string; workHistoryId?: string; data: EquifaxEmployer }[] = [];

    selectedImports.forEach((idx) => {
      const c = comparisons[idx];
      if (c?.equifaxRecord) {
        actions.push({ action: "create", data: c.equifaxRecord });
      }
    });

    selectedUpdates.forEach((idx) => {
      const c = comparisons[idx];
      if (c?.equifaxRecord && c.workHistoryRecord) {
        actions.push({
          action: "update",
          workHistoryId: c.workHistoryRecord.id,
          data: c.equifaxRecord,
        });
      }
    });

    if (actions.length === 0) {
      toast.info("Nothing selected to import");
      return;
    }

    setImporting(true);
    try {
      const res = await fetch("/api/employment-report/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actions }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Import failed");

      toast.success(`${result.summary.succeeded} record(s) imported/updated successfully`);
      if (result.summary.failed > 0) {
        toast.warning(`${result.summary.failed} record(s) failed`);
      }

      queryClient.invalidateQueries({ queryKey: ["work-history"] });
      setStep("done");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    } finally {
      setImporting(false);
    }
  }, [comparisons, selectedImports, selectedUpdates, queryClient]);

  const toggleExpand = (idx: number) => {
    setExpandedIdx((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  /* ── Render ── */
  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/experience">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Verify Employment Data
          </h1>
          <p className="text-sm text-muted-foreground">
            Upload your Equifax Work Number report to verify and enrich your employment history
          </p>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center gap-2 text-sm">
        {(["upload", "preview", "compare", "done"] as Step[]).map((s, i) => {
          const labels = ["Upload PDF", "Review Extraction", "Compare & Import", "Complete"];
          const isActive = step === s;
          const isPast = ["upload", "preview", "compare", "done"].indexOf(step) > i;
          return (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && <div className={`w-8 h-px ${isPast ? "bg-primary" : "bg-border"}`} />}
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                isActive ? "bg-primary text-primary-foreground" :
                isPast ? "bg-primary/10 text-primary" :
                "bg-muted text-muted-foreground"
              }`}>
                {isPast && <CheckCircle2 className="h-3 w-3" />}
                <span>{labels[i]}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Step 1: Upload */}
      {step === "upload" && (
        <Card>
          <CardContent className="py-12">
            <div className="text-center space-y-4">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                <Upload className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Upload Employment Data Report</h2>
                <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                  Upload the PDF from Equifax&apos;s &quot;The Work Number&quot; platform. We&apos;ll extract your verified
                  employment history and compare it with your existing records.
                </p>
              </div>

              <Button disabled={uploading} onClick={() => document.getElementById("equifax-upload")?.click()}>
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Extracting data...
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4 mr-2" />
                    Choose PDF File
                  </>
                )}
              </Button>
              <input
                id="equifax-upload"
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={handleUpload}
                disabled={uploading}
              />

              <p className="text-xs text-muted-foreground">PDF up to 10MB • Data stays local, never stored on server</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Preview Extraction */}
      {step === "preview" && extractedData && (
        <div className="space-y-4">
          {/* Report Metadata */}
          {(extractedData.reportDate || extractedData.employeeName) && (
            <Card>
              <CardContent className="p-4 flex flex-wrap gap-4 text-sm">
                {extractedData.employeeName && (
                  <span className="flex items-center gap-1.5">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    <strong>Employee:</strong> {extractedData.employeeName}
                  </span>
                )}
                {extractedData.reportDate && (
                  <span className="flex items-center gap-1.5">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <strong>Report Date:</strong> {extractedData.reportDate}
                  </span>
                )}
                <Badge variant="outline">{extractedData.employers.length} employer(s) found</Badge>
              </CardContent>
            </Card>
          )}

          {/* Employer Cards */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Extracted Employers
            </h2>
            {extractedData.employers.map((emp, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 text-xs font-bold">
                        {emp.employerName.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="font-semibold">{emp.employerName}</h3>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground mt-1">
                          {emp.jobTitle && <span>{emp.jobTitle}</span>}
                          {emp.hireDate && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {emp.hireDate} — {emp.separationDate || "Present"}
                            </span>
                          )}
                          {emp.basePay != null && (
                            <span className="flex items-center gap-1">
                              <DollarSign className="h-3 w-3" />
                              ${emp.basePay.toLocaleString()}{emp.payRate === "hourly" ? "/hr" : "/yr"}
                            </span>
                          )}
                          {emp.ein && (
                            <span className="flex items-center gap-1">
                              <Building2 className="h-3 w-3" />
                              EIN: {emp.ein}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <Badge variant={emp.status === "active" ? "default" : "secondary"} className="text-xs shrink-0">
                      {emp.status}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => { setStep("upload"); setExtractedData(null); }}>
              Upload Different File
            </Button>
            <Button onClick={handleCompare} disabled={comparing}>
              {comparing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Comparing...
                </>
              ) : (
                "Compare with My Data"
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Comparison */}
      {step === "compare" && summary && (
        <div className="space-y-4">
          {/* Summary Cards */}
          <div className="grid gap-3 sm:grid-cols-4">
            <Card>
              <CardContent className="p-3 text-center">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 mx-auto mb-1" />
                <p className="text-2xl font-bold text-emerald-600">{summary.matched}</p>
                <p className="text-xs text-muted-foreground">Verified</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <AlertTriangle className="h-5 w-5 text-amber-600 mx-auto mb-1" />
                <p className="text-2xl font-bold text-amber-600">{summary.discrepancies}</p>
                <p className="text-xs text-muted-foreground">Discrepancies</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <Download className="h-5 w-5 text-blue-600 mx-auto mb-1" />
                <p className="text-2xl font-bold text-blue-600">{summary.missingFromApp}</p>
                <p className="text-xs text-muted-foreground">Can Import</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <Info className="h-5 w-5 text-slate-500 mx-auto mb-1" />
                <p className="text-2xl font-bold text-slate-500">{summary.missingFromReport}</p>
                <p className="text-xs text-muted-foreground">App Only</p>
              </CardContent>
            </Card>
          </div>

          {/* Overall Match Score */}
          {comparisons.filter(c => c.status === "matched" || c.status === "discrepancy").length > 0 && (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Overall Verification Score</span>
                  <span className="text-sm font-bold">
                    {Math.round(
                      comparisons
                        .filter(c => c.matchScore > 0)
                        .reduce((sum, c) => sum + c.matchScore, 0) /
                      Math.max(comparisons.filter(c => c.matchScore > 0).length, 1)
                    )}%
                  </span>
                </div>
                <Progress
                  value={
                    comparisons
                      .filter(c => c.matchScore > 0)
                      .reduce((sum, c) => sum + c.matchScore, 0) /
                    Math.max(comparisons.filter(c => c.matchScore > 0).length, 1)
                  }
                  className="h-2"
                />
              </CardContent>
            </Card>
          )}

          {/* Comparison Details */}
          <div className="space-y-3">
            {comparisons.map((comp, idx) => {
              const config = STATUS_CONFIG[comp.status];
              const StatusIcon = config.icon;
              const isExpanded = expandedIdx.has(idx);
              const name = comp.equifaxRecord?.employerName || comp.workHistoryRecord?.company || "Unknown";
              const isImportable = comp.status === "missing-from-app";
              const isUpdatable = comp.status === "discrepancy";

              return (
                <Card key={idx} className="overflow-hidden">
                  <div
                    className="p-4 flex items-center gap-3 cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => toggleExpand(idx)}
                  >
                    {/* Checkbox for actionable items */}
                    {isImportable && (
                      <Checkbox
                        checked={selectedImports.has(idx)}
                        onCheckedChange={(checked) => {
                          setSelectedImports((prev) => {
                            const next = new Set(prev);
                            if (checked) next.add(idx); else next.delete(idx);
                            return next;
                          });
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                    {isUpdatable && (
                      <Checkbox
                        checked={selectedUpdates.has(idx)}
                        onCheckedChange={(checked) => {
                          setSelectedUpdates((prev) => {
                            const next = new Set(prev);
                            if (checked) next.add(idx); else next.delete(idx);
                            return next;
                          });
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}

                    <Badge className={`${config.color} text-xs gap-1 shrink-0`}>
                      <StatusIcon className="h-3 w-3" />
                      {config.label}
                    </Badge>

                    <div className="flex-1 min-w-0">
                      <span className="font-medium truncate block">{name}</span>
                      {comp.equifaxRecord?.hireDate && (
                        <span className="text-xs text-muted-foreground">
                          {comp.equifaxRecord.hireDate} — {comp.equifaxRecord.separationDate || "Present"}
                        </span>
                      )}
                      {!comp.equifaxRecord && comp.workHistoryRecord?.startDate && (
                        <span className="text-xs text-muted-foreground">
                          {comp.workHistoryRecord.startDate} — {comp.workHistoryRecord.endDate || "Present"}
                        </span>
                      )}
                    </div>

                    {comp.matchScore > 0 && (
                      <span className="text-xs font-medium text-muted-foreground shrink-0">{comp.matchScore}%</span>
                    )}

                    {isExpanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                  </div>

                  {isExpanded && (
                    <div className="border-t px-4 pb-4 pt-3 space-y-3">
                      {/* Field comparison table */}
                      {comp.fields.length > 0 && (
                        <div className="rounded-md border overflow-hidden">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-muted/50 text-xs">
                                <th className="text-left px-3 py-2 font-medium">Field</th>
                                <th className="text-left px-3 py-2 font-medium">Equifax (Verified)</th>
                                <th className="text-left px-3 py-2 font-medium">Your Data</th>
                                <th className="text-center px-3 py-2 font-medium w-16">Match</th>
                              </tr>
                            </thead>
                            <tbody>
                              {comp.fields.map((f, fi) => (
                                <tr key={fi} className={`border-t ${!f.match ? "bg-amber-50/50 dark:bg-amber-950/20" : ""}`}>
                                  <td className="px-3 py-2 text-muted-foreground text-xs">{f.label}</td>
                                  <td className="px-3 py-2 font-medium">{f.equifaxValue || "—"}</td>
                                  <td className="px-3 py-2">{f.appValue || "—"}</td>
                                  <td className="px-3 py-2 text-center">
                                    {f.match ? (
                                      <CheckCircle2 className="h-4 w-4 text-emerald-600 mx-auto" />
                                    ) : (
                                      <XCircle className="h-4 w-4 text-amber-600 mx-auto" />
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Missing from app — show what would be imported */}
                      {comp.status === "missing-from-app" && comp.equifaxRecord && (
                        <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 p-3 text-sm space-y-1">
                          <p className="font-medium text-blue-700 dark:text-blue-300">
                            This employer is not in your work history. Select to import.
                          </p>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-blue-600 dark:text-blue-400">
                            {comp.equifaxRecord.jobTitle && <span>Title: {comp.equifaxRecord.jobTitle}</span>}
                            {comp.equifaxRecord.ein && <span>EIN: {comp.equifaxRecord.ein}</span>}
                            {comp.equifaxRecord.basePay != null && <span>Pay: ${comp.equifaxRecord.basePay.toLocaleString()}</span>}
                            {comp.equifaxRecord.payFrequency && <span>Frequency: {comp.equifaxRecord.payFrequency}</span>}
                          </div>
                        </div>
                      )}

                      {/* Missing from report */}
                      {comp.status === "missing-from-report" && comp.workHistoryRecord && (
                        <div className="rounded-md bg-slate-50 dark:bg-slate-900 p-3 text-sm">
                          <p className="text-muted-foreground">
                            This employer is in your app but not in the Equifax report. This may be because:
                          </p>
                          <ul className="text-xs text-muted-foreground mt-1 list-disc list-inside space-y-0.5">
                            <li>The employer doesn&apos;t report to The Work Number</li>
                            <li>You were a contractor (1099) rather than W-2 employee</li>
                            <li>The employment predates the report period</li>
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          <Separator />

          {/* Action Buttons */}
          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={() => { setStep("preview"); setComparisons([]); setSummary(null); }}>
              Back to Preview
            </Button>
            <div className="flex gap-3">
              <span className="text-sm text-muted-foreground self-center">
                {selectedImports.size + selectedUpdates.size} action(s) selected
              </span>
              <Button
                onClick={handleImport}
                disabled={importing || (selectedImports.size + selectedUpdates.size === 0)}
              >
                {importing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Import Selected ({selectedImports.size + selectedUpdates.size})
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Step 4: Done */}
      {step === "done" && (
        <Card>
          <CardContent className="py-12 text-center space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-900">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Employment Data Verified</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Your work history has been updated with verified Equifax data.
              </p>
            </div>
            <div className="flex gap-3 justify-center">
              <Link href="/experience">
                <Button>View Work History</Button>
              </Link>
              <Button
                variant="outline"
                onClick={() => {
                  setStep("upload");
                  setExtractedData(null);
                  setComparisons([]);
                  setSummary(null);
                  setSelectedImports(new Set());
                  setSelectedUpdates(new Set());
                }}
              >
                Upload Another Report
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
