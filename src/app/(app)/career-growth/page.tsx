"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import GoalsPage from "../goals/page";
import CareerModelPage from "../career-model/page";
import CareerDirectionModel from "@/components/career-direction-model";

export default function CareerGrowthPage() {
  const [tab, setTab] = useState("cdm");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Career Analytics</h1>
        <p className="text-sm text-muted-foreground">Direction model, goals, and income projections</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="cdm">Direction</TabsTrigger>
          <TabsTrigger value="goals">Goals</TabsTrigger>
          <TabsTrigger value="projections">Projections</TabsTrigger>
        </TabsList>

        <TabsContent value="cdm" className="mt-4">
          <CareerDirectionModel />
        </TabsContent>
        <TabsContent value="goals" className="mt-4">
          <GoalsPage />
        </TabsContent>
        <TabsContent value="projections" className="mt-4">
          <CareerModelPage />
        </TabsContent>
      </Tabs>
    </div>
  );
}
