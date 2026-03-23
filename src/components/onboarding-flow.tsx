"use client";

import { CheckCircle2, User, Briefcase, FileText, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface OnboardingFlowProps {
  hasProfile: boolean;
  hasPosition: boolean;
  hasResume: boolean;
  onProfileClick?: () => void;
}

export function OnboardingFlow({ hasProfile, hasPosition, hasResume, onProfileClick }: OnboardingFlowProps) {
  const steps = [
    {
      id: "profile",
      title: "Complete your profile",
      description: "Add your name, headline, and contact details to get started.",
      href: "/profile",
      isComplete: hasProfile,
      icon: User,
    },
    {
      id: "position",
      title: "Add your current position",
      description: "Log your current or most recent job to track compensation and work history.",
      href: "/current-position",
      isComplete: hasPosition,
      icon: Briefcase,
    },
    {
      id: "resume",
      title: "Create your first resume",
      description: "Start building your document or interactive resume version.",
      href: "/resumes",
      isComplete: hasResume,
      icon: FileText,
    }
  ];

  const completedCount = steps.filter((s) => s.isComplete).length;
  const totalCount = steps.length;
  const progress = (completedCount / totalCount) * 100;

  return (
    <Card className="border-orange-500/20 shadow-lg shadow-orange-500/5 mb-8">
      <CardHeader>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-2xl">Welcome to Resumsify!</CardTitle>
            <CardDescription className="text-base mt-2">
              You're just a few steps away from taking complete control of your career data.
              Let's get the basics set up.
            </CardDescription>
          </div>
          <div className="flex-shrink-0 w-32">
            <div className="flex justify-between items-end mb-1 text-sm">
              <span className="font-medium">{completedCount} of {totalCount}</span>
              <span className="text-muted-foreground">{Math.round(progress)}%</span>
            </div>
            <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
              <div 
                className="h-full bg-orange-500 transition-all duration-500 ease-in-out" 
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-3">
          {steps.map((step) => {
            const Icon = step.icon;
                        const content = (
              
                <div 
                  className={`relative p-5 h-full rounded-xl border transition-all duration-200 hover:shadow-md ${
                    step.isComplete 
                      ? "bg-green-50/50 border-green-200 dark:bg-green-950/20 dark:border-green-900" 
                      : "bg-background hover:bg-slate-50 dark:hover:bg-slate-900 border-border"
                  }`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className={`p-2 rounded-lg ${
                      step.isComplete
                        ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                        : "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300"
                    }`}>
                      {step.isComplete ? <CheckCircle2 className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                    </div>
                    {!step.isComplete && (
                      <ChevronRight className="w-4 h-4 text-muted-foreground opacity-50" />
                    )}
                  </div>
                  <h3 className={`font-semibold mb-1 ${step.isComplete ? "text-green-900 dark:text-green-300" : ""}`}>
                    {step.title}
                  </h3>
                  <p className="text-sm text-muted-foreground line-clamp-3">
                    {step.description}
                  </p>
                </div>
              
            );

            if (step.id === 'profile' && onProfileClick) {
              return (
                <button
                  key={step.id}
                  onClick={onProfileClick}
                  className="w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-xl block"
                >
                  {content}
                </button>
              );
            }

            return (
              <Link key={step.id} href={step.href} className="block">
                {content}
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

