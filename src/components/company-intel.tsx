"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Building2,
  Shield,
  FileText,
  Users,
  AlertTriangle,
  RefreshCw,
  Loader2,
  Globe,
  DollarSign,
  CheckCircle2,
  XCircle,
  Landmark,
  ExternalLink,
  UserCheck,
  Save,
  StickyNote,
} from "lucide-react";

interface CompanyIntelProps {
  ein: string;
  companyName: string;
  legalName?: string;
  location?: string;
}

interface SourceStatus {
  dol: "found" | "not_found" | "error";
  sec: "found" | "not_found" | "error";
  osha: "found" | "not_found" | "error";
  opencorporates: "found" | "not_found" | "error";
}

interface ResearchData {
  ein: string | null;
  name: string | null;
  address: string | null;
  industry: string | null;
  isPublic: boolean;
  secCIK: string | null;
  employeeCount: number | null;
  form5500Data: {
    filings: Array<{
      planName: string | null;
      sponsorName: string | null;
      planYear: string | null;
      participantCount: number | null;
      totalAssets: number | null;
      planType: string | null;
    }>;
    summary: {
      planCount: number;
      latestPlanName: string | null;
      sponsorName: string | null;
      estimatedEmployees: number | null;
    };
  } | null;
  secData: {
    cik: string | null;
    ticker: string | null;
    companyName: string | null;
    isPublic: boolean;
    sicDescription?: string;
    stateOfIncorporation?: string;
  } | null;
  oshaData: {
    inspections: Array<{
      activityNumber: string | null;
      establishmentName: string | null;
      site: string | null;
      city: string | null;
      state: string | null;
      openDate: string | null;
      closeDate: string | null;
      inspectionType: string | null;
      violations: number | null;
      totalPenalty: number | null;
    }>;
    summary: {
      inspectionCount: number;
      totalViolations: number;
      totalPenalties: number;
      latestInspection: string | null;
    };
  } | null;
  sosData: {
    legalName: string | null;
    companyNumber: string | null;
    jurisdiction: string | null;
    jurisdictionCode: string | null;
    status: string | null;
    incorporationDate: string | null;
    dissolutionDate: string | null;
    companyType: string | null;
    registeredAddress: string | null;
    registryUrl: string | null;
    parentCompany: string | null;
    officers: Array<{
      name: string;
      position: string;
      startDate: string | null;
      endDate: string | null;
    }>;
  } | null;
  researchNotes: string | null;
  _cached: boolean;
  _sources: SourceStatus;
}

export function CompanyIntel({ ein, companyName, legalName, location }: CompanyIntelProps) {
  const [refreshing, setRefreshing] = useState(false);
  const [notes, setNotes] = useState("");
  const [notesSaved, setNotesSaved] = useState(true);
  const [savingNotes, setSavingNotes] = useState(false);

  const { data, isLoading, refetch } = useQuery<ResearchData>({
    queryKey: ["company-intel", ein],
    queryFn: async () => {
      const res = await fetch("/api/company-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ein, companyName, legalName, location }),
      });
      if (!res.ok) throw new Error("Research failed");
      const result = await res.json();
      setNotes(result.researchNotes || "");
      setNotesSaved(true);
      return result;
    },
    staleTime: 30 * 60 * 1000, // 30 minutes
  });

  const { data: w2Records = [] } = useQuery<Array<{
    id: string;
    taxYear: number;
    employerName: string | null;
    wages: number | null;
    federalTaxWithheld: number | null;
    netIncome: number | null;
  }>>({
    queryKey: ["w2-by-ein", ein],
    queryFn: async () => {
      const res = await fetch(`/api/w2-records?ein=${encodeURIComponent(ein)}`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/company-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ein, companyName, legalName, location, forceRefresh: true }),
      });
      if (!res.ok) throw new Error("Refresh failed");
      await refetch();
      toast.success("Company data refreshed");
    } catch {
      toast.error("Failed to refresh data");
    } finally {
      setRefreshing(false);
    }
  };

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    try {
      const res = await fetch("/api/company-research", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ein, researchNotes: notes }),
      });
      if (!res.ok) throw new Error("Save failed");
      setNotesSaved(true);
      toast.success("Research notes saved");
    } catch {
      toast.error("Failed to save notes");
    } finally {
      setSavingNotes(false);
    }
  };

  const SourceBadge = ({ source, status }: { source: string; status: string }) => {
    if (status === "found") return <Badge className="bg-emerald-100 text-emerald-700 text-xs">{source} ✓</Badge>;
    if (status === "error") return <Badge variant="destructive" className="text-xs">{source} ✗</Badge>;
    return <Badge variant="outline" className="text-xs text-muted-foreground">{source} —</Badge>;
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Building2 className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-muted-foreground">No company intelligence data available.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={handleRefresh}>
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Fetch Data
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Company Intelligence
          </h3>
          <p className="text-sm text-muted-foreground">
            EIN: <span className="font-mono">{ein}</span>
            {data._cached && <span className="ml-2 text-xs">(cached)</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data._sources && (
            <div className="flex gap-1">
              <SourceBadge source="DOL" status={data._sources.dol} />
              <SourceBadge source="SEC" status={data._sources.sec} />
              <SourceBadge source="OSHA" status={data._sources.osha} />
              <SourceBadge source="SOS" status={data._sources.opencorporates} />
            </div>
          )}
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Globe className="h-4 w-4" />
              Company Type
            </div>
            <div className="flex items-center gap-2">
              {data.isPublic ? (
                <Badge className="bg-blue-100 text-blue-700">Public</Badge>
              ) : (
                <Badge variant="outline">Private</Badge>
              )}
              {data.secData?.ticker && (
                <span className="font-mono font-bold text-lg">${data.secData.ticker}</span>
              )}
            </div>
            {data.sosData?.parentCompany && (
              <p className="text-sm mt-2">
                <span className="text-muted-foreground">Parent: </span>
                <span className="font-medium">{data.sosData.parentCompany}</span>
              </p>
            )}
            {data.industry && (
              <p className="text-sm text-muted-foreground mt-1">{data.industry}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Users className="h-4 w-4" />
              Employee Estimate
            </div>
            <p className="text-2xl font-bold">
              {data.employeeCount
                ? data.employeeCount.toLocaleString()
                : "—"}
            </p>
            <p className="text-xs text-muted-foreground">from benefit plan participants</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Shield className="h-4 w-4" />
              Safety Record
            </div>
            {data.oshaData?.summary ? (
              <>
                <p className="text-2xl font-bold">
                  {data.oshaData.summary.totalViolations}{" "}
                  <span className="text-sm font-normal text-muted-foreground">violations</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {data.oshaData.summary.inspectionCount} inspections •{" "}
                  {data.oshaData.summary.totalPenalties > 0
                    ? `$${data.oshaData.summary.totalPenalties.toLocaleString()} penalties`
                    : "no penalties"}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No OSHA data</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Corporate Structure */}
      {(data.secData || data.sosData) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Corporate Structure
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="text-sm">
                <span className="text-muted-foreground">Company Status</span>
                <p className="font-medium flex items-center gap-2 mt-0.5">
                  {data.isPublic ? (
                    <Badge className="bg-blue-100 text-blue-700">Publicly Traded</Badge>
                  ) : (
                    <Badge variant="outline">Private</Badge>
                  )}
                  {data.secData?.ticker && (
                    <span className="font-mono font-bold">${data.secData.ticker}</span>
                  )}
                </p>
              </div>
              {data.sosData?.parentCompany && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Parent Company</span>
                  <p className="font-medium mt-0.5">{data.sosData.parentCompany}</p>
                </div>
              )}
              {data.sosData?.companyType && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Entity Type</span>
                  <p className="font-medium mt-0.5">{data.sosData.companyType}</p>
                </div>
              )}
              {data.secData?.stateOfIncorporation && (
                <div className="text-sm">
                  <span className="text-muted-foreground">State of Incorporation</span>
                  <p className="font-medium mt-0.5">{data.secData.stateOfIncorporation}</p>
                </div>
              )}
              {data.industry && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Industry (SIC)</span>
                  <p className="font-medium mt-0.5">{data.industry}</p>
                </div>
              )}
              {data.secData?.cik && (
                <div className="text-sm">
                  <span className="text-muted-foreground">SEC CIK</span>
                  <p className="font-mono text-sm mt-0.5">{data.secData.cik}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* DOL Form 5500 Section */}
      {data.form5500Data && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              DOL Form 5500 — Employee Benefit Plans
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.form5500Data.filings.map((f, i) => (
                <div key={i} className="rounded-lg border p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{f.planName || "Unnamed Plan"}</span>
                    {f.planYear && <Badge variant="outline" className="text-xs">{f.planYear}</Badge>}
                  </div>
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    {f.participantCount != null && (
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {f.participantCount.toLocaleString()} participants
                      </span>
                    )}
                    {f.totalAssets != null && (
                      <span className="flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        ${Number(f.totalAssets).toLocaleString()} assets
                      </span>
                    )}
                    {f.planType && <span>{f.planType}</span>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* OSHA Section */}
      {data.oshaData && data.oshaData.inspections.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4" />
              OSHA Inspections
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.oshaData.inspections.map((insp, i) => (
                <div key={i} className="rounded-lg border p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{insp.establishmentName || "Inspection"}</span>
                    {insp.openDate && <span className="text-xs text-muted-foreground">{insp.openDate}</span>}
                  </div>
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    {insp.city && insp.state && (
                      <span>{insp.city}, {insp.state}</span>
                    )}
                    {insp.violations != null && insp.violations > 0 && (
                      <span className="flex items-center gap-1 text-amber-600">
                        <AlertTriangle className="h-3 w-3" />
                        {insp.violations} violations
                      </span>
                    )}
                    {insp.totalPenalty != null && insp.totalPenalty > 0 && (
                      <span className="text-red-600">
                        ${insp.totalPenalty.toLocaleString()} penalty
                      </span>
                    )}
                    {(insp.violations === 0 || insp.violations == null) && (
                      <span className="flex items-center gap-1 text-emerald-600">
                        <CheckCircle2 className="h-3 w-3" />
                        Clean
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Linked W-2 Records */}
      {w2Records.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Linked W-2 Records
              <Badge variant="outline" className="text-xs ml-auto">{w2Records.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {w2Records.map((w2) => (
                <div key={w2.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <span className="font-medium text-sm">{w2.taxYear}</span>
                    {w2.employerName && (
                      <span className="text-xs text-muted-foreground ml-2">{w2.employerName}</span>
                    )}
                  </div>
                  <div className="text-right">
                    {w2.wages != null && (
                      <span className="font-mono text-sm font-medium">
                        ${w2.wages.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </span>
                    )}
                    {w2.federalTaxWithheld != null && (
                      <span className="text-xs text-muted-foreground ml-2">
                        (fed tax: ${w2.federalTaxWithheld.toLocaleString(undefined, { maximumFractionDigits: 0 })})
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* OpenCorporates / Secretary of State Section */}
      {data.sosData && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Landmark className="h-4 w-4" />
              State Registration (Secretary of State)
              {data.sosData.jurisdiction && (
                <Badge variant="outline" className="text-xs ml-1">{data.sosData.jurisdiction}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                {data.sosData.legalName && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Legal Name</span>
                    <p className="font-medium">{data.sosData.legalName}</p>
                  </div>
                )}
                {data.sosData.status && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Status</span>
                    <p className="font-medium flex items-center gap-1">
                      {data.sosData.status.toLowerCase().includes("active") ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-red-500" />
                      )}
                      {data.sosData.status}
                    </p>
                  </div>
                )}
                {data.sosData.companyType && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Entity Type</span>
                    <p className="font-medium">{data.sosData.companyType}</p>
                  </div>
                )}
                {data.sosData.incorporationDate && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Incorporated</span>
                    <p className="font-medium">{data.sosData.incorporationDate}</p>
                  </div>
                )}
                {data.sosData.companyNumber && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Registration #</span>
                    <p className="font-medium font-mono">{data.sosData.companyNumber}</p>
                  </div>
                )}
                {data.sosData.registeredAddress && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Registered Address</span>
                    <p className="font-medium">{data.sosData.registeredAddress}</p>
                  </div>
                )}
              </div>

              {data.sosData.registryUrl && (
                <a
                  href={data.sosData.registryUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  View on state registry
                </a>
              )}

              {data.sosData.officers.length > 0 && (
                <>
                  <Separator />
                  <p className="text-sm font-semibold flex items-center gap-1">
                    <UserCheck className="h-3.5 w-3.5" />
                    Officers & Directors
                  </p>
                  <div className="space-y-2">
                    {data.sosData.officers.map((officer, i) => (
                      <div key={i} className="flex items-center justify-between rounded-lg border p-3">
                        <div>
                          <span className="font-medium text-sm">{officer.name}</span>
                          <span className="text-xs text-muted-foreground ml-2">{officer.position}</span>
                        </div>
                        {officer.startDate && (
                          <span className="text-xs text-muted-foreground">since {officer.startDate}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* State Resources Quick Links */}
      {location && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="h-4 w-4" />
              State Resources
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">
              Quick links to state-level databases based on position location ({location})
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                {
                  label: "Secretary of State Business Search",
                  query: `${location} Secretary of State business search`,
                  icon: Landmark,
                },
                {
                  label: "Contractor License Lookup",
                  query: `${location} contractor license board lookup`,
                  icon: FileText,
                },
                {
                  label: "State Dept. of Labor",
                  query: `${location} Department of Labor enforcement database`,
                  icon: Shield,
                },
                {
                  label: "County Property / Tax Collector",
                  query: `${location} county tax collector tangible personal property`,
                  icon: DollarSign,
                },
              ].map(({ label, query, icon: Icon }) => (
                <a
                  key={label}
                  href={`https://www.google.com/search?q=${encodeURIComponent(query)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-lg border p-3 text-sm hover:bg-muted/50 transition-colors"
                >
                  <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span>{label}</span>
                  <ExternalLink className="h-3 w-3 text-muted-foreground ml-auto shrink-0" />
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Research Notes — persisted to CompanyProfile */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <StickyNote className="h-4 w-4" />
            Research Notes
            {!notesSaved && (
              <Badge variant="outline" className="text-xs text-amber-600 ml-auto">unsaved</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-2">
            Save findings from state resources, licensing boards, or other manual research here. Notes persist across sessions.
          </p>
          <Textarea
            placeholder="e.g. Checked IL SOS — Active LLC since 2008. Licensed electrical contractor (License #EC-12345). Annual report lists John Doe as CEO..."
            value={notes}
            onChange={(e) => { setNotes(e.target.value); setNotesSaved(false); }}
            rows={4}
            className="mb-2"
          />
          <Button
            size="sm"
            onClick={handleSaveNotes}
            disabled={notesSaved || savingNotes}
          >
            {savingNotes ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <Save className="h-4 w-4 mr-1" />
            )}
            {notesSaved ? "Saved" : "Save Notes"}
          </Button>
        </CardContent>
      </Card>

      {/* No data at all */}
      {!data.form5500Data && !data.secData && !data.oshaData && !data.sosData && (
        <Card>
          <CardContent className="py-8 text-center">
            <XCircle className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
            <p className="text-muted-foreground">
              No public records found for this EIN. The employer may be a small business
              or use a different identifier in public filings.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
