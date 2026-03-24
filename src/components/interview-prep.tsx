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
  Sparkles,
  Loader2,
  Lightbulb,
  HelpCircle,
  Building2,
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

interface AIQuestion {
  question: string;
  tip?: string;
  category?: string;
}

interface AIResponse {
  questions?: AIQuestion[];
  companyInsights?: string[];
  talkingPoints?: string[];
  questionsToAsk?: string[];
}

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
  const [aiData, setAiData] = useState<AIResponse | null>(null);
  const [showTips, setShowTips] = useState<Record<number, boolean>>({});

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

  const aiMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/interview-prep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company,
          role,
          interviewType: interview.type,
          interviewerRole: interview.interviewerRole,
        }),
      });
      if (!res.ok) throw new Error("Failed to generate");
      return res.json() as Promise<AIResponse>;
    },
    onSuccess: (data) => {
      setAiData(data);
      if (data.questions?.length) {
        const existing = new Set(questions);
        const aiQuestions = data.questions
          .map((q) => q.question)
          .filter((q) => !existing.has(q));
        setQuestions([...questions, ...aiQuestions]);
        toast.success(`Generated ${aiQuestions.length} questions`);
      }
      if (data.companyInsights?.length || data.talkingPoints?.length) {
        const insightsSection = data.companyInsights?.length
          ? `\n\n🏢 AI Company Insights:\n${data.companyInsights.map((i) => `• ${i}`).join("\n")}`
          : "";
        const talkingSection = data.talkingPoints?.length
          ? `\n\n💡 Talking Points:\n${data.talkingPoints.map((t) => `• ${t}`).join("\n")}`
          : "";
        if (insightsSection || talkingSection) {
          setPrepNotes((prev) => (prev ? prev + insightsSection + talkingSection : (insightsSection + talkingSection).trim()));
        }
      }
    },
    onError: () => toast.error("Failed to generate AI questions"),
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
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Company Research & Prep Notes</Label>
              {!aiData && (
                <Button
                  size="sm"
                  onClick={() => { aiMutation.mutate(); setTab("questions"); }}
                  disabled={aiMutation.isPending}
                  className="text-xs bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white"
                >
                  {aiMutation.isPending ? (
                    <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Generating…</>
                  ) : (
                    <><Sparkles className="mr-1.5 h-3.5 w-3.5" /> AI Research</>
                  )}
                </Button>
              )}
            </div>

            {aiData?.companyInsights && aiData.companyInsights.length > 0 && (
              <div className="rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/50 p-3 space-y-1.5">
                <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5" /> AI Company Insights
                </p>
                {aiData.companyInsights.map((insight, i) => (
                  <p key={i} className="text-sm text-blue-600 dark:text-blue-400 flex items-start gap-1.5">
                    <span className="shrink-0">•</span> {insight}
                  </p>
                ))}
              </div>
            )}

            {aiData?.talkingPoints && aiData.talkingPoints.length > 0 && (
              <div className="rounded-md border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/50 p-3 space-y-1.5">
                <p className="text-xs font-semibold text-green-700 dark:text-green-300 flex items-center gap-1.5">
                  <Lightbulb className="h-3.5 w-3.5" /> Talking Points to Prepare
                </p>
                {aiData.talkingPoints.map((point, i) => (
                  <p key={i} className="text-sm text-green-600 dark:text-green-400 flex items-start gap-1.5">
                    <span className="shrink-0">•</span> {point}
                  </p>
                ))}
              </div>
            )}

            <div>
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
            <div className="flex items-center justify-between flex-wrap gap-2">
              <Label className="text-sm font-semibold">
                Questions ({questions.length})
              </Label>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={addSuggestedQuestions}
                  className="text-xs"
                >
                  + Add Suggested ({interview.type})
                </Button>
                <Button
                  size="sm"
                  onClick={() => aiMutation.mutate()}
                  disabled={aiMutation.isPending}
                  className="text-xs bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white"
                >
                  {aiMutation.isPending ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      Generating…
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                      AI Generate
                    </>
                  )}
                </Button>
              </div>
            </div>

            {aiMutation.isPending && (
              <div className="rounded-md border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/50 p-3 text-sm text-purple-700 dark:text-purple-300 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                Generating personalized questions for {role} at {company}…
              </div>
            )}

            <div className="space-y-2">
              {questions.map((q, i) => {
                const aiQ = aiData?.questions?.find((aq) => aq.question === q);
                return (
                  <div
                    key={i}
                    className="rounded-md border px-3 py-2 bg-muted/30"
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-xs text-muted-foreground mt-0.5 font-mono w-5">
                        {i + 1}.
                      </span>
                      <span className="text-sm flex-1">{q}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        {aiQ?.tip && (
                          <button
                            onClick={() => setShowTips((prev) => ({ ...prev, [i]: !prev[i] }))}
                            className="text-xs text-purple-500 hover:text-purple-700 dark:hover:text-purple-300"
                            title="Show AI tip"
                          >
                            <Lightbulb className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {aiQ?.category && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {aiQ.category}
                          </Badge>
                        )}
                        <button
                          onClick={() => removeQuestion(i)}
                          className="text-xs text-red-500 hover:text-red-700 shrink-0"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                    {aiQ?.tip && showTips[i] && (
                      <div className="ml-7 mt-1.5 text-xs text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/50 rounded px-2 py-1.5 flex items-start gap-1.5">
                        <Lightbulb className="h-3 w-3 mt-0.5 shrink-0" />
                        {aiQ.tip}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Questions to ask the interviewer */}
            {aiData?.questionsToAsk && aiData.questionsToAsk.length > 0 && (
              <>
                <Separator />
                <div>
                  <Label className="text-sm font-semibold flex items-center gap-1.5">
                    <HelpCircle className="h-3.5 w-3.5" />
                    Questions to Ask the Interviewer
                  </Label>
                  <div className="mt-2 space-y-1.5">
                    {aiData.questionsToAsk.map((q, i) => (
                      <div
                        key={i}
                        className="text-sm text-muted-foreground flex items-start gap-2 px-2"
                      >
                        <span className="text-purple-500 mt-0.5">→</span>
                        {q}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

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
