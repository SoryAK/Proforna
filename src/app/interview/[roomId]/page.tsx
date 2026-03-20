"use client";

import { useEffect, useState, use } from "react";
import { v4 as uuid } from "uuid";
import {
  Video,
  Copy,
  Check,
  FileText,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { VideoCall } from "@/components/video-call";
import { InteractiveResumeSidebar } from "@/components/interview-resume-sidebar";
import { toast } from "sonner";

interface RoomInfo {
  id: string;
  hostName: string;
  resumeSlug: string | null;
  peerCount: number;
  createdAt: number;
}

export default function InterviewRoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = use(params);
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [joined, setJoined] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [peerId] = useState(() => uuid().slice(0, 12));
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const [left, setLeft] = useState(false);

  useEffect(() => {
    fetch(`/api/interview-room?roomId=${roomId}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(setRoom)
      .catch(() => setNotFound(true));
  }, [roomId]);

  function copyLink() {
    const url = `${window.location.origin}/interview/${roomId}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Interview link copied!");
    setTimeout(() => setCopied(false), 2000);
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Video className="h-12 w-12 mx-auto mb-3 opacity-30 text-muted-foreground" />
          <h1 className="text-xl font-bold mb-1">Room Not Found</h1>
          <p className="text-muted-foreground text-sm">
            This interview room may have expired or doesn&apos;t exist.
          </p>
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading room...</div>
      </div>
    );
  }

  if (left) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Video className="h-12 w-12 mx-auto mb-3 opacity-30 text-muted-foreground" />
          <h1 className="text-xl font-bold mb-1">Call Ended</h1>
          <p className="text-muted-foreground text-sm mb-4">
            You&apos;ve left the interview room.
          </p>
          <Button onClick={() => { setLeft(false); setJoined(false); }}>
            Rejoin
          </Button>
        </div>
      </div>
    );
  }

  // Pre-join lobby
  if (!joined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 space-y-4">
            <div className="text-center">
              <Video className="h-10 w-10 mx-auto mb-2 text-orange-600" />
              <h1 className="text-xl font-bold">Interview Room</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Hosted by <span className="font-medium text-foreground">{room.hostName}</span>
              </p>
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">
                Your display name
              </label>
              <Input
                placeholder="Enter your name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>

            <Button
              className="w-full"
              onClick={() => setJoined(true)}
              disabled={!displayName.trim()}
            >
              <Video className="h-4 w-4 mr-2" />
              Join Interview
            </Button>

            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={`${typeof window !== "undefined" ? window.location.origin : ""}/interview/${roomId}`}
                className="text-xs"
              />
              <Button variant="outline" size="icon" onClick={copyLink}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Active call with optional resume sidebar
  const hasResume = !!room.resumeSlug;

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <Video className="h-4 w-4 text-orange-600" />
          <span className="text-sm font-medium">
            Interview with {room.hostName}
          </span>
          <span className="text-xs text-muted-foreground">
            · Room {roomId}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={copyLink}>
            {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
            Share
          </Button>
          {hasResume && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? (
                <PanelRightClose className="h-4 w-4 mr-1" />
              ) : (
                <PanelRightOpen className="h-4 w-4 mr-1" />
              )}
              <FileText className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex min-h-0">
        {/* Video area */}
        <div className={`flex-1 p-3 ${hasResume && sidebarOpen ? "pr-0" : ""}`}>
          <VideoCall
            roomId={roomId}
            peerId={peerId}
            onLeave={() => setLeft(true)}
          />
        </div>

        {/* Resume sidebar */}
        {hasResume && sidebarOpen && (
          <div className="w-80 border-l border-border bg-card shrink-0">
            <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
              <FileText className="h-4 w-4 text-orange-600" />
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Candidate Resume
              </span>
            </div>
            <InteractiveResumeSidebar slug={room.resumeSlug!} />
          </div>
        )}
      </div>
    </div>
  );
}
