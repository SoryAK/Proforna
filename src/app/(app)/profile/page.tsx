"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import ExperiencePage from "../experience/page";
import SkillsPage from "../skills/page";
import ResumesPage from "../resumes/page";

export default function ProfilePage() {
  const [tab, setTab] = useState("experience");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Profile</h1>
        <p className="text-sm text-muted-foreground">Your experience, skills, and resumes</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="experience">Experience</TabsTrigger>
          <TabsTrigger value="skills">Skills</TabsTrigger>
          <TabsTrigger value="resumes">Resumes</TabsTrigger>
        </TabsList>

        <TabsContent value="experience" className="mt-4">
          <ExperiencePage />
        </TabsContent>
        <TabsContent value="skills" className="mt-4">
          <SkillsPage />
        </TabsContent>
        <TabsContent value="resumes" className="mt-4">
          <ResumesPage />
        </TabsContent>
      </Tabs>
    </div>
  );
}
