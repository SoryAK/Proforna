"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import LearningTracker from "@/components/learning-tracker";
import IndustryResearch from "@/components/industry-research";
import JobMarketResearch from "@/components/job-market-research";
import CompanyNews from "@/components/company-news";
import ScholarSearch from "@/components/scholar-search";

export default function ResearchPage() {
  const [tab, setTab] = useState("learning");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Research</h1>
        <p className="text-sm text-muted-foreground">
          Learning tracker, industry news, academic research, and job market data
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="learning">Learning</TabsTrigger>
          <TabsTrigger value="industry">RSS Feeds</TabsTrigger>
          <TabsTrigger value="news">Company News</TabsTrigger>
          <TabsTrigger value="scholar">Scholar</TabsTrigger>
          <TabsTrigger value="market">Job Market</TabsTrigger>
        </TabsList>

        <TabsContent value="learning" className="mt-4">
          <LearningTracker />
        </TabsContent>
        <TabsContent value="industry" className="mt-4">
          <IndustryResearch />
        </TabsContent>
        <TabsContent value="news" className="mt-4">
          <CompanyNews />
        </TabsContent>
        <TabsContent value="scholar" className="mt-4">
          <ScholarSearch />
        </TabsContent>
        <TabsContent value="market" className="mt-4">
          <JobMarketResearch />
        </TabsContent>
      </Tabs>
    </div>
  );
}
