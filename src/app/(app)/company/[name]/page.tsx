"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CompanyDeepDive, type DeepDiveJob } from "@/components/company-deep-dive";
import { Loader2, Building2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function CompanyPage() {
  const params = useParams<{ name: string }>();
  const companyName = decodeURIComponent(params.name);

  // Fetch jobs for this company from the search cache or run fresh search
  const { data: jobs, isLoading } = useQuery<DeepDiveJob[]>({
    queryKey: ["company-page-jobs", companyName],
    queryFn: async () => {
      // Try Adzuna search for company
      const res = await fetch(`/api/jobs?what=${encodeURIComponent(companyName)}&where=&radius=50&page=1&source=adzuna`);
      if (!res.ok) return [];
      const data = await res.json();
      return (data.results ?? [])
        .filter((j: Record<string, unknown>) => {
          const co = (j.company as string || "").toLowerCase();
          return co.includes(companyName.toLowerCase()) || companyName.toLowerCase().includes(co);
        })
        .map((j: Record<string, unknown>) => ({
          id: j.id as string,
          title: j.title as string,
          company: (j.company as string) || companyName,
          location: j.location as string,
          lat: j.lat as number,
          lng: j.lng as number,
          salaryMin: j.salaryMin as number | null,
          salaryMax: j.salaryMax as number | null,
          created: j.created as string,
          source: "adzuna" as const,
          category: (j.category as string) || "",
          description: (j.description as string) || "",
        }));
    },
    staleTime: 10 * 60 * 1000,
  });

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="mb-4">
        <Link href="/job-search">
          <Button variant="ghost" size="sm" className="gap-1">
            <ArrowLeft className="h-4 w-4" /> Back to Search
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
          <p className="text-muted-foreground">Loading {companyName}…</p>
        </div>
      ) : (
        <CompanyDeepDive
          companyName={companyName}
          jobs={jobs ?? []}
          fullPage
        />
      )}
    </div>
  );
}
