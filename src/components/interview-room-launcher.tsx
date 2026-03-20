"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Video,
  Copy,
  Check,
  ExternalLink,
  Plus,
  FileText,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { toast } from "sonner";

interface InteractiveResume {
  id: string;
  slug: string;
  title: string;
  isPublished: boolean;
}

export function InterviewRoomLauncher() {
  const [open, setOpen] = useState(false);
  const [hostName, setHostName] = useState("");
  const [selectedResume, setSelectedResume] = useState<string>("none");
  const [creating, setCreating] = useState(false);
  const [createdRoomId, setCreatedRoomId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  // Fetch interactive resumes for the selector
  const { data: resumes } = useQuery<InteractiveResume[]>({
    queryKey: ["interactive-resumes"],
    queryFn: async () => {
      const res = await fetch("/api/interactive-resumes");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const publishedResumes = resumes?.filter((r) => r.isPublished) ?? [];

  async function handleCreate() {
    if (!hostName.trim()) return;
    setCreating(true);

    try {
      const body: Record<string, string | null> = {
        hostName: hostName.trim(),
        resumeSlug: selectedResume !== "none"
          ? publishedResumes.find((r) => r.id === selectedResume)?.slug ?? null
          : null,
      };

      const res = await fetch("/api/interview-room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error();
      const data = await res.json();
      setCreatedRoomId(data.roomId);
      toast.success("Interview room created!");
    } catch {
      toast.error("Failed to create room");
    } finally {
      setCreating(false);
    }
  }

  function copyLink() {
    if (!createdRoomId) return;
    const url = `${origin}/interview/${createdRoomId}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Link copied!");
    setTimeout(() => setCopied(false), 2000);
  }

  function openRoom() {
    if (!createdRoomId) return;
    window.open(`/interview/${createdRoomId}`, "_blank");
  }

  function resetDialog() {
    setCreatedRoomId(null);
    setHostName("");
    setSelectedResume("none");
    setCopied(false);
  }

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              <Video className="h-4 w-4 text-orange-600" />
              Interview Room
            </h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              Start a video call with screen sharing and your interactive resume
            </p>
          </div>

          <Dialog
            open={open}
            onOpenChange={(v) => {
              setOpen(v);
              if (!v) resetDialog();
            }}
          >
            <DialogTrigger
              render={
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-1" />
                  New Room
                </Button>
              }
            />
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Interview Room</DialogTitle>
                <DialogDescription>
                  Set up a video call room and share the link with your
                  interviewer.
                </DialogDescription>
              </DialogHeader>

              {!createdRoomId ? (
                <div className="space-y-4 pt-2">
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">
                      Your name
                    </label>
                    <Input
                      placeholder="e.g. Sory Kaba"
                      value={hostName}
                      onChange={(e) => setHostName(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-1.5 block">
                      Attach interactive resume{" "}
                      <span className="text-muted-foreground font-normal">
                        (optional)
                      </span>
                    </label>
                    <Select
                      value={selectedResume}
                      onValueChange={(v) => setSelectedResume(v ?? "none")}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="No resume" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No resume</SelectItem>
                        {publishedResumes.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            <div className="flex items-center gap-2">
                              <FileText className="h-3.5 w-3.5" />
                              {r.title}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {publishedResumes.length === 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        No published interactive resumes. Create one in the
                        Resumes page.
                      </p>
                    )}
                  </div>

                  <Button
                    className="w-full"
                    onClick={handleCreate}
                    disabled={creating || !hostName.trim()}
                  >
                    {creating ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Video className="h-4 w-4 mr-2" />
                    )}
                    Create Room
                  </Button>
                </div>
              ) : (
                <div className="space-y-4 pt-2">
                  <div className="text-center">
                    <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 mb-2">
                      Room Ready
                    </Badge>
                    <p className="text-sm text-muted-foreground">
                      Share this link with your interviewer
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Input
                      readOnly
                      value={`${origin}/interview/${createdRoomId}`}
                      className="text-xs"
                    />
                    <Button variant="outline" size="icon" onClick={copyLink}>
                      {copied ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>

                  <div className="flex gap-2">
                    <Button className="flex-1" onClick={openRoom}>
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Join Room
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={resetDialog}
                    >
                      Create Another
                    </Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
}
