"use client";

import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  BookOpen,
  MessageSquare,
  ClipboardCheck,
  Star,
} from "lucide-react";

interface Interview {
  id: string;
  type: string;
  scheduledAt: string;
  durationMinutes: number | null;
  location?: string | null;
  interviewerName?: string | null;
  interviewerRole?: string | null;
  notes?: string | null;
  status: string;
  rating?: number | null;
  prepNotes?: string | null;
  questions?: string | null;
  reflection?: string | null;
  reflectionRating?: number | null;
}

const COMMON_QUESTIONS: Record<string, string[]> = {
  phone: [
    "Tell me about yourself and your background.",
    "Why are you interested in this role?",
    "What do you know about our company?",
    "What are your salary expectations?",
    "When can you start?",
    "What are you looking for in your next role?",
  ],
  technical: [
    "Walk me through a recent technical project.",
    "How do you approach debugging a production issue?",
    "Explain your understanding of [key technology].",
    "Describe your experience with system design.",
    "How do you handle code reviews?",
    "What testing strategies do you use?",
  ],
  behavioral: [
    "Tell me about a time you dealt with conflict on a team.",
    "Describe a situation where you had to meet a tight deadline.",
    "How do you prioritize competing tasks?",
    "Tell me about a time you failed and what you learned.",
    "How do you handle feedback or criticism?",
    "Describe a time you went above and beyond.",
  ],
  onsite: [
    "What interests you most about this position?",
    "Where do you see yourself in 5 years?",
    "How do you collaborate with cross-functional teams?",
    "What questions do you have about the team and culture?",
    "Describe your ideal work environment.",
    "What makes you the right fit for this role?",
  ],
  panel: [
    "How do you handle working with multiple stakeholders?",
    "Tell us about a project you led from start to finish.",
    "How do you ensure alignment across teams?",
    "What's your approach to mentoring junior developers?",
    "How do you stay current with industry trends?",
    "Describe a time you influenced a decision without authority.",
  ],
};

export function InterviewPrepDialog({
  interview,
  company,
  role,
  open,
  onOpenChange,
}: {
  interview: Interview;
  company: string;
  role: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<string>("prep");
  const [prepNotes, setPrepNotes] = useState(interview.prepNotes || "");
  const [questions, setQuestions] = useState<string[]>([]);
  const [reflection, setReflection] = useState(interview.reflection || "");
  const [reflectionRating, setReflectionRating] = useState(
    interview.reflectionRating || 0
  );

  useEffect(() => {
    setPrepNotes(interview.prepNotes || "");
    setReflection(interview.reflection || "");
    setReflectionRating(interview.reflectionRating || 0);
    try {
      const parsed = JSON.parse(interview.questions || "[]");
      setQuestions(Array.isArray(parsed) ? parsed : []);
    } catch {
      setQuestions([]);
    }
  }, [interview]);

  const saveMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await fetch(`/api/interviews/${interview.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      toast.success("Interview prep saved");
    },
    onError: () => toast.error("Failed to save"),
  });

  function handleSave() {
    saveMutation.mutate({
      prepNotes: prepNotes || null,
      questions: questions.length ? JSON.stringify(questions) : null,
      reflection: reflection || null,
      reflectionRating: reflectionRating || null,
    });
  }

  function addSuggestedQuestions() {
    const suggested = COMMON_QUESTIONS[interview.type] || COMMON_QUESTIONS.phone;
    const existing = new Set(questions);
    const newQuestions = [
      ...questions,
      ...suggested.filter((q) => !existing.has(q)),
    ];
    setQuestions(newQuestions);
  }

  function removeQuestion(index: number) {
    setQuestions(questions.filter((_, i) => i !== index));
  }

  function addQuestion(q: string) {
    if (q.trim()) setQuestions([...questions, q.trim()]);
  }

  const isPast = new Date(interview.scheduledAt) < new Date();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Interview Prep — {company}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {role} · {interview.type.charAt(0).toUpperCase() + interview.type.slice(1)} Interview
            {interview.interviewerName && ` with ${interview.interviewerName}`}
          </p>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full">
            <TabsTrigger value="prep" className="flex-1">
              <BookOpen className="mr-1.5 h-3.5 w-3.5" /> Research
            </TabsTrigger>
            <TabsTrigger value="questions" className="flex-1">
              <MessageSquare className="mr-1.5 h-3.5 w-3.5" /> Questions
            </TabsTrigger>
            <TabsTrigger value="reflection" className="flex-1">
              <ClipboardCheck className="mr-1.5 h-3.5 w-3.5" /> Reflection
            </TabsTrigger>
          </TabsList>

          {/* ── Research / Prep Notes ── */}
          <TabsContent value="prep" className="space-y-4 mt-4">
            <div>
              <Label className="text-sm font-semibold">Company Research & Prep Notes</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Company background, recent news, team info, talking points
              </p>
              <Textarea
                value={prepNotes}
                onChange={(e) => setPrepNotes(e.target.value)}
                rows={10}
                placeholder={`Research notes for ${company}...\n\n• Company mission & values\n• Recent news / product launches\n• Team structure\n• Why this role interests you\n• Key achievements to highlight`}
              />
            </div>
          </TabsContent>

          {/* ── Questions ── */}
          <TabsContent value="questions" className="space-y-4 mt-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">
                Questions ({questions.length})
              </Label>
              <Button
                size="sm"
                variant="outline"
                onClick={addSuggestedQuestions}
                className="text-xs"
              >
                + Add Suggested ({interview.type})
              </Button>
            </div>
            <div className="space-y-2">
              {questions.map((q, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 rounded-md border px-3 py-2 bg-muted/30"
                >
                  <span className="text-xs text-muted-foreground mt-0.5 font-mono w-5">
                    {i + 1}.
                  </span>
                  <span className="text-sm flex-1">{q}</span>
                  <button
                    onClick={() => removeQuestion(i)}
                    className="text-xs text-red-500 hover:text-red-700 shrink-0"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const input = e.currentTarget.elements.namedItem(
                  "newQuestion"
                ) as HTMLTextAreaElement;
                addQuestion(input.value);
                input.value = "";
              }}
              className="flex gap-2"
            >
              <Textarea
                name="newQuestion"
                placeholder="Add a custom question…"
                rows={2}
                className="flex-1"
              />
              <Button type="submit" size="sm" className="self-end">
                Add
              </Button>
            </form>
          </TabsContent>

          {/* ── Post-Interview Reflection ── */}
          <TabsContent value="reflection" className="space-y-4 mt-4">
            {!isPast && interview.status !== "completed" && (
              <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950 dark:border-amber-800 p-3">
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  This interview hasn&apos;t happened yet. Come back after to fill in your reflection.
                </p>
              </div>
            )}
            <div>
              <Label className="text-sm font-semibold">Self-Assessment Rating</Label>
              <p className="text-xs text-muted-foreground mb-2">
                How well did the interview go?
              </p>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setReflectionRating(n)}
                    className="p-1"
                  >
                    <Star
                      className={`h-6 w-6 ${
                        n <= reflectionRating
                          ? "fill-yellow-400 text-yellow-400"
                          : "text-gray-300 dark:text-gray-600"
                      }`}
                    />
                  </button>
                ))}
                {reflectionRating > 0 && (
                  <Badge variant="outline" className="ml-2 text-xs">
                    {reflectionRating}/5
                  </Badge>
                )}
              </div>
            </div>
            <Separator />
            <div>
              <Label className="text-sm font-semibold">Reflection Notes</Label>
              <p className="text-xs text-muted-foreground mb-2">
                What went well? What could you improve? Key takeaways?
              </p>
              <Textarea
                value={reflection}
                onChange={(e) => setReflection(e.target.value)}
                rows={8}
                placeholder={`Post-interview reflection...\n\n• What questions went well?\n• What caught you off guard?\n• What would you do differently?\n• Did you ask good questions?\n• Overall impression of the team/company`}
              />
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={handleSave} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Saving…" : "Save Prep"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
