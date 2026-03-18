"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import LearningTracker from "@/components/learning-tracker";
import IndustryResearch from "@/components/industry-research";
import JobMarketResearch from "@/components/job-market-research";

export default function ResearchPage() {
  const [tab, setTab] = useState("learning");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Research</h1>
        <p className="text-sm text-muted-foreground">
          Learning tracker, industry news, and job market data
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="learning">Learning</TabsTrigger>
          <TabsTrigger value="industry">Industry News</TabsTrigger>
          <TabsTrigger value="market">Job Market</TabsTrigger>
        </TabsList>

        <TabsContent value="learning" className="mt-4">
          <LearningTracker />
        </TabsContent>
        <TabsContent value="industry" className="mt-4">
          <IndustryResearch />
        </TabsContent>
        <TabsContent value="market" className="mt-4">
          <JobMarketResearch />
        </TabsContent>
      </Tabs>
    </div>
  );
}
