"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import LearningTracker from "@/components/learning-tracker";

export default function ResearchPage() {
  const [tab, setTab] = useState("learning");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Research</h1>
        <p className="text-sm text-muted-foreground">
          Learning tracker, industry research, and tools exploration
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="learning">Learning</TabsTrigger>
        </TabsList>

        <TabsContent value="learning" className="mt-4">
          <LearningTracker />
        </TabsContent>
      </Tabs>
    </div>
  );
}
