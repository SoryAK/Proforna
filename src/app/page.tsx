"use client";

import Link from "next/link";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import {
  Briefcase,
  TrendingUp,
  Target,
  FileText,
  Shield,
  BarChart3,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const FEATURES = [
  {
    icon: Briefcase,
    title: "Job Applications",
    desc: "Track every application, offer, and interview in one place.",
  },
  {
    icon: TrendingUp,
    title: "Career Analytics",
    desc: "Visualize your income growth, skill progression, and career trajectory.",
  },
  {
    icon: Target,
    title: "Goal Tracking",
    desc: "Set career goals, milestones, and track your progress toward them.",
  },
  {
    icon: FileText,
    title: "Resume Builder",
    desc: "Create interactive resumes with analytics and shareable links.",
  },
  {
    icon: Shield,
    title: "Company Intel",
    desc: "Research companies using SEC, IRS, OSHA, and public data sources.",
  },
  {
    icon: BarChart3,
    title: "Financial Dashboard",
    desc: "Paycheck parsing, tax tracking, compensation analysis, and budgeting.",
  },
];

const HIGHLIGHTS = [
  "Multi-resume management with version control",
  "Interactive shareable portfolio & portal",
  "Paycheck parser with tax estimator",
  "Integrated email sync for application tracking",
  "Company intelligence from SEC, OSHA & IRS data",
  "Career path planning with direction scoring",
];

export default function LandingPage() {
  const { data: session, status } = useSession();

  if (status === "authenticated") {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      {/* Nav */}
      <header className="border-b border-gray-100 dark:border-gray-800">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <Image src="/logo-icon.png" alt="Resumsify" width={32} height={32} />
            <span className="text-xl font-bold text-gray-900 dark:text-white">
              Resum<span className="text-orange-500">sify</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm">
                Sign In
              </Button>
            </Link>
            <Link href="/login?tab=register">
              <Button size="sm" className="bg-orange-500 hover:bg-orange-600 text-white">
                Get Started
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 py-24 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-4 py-1.5 text-sm font-medium text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-300 mb-6">
          <CheckCircle2 className="h-4 w-4" />
          Free &amp; Open Source
        </div>
        <h1 className="text-5xl font-extrabold tracking-tight text-gray-900 dark:text-white sm:text-6xl">
          Your Career, In Your Hands
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-600 dark:text-gray-400">
          Resumsify is the all-in-one career management platform that puts you in
          control of your job search, finances, skills, and professional growth.
        </p>
        <div className="mt-10 flex items-center justify-center gap-4">
          <Link href="/login?tab=register">
            <Button size="lg" className="bg-orange-500 hover:bg-orange-600 text-white gap-2">
              Start For Free <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link href="/login">
            <Button size="lg" variant="outline">
              Sign In
            </Button>
          </Link>
        </div>
      </section>

      {/* Features Grid */}
      <section className="border-t border-gray-100 bg-gray-50 dark:border-gray-800 dark:bg-gray-900">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-center text-3xl font-bold text-gray-900 dark:text-white">
            Everything you need to manage your career
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-gray-600 dark:text-gray-400">
            From your first application to your annual review, Resumsify has you
            covered.
          </p>
          <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="group rounded-xl border border-gray-200 bg-white p-6 transition hover:border-orange-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-orange-700"
              >
                <div className="mb-4 inline-flex rounded-lg bg-orange-100 p-2.5 text-orange-600 dark:bg-orange-950 dark:text-orange-400">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {f.title}
                </h3>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Highlights */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
              Built for real professionals
            </h2>
            <p className="mt-3 text-gray-600 dark:text-gray-400">
              Resumsify goes beyond basic trackers with powerful tools that
              professionals actually need.
            </p>
            <ul className="mt-8 space-y-3">
              {HIGHLIGHTS.map((h) => (
                <li key={h} className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-orange-500" />
                  <span className="text-gray-700 dark:text-gray-300">{h}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-gradient-to-br from-orange-50 to-white p-8 dark:border-gray-700 dark:from-orange-950/30 dark:to-gray-900">
            <div className="space-y-4">
              <div className="h-4 w-3/4 rounded bg-orange-200/50 dark:bg-orange-800/30" />
              <div className="h-4 w-1/2 rounded bg-orange-200/40 dark:bg-orange-800/20" />
              <div className="h-20 w-full rounded-lg bg-orange-100/50 dark:bg-orange-900/20" />
              <div className="grid grid-cols-3 gap-3">
                <div className="h-16 rounded-lg bg-orange-200/40 dark:bg-orange-800/20" />
                <div className="h-16 rounded-lg bg-orange-200/40 dark:bg-orange-800/20" />
                <div className="h-16 rounded-lg bg-orange-200/40 dark:bg-orange-800/20" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-gray-100 bg-orange-500 dark:border-orange-800">
        <div className="mx-auto max-w-4xl px-6 py-16 text-center">
          <h2 className="text-3xl font-bold text-white">
            Ready to take control of your career?
          </h2>
          <p className="mt-3 text-orange-100">
            Join Resumsify and start tracking what matters most.
          </p>
          <Link href="/login?tab=register">
            <Button
              size="lg"
              className="mt-8 bg-white text-orange-600 hover:bg-orange-50"
            >
              Create Your Free Account
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 dark:border-gray-800">
        <div className="mx-auto max-w-6xl px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-500">
          &copy; {new Date().getFullYear()} Resumsify. Your Career, In Your
          Hands.
        </div>
      </footer>
    </div>
  );
}
