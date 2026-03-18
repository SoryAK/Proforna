"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import ApplicationsPage from "../applications/page";
import ContactsPage from "../contacts/page";
import SubmissionsPage from "../submissions/page";
import EmailPage from "../email/page";

export default function JobSearchPage() {
  const [tab, setTab] = useState("applications");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Job Search</h1>
        <p className="text-sm text-muted-foreground">Applications, contacts, submissions, and email</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="applications">Applications</TabsTrigger>
          <TabsTrigger value="contacts">Contacts</TabsTrigger>
          <TabsTrigger value="submissions">Submissions</TabsTrigger>
          <TabsTrigger value="email">Email</TabsTrigger>
        </TabsList>

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
      </Tabs>
    </div>
  );
}
