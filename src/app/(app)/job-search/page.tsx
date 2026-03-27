"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { JobMap } from "@/components/job-map";
import { JobBoard } from "@/components/job-board";
import { JobInterestGroups } from "@/components/job-interest-groups";
import { InterviewRoomLauncher } from "@/components/interview-room-launcher";
import ApplicationsPage from "../applications/page";
import ContactsPage from "../contacts/page";
import SubmissionsPage from "../submissions/page";
import EmailPage from "../email/page";

export default function JobSearchPage() {
  const [tab, setTab] = useState("discover");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Job Search</h1>
        <p className="text-sm text-muted-foreground">Discover openings, track applications, manage contacts, and more</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="discover">Discover</TabsTrigger>
          <TabsTrigger value="board">Job Board</TabsTrigger>
          <TabsTrigger value="interests">Interests</TabsTrigger>
          <TabsTrigger value="applications">Applications</TabsTrigger>
          <TabsTrigger value="contacts">Contacts</TabsTrigger>
          <TabsTrigger value="submissions">Submissions</TabsTrigger>
          <TabsTrigger value="email">Email</TabsTrigger>
          <TabsTrigger value="interviews">Interviews</TabsTrigger>
        </TabsList>

        <TabsContent value="discover" className="mt-4">
          <JobMap />
        </TabsContent>
        <TabsContent value="board" className="mt-4">
          <JobBoard />
        </TabsContent>
        <TabsContent value="interests" className="mt-4">
          <JobInterestGroups />
        </TabsContent>
        <TabsContent value="applications" className="mt-4">
          <ApplicationsPage />
        </TabsContent>
        <TabsContent value="contacts" className="mt-4">
          <ContactsPage />
        </TabsContent>
        <TabsContent value="submissions" className="mt-4">
          <SubmissionsPage />
        </TabsContent>
        <TabsContent value="email" className="mt-4">
          <EmailPage />
        </TabsContent>
        <TabsContent value="interviews" className="mt-4">
          <InterviewRoomLauncher />
        </TabsContent>
      </Tabs>
    </div>
  );
}
