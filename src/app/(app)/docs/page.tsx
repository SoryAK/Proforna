"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import DocumentsPage from "../documents/page";
import ImportExportPage from "../import-export/page";

export default function DocumentsHubPage() {
  const [tab, setTab] = useState("documents");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Documents</h1>
        <p className="text-sm text-muted-foreground">Files, W-2s, and data import/export</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="import-export">Import / Export</TabsTrigger>
        </TabsList>

        <TabsContent value="documents" className="mt-4">
          <DocumentsPage />
        </TabsContent>
        <TabsContent value="import-export" className="mt-4">
          <ImportExportPage />
        </TabsContent>
      </Tabs>
    </div>
  );
}
