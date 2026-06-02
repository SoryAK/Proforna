"use client";

import {
  Briefcase,
  Users,
  Zap,
  CalendarDays,
  MapPin,
  Building2,
  FileText,
  ExternalLink,
  Pencil,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  AVAILABILITY_LABELS,
  AVAILABILITY_COLORS,
  type AvailabilityStatus,
} from "@/lib/constants";
import type { DashboardData } from "./types";

interface ProfileBannerProps {
  profile: DashboardData["profile"];
  currentPosition: DashboardData["currentPosition"];
  stats: DashboardData["stats"];
  availability: AvailabilityStatus;
  displayName: string;
  headline: string;
  locationStr: string | null;
  initials: string;
  onEditClick: () => void;
}

export function ProfileBanner({
  profile,
  currentPosition,
  stats,
  availability,
  displayName,
  headline,
  locationStr,
  initials,
  onEditClick,
}: ProfileBannerProps) {
  return (
    <Card className="overflow-hidden pt-0">
      {/* Dark banner with orange tint */}
      <div className="relative h-48 sm:h-56 overflow-hidden">
        <div className="absolute inset-0 bg-slate-900" />
        <div className="absolute inset-0 bg-gradient-to-br from-orange-950/60 via-transparent to-transparent" />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          }}
        />
        <div className="absolute top-3 right-3 flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={onEditClick}
            className="bg-white/95 hover:bg-white shadow-md text-xs font-semibold gap-1.5 text-gray-800 border-white/60"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit Profile
          </Button>
        </div>
      </div>

      <CardContent className="relative px-6 pb-5 pt-0">
        {/* Avatar overlapping banner */}
        <div className="-mt-20 mb-3 flex items-end gap-5">
          <div className="relative">
            <div className="flex h-36 w-36 items-center justify-center rounded-full border-[3px] border-white bg-white shadow-lg ring-2 ring-black/5 overflow-hidden">
              {profile?.avatarUrl ? (
                <img
                  src={profile.avatarUrl}
                  alt={profile.fullName || "Profile"}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-4xl font-bold text-orange-600">{initials}</span>
              )}
            </div>
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2">
              <Badge
                className={cn(
                  AVAILABILITY_COLORS[availability],
                  "text-[10px] px-2 py-0.5 shadow-sm border border-white whitespace-nowrap"
                )}
              >
                {AVAILABILITY_LABELS[availability]}
              </Badge>
            </div>
          </div>
        </div>

        {/* Name + headline */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold leading-tight">{displayName}</h1>
            {headline !== displayName && (
              <p className="text-sm text-muted-foreground max-w-lg">{headline}</p>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground pt-0.5">
              {locationStr && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {locationStr}
                </span>
              )}
              {currentPosition && (
                <span className="flex items-center gap-1">
                  <Building2 className="h-3 w-3" /> {currentPosition.company}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Social links */}
        {(profile?.linkedinUrl || profile?.githubUrl || profile?.portfolioUrl || profile?.email) && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
            {profile?.email && (
              <a
                href={`mailto:${profile.email}`}
                className="text-xs text-orange-600 font-medium hover:underline flex items-center gap-1"
                title="Email"
              >
                <FileText className="h-3.5 w-3.5" /> {profile.email}
              </a>
            )}
            {profile?.linkedinUrl && (
              <a
                href={profile.linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-orange-600 font-medium hover:underline flex items-center gap-1"
                title="LinkedIn"
              >
                <ExternalLink className="h-3.5 w-3.5" />{" "}
                {profile.linkedinUrl.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
              </a>
            )}
            {profile?.githubUrl && (
              <a
                href={profile.githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-orange-600 font-medium hover:underline flex items-center gap-1"
                title="GitHub"
              >
                <ExternalLink className="h-3.5 w-3.5" />{" "}
                {profile.githubUrl.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
              </a>
            )}
            {profile?.portfolioUrl && (
              <a
                href={profile.portfolioUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-orange-600 font-medium hover:underline flex items-center gap-1"
                title="Portfolio"
              >
                <ExternalLink className="h-3.5 w-3.5" />{" "}
                {profile.portfolioUrl.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
              </a>
            )}
          </div>
        )}

        {/* Stats row */}
        <div className="my-3 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
        <div className="flex flex-wrap gap-3 text-sm">
          <Link
            href="/applications"
            className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 hover:bg-muted transition-colors"
          >
            <Briefcase className="h-4 w-4 text-orange-600" />
            <span className="font-semibold">{stats.totalApplications}</span>
            <span className="text-muted-foreground">Applications</span>
          </Link>
          <Link
            href="/contacts"
            className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 hover:bg-muted transition-colors"
          >
            <Users className="h-4 w-4 text-orange-600" />
            <span className="font-semibold">{stats.contacts}</span>
            <span className="text-muted-foreground">My Network</span>
          </Link>
          <Link
            href="/skills"
            className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 hover:bg-muted transition-colors"
          >
            <Zap className="h-4 w-4 text-orange-600" />
            <span className="font-semibold">{stats.skills}</span>
            <span className="text-muted-foreground">Skills</span>
          </Link>
          {stats.upcomingInterviews > 0 && (
            <Link
              href="/applications"
              className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 hover:bg-muted transition-colors"
            >
              <CalendarDays className="h-4 w-4 text-purple-600" />
              <span className="font-semibold">{stats.upcomingInterviews}</span>
              <span className="text-muted-foreground">Interviews</span>
            </Link>
          )}
        </div>

        {/* Preferred roles */}
        {profile?.preferredRoles && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {profile.preferredRoles.split(",").map((role) => (
              <Badge key={role.trim()} variant="secondary" className="text-xs px-2 py-0.5">
                {role.trim()}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
