"use client";

import { useState, useRef } from "react";
import {
  Download,
  Upload,
  FileJson,
  FileSpreadsheet,
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const EXPORT_TYPES = [
  { type: "full-json", label: "Full Backup (JSON)", icon: FileJson, description: "Complete export of all data" },
  { type: "applications", label: "Applications (CSV)", icon: FileSpreadsheet, description: "Job applications" },
  { type: "interviews", label: "Interviews (CSV)", icon: FileSpreadsheet, description: "Interview records" },
  { type: "contacts", label: "My Network (CSV)", icon: FileSpreadsheet, description: "Network contacts" },
  { type: "skills", label: "Skills (CSV)", icon: FileSpreadsheet, description: "Skills inventory" },
  { type: "goals", label: "Goals (CSV)", icon: FileSpreadsheet, description: "Career goals & milestones" },
];

interface ImportResult {
  imported?: Record<string, number>;
  error?: string;
}

export default function ImportExportPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [lastResult, setLastResult] = useState<ImportResult | null>(null);

  async function handleExport(type: string) {
    try {
      const res = await fetch(`/api/export?type=${type}`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") || "";
      const fnMatch = cd.match(/filename="(.+)"/);
      const filename = fnMatch?.[1] || `export-${type}.${type.includes("json") ? "json" : "csv"}`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${type}`);
    } catch {
      toast.error("Export failed");
    }
  }

  async function handleImport(file: File) {
    setImporting(true);
    setLastResult(null);
    try {
      const isJson = file.name.endsWith(".json");
      const format = isJson ? "json" : "csv";

      let res: Response;
      if (isJson) {
        const text = await file.text();
        res = await fetch(`/api/import?format=${format}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: text,
        });
      } else {
        const text = await file.text();
        res = await fetch(`/api/import?format=${format}`, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: text,
        });
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");

      setLastResult(data);
      toast.success("Import successful");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Import failed";
      setLastResult({ error: msg });
      toast.error(msg);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <ArrowDownToLine className="h-5 w-5 text-orange-600" />
          Import &amp; Export
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Back up your data, export to CSV, or import from files
        </p>
      </div>

      {/* Export section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Download className="h-5 w-5" />
            Export Data
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {EXPORT_TYPES.map((et) => {
              const Icon = et.icon;
              return (
                <Button
                  key={et.type}
                  variant="outline"
                  className="h-auto flex flex-col items-start gap-1 p-4 text-left"
                  onClick={() => handleExport(et.type)}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{et.label}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{et.description}</span>
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Import section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Upload className="h-5 w-5" />
            Import Data
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Import data from JSON (full backup) or CSV files. Supported CSV formats: applications
            (company, role, status columns) and contacts (name, email, relationship columns).
          </p>

          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImport(f);
              }}
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
            >
              <ArrowUpFromLine className="mr-2 h-4 w-4" />
              {importing ? "Importing…" : "Select File to Import"}
            </Button>
            <span className="text-xs text-muted-foreground">
              Accepts .json and .csv files
            </span>
          </div>

          {/* Import result */}
          {lastResult && (
            <div className={`rounded-lg border p-4 ${lastResult.error ? "border-red-200 bg-red-50 dark:bg-red-950 dark:border-red-800" : "border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800"}`}>
              {lastResult.error ? (
                <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-sm">{lastResult.error}</span>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                    <CheckCircle2 className="h-4 w-4" />
                    <span className="text-sm font-medium">Import successful</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(lastResult.imported || {}).map(([key, count]) => (
                      <Badge key={key} variant="secondary">
                        {count} {key}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
