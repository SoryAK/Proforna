"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import AnalyticsPage from "../analytics/page";
import ActivityPage from "../activity/page";

export default function InsightsPage() {
  const [tab, setTab] = useState("analytics");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Insights</h1>
        <p className="text-sm text-muted-foreground">Analytics and activity history</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="analytics" className="mt-4">
          <AnalyticsPage />
        </TabsContent>
        <TabsContent value="activity" className="mt-4">
          <ActivityPage />
        </TabsContent>
      </Tabs>
    </div>
  );
}
