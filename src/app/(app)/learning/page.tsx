"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Brain,
  FileText,
  Play,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Loader2,
  Trash2,
  Trophy,
  Flame,
  BarChart3,
  BookOpen,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";

// ────── Types ──────

interface DocSummary {
  id: string;
  name: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  category: string;
  createdAt: string;
}

interface TopicSummary {
  id: string;
  documentId: string | null;
  title: string;
  summary: string;
  order: number;
  questionCount: number;
  lastSession: { score: number; totalQs: number; completedAt: string } | null;
  createdAt: string;
}

interface QuizQuestion {
  id: string;
  question: string;
  type: string;
  options: string[];
  answer: string;
  explanation: string | null;
}

interface TopicDetail {
  id: string;
  title: string;
  summary: string;
  content: string;
  questions: QuizQuestion[];
  sessions: { score: number; totalQs: number; completedAt: string }[];
}

interface Stats {
  topicCount: number;
  totalSessions: number;
  avgScore: number;
  streak: number;
}

// ────── Page ──────

export default function LearningPage() {
  const qc = useQueryClient();

  // Current view: "home" | "study" | "quiz" | "results"
  const [view, setView] = useState<"home" | "study" | "quiz" | "results">(
    "home",
  );
  const [activeTopic, setActiveTopic] = useState<TopicDetail | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);

  // ── Data Queries ──

  const { data: stats, isLoading: statsLoading } = useQuery<Stats>({
    queryKey: ["learning-stats"],
    queryFn: () => fetch("/api/learning/sessions").then((r) => r.json()),
  });

  const { data: topics, isLoading: topicsLoading } = useQuery<TopicSummary[]>({
    queryKey: ["learning-topics"],
    queryFn: () => fetch("/api/learning/topics").then((r) => r.json()),
  });

  const { data: docs } = useQuery<DocSummary[]>({
    queryKey: ["documents"],
    queryFn: () => fetch("/api/documents").then((r) => r.json()),
  });

  // ── Mutations ──

  const generateMut = useMutation({
    mutationFn: async (documentIds: string[]) => {
      const res = await fetch("/api/learning/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentIds }),
      });
      if (!res.ok) {
        const err = await res.json();
        // Auto-retry on rate limit
        if (res.status === 429 && err.retryAfter) {
          const wait = Math.min(err.retryAfter + 2, 120);
          toast.info(`Rate limited — retrying in ${wait}s…`);
          await new Promise((r) => setTimeout(r, wait * 1000));
          const retry = await fetch("/api/learning/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ documentIds }),
          });
          if (!retry.ok) {
            const retryErr = await retry.json();
            throw new Error(retryErr.error || "Generation failed after retry");
          }
          return retry.json();
        }
        throw new Error(err.error || "Generation failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast.success(`Generated ${data.topics?.length ?? 0} learning topics!`);
      qc.invalidateQueries({ queryKey: ["learning-topics"] });
      qc.invalidateQueries({ queryKey: ["learning-stats"] });
      setShowGenerate(false);
      setSelectedDocIds([]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submitQuizMut = useMutation({
    mutationFn: async (payload: {
      topicId: string;
      score: number;
      totalQs: number;
    }) => {
      const res = await fetch("/api/learning/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to save session");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["learning-topics"] });
      qc.invalidateQueries({ queryKey: ["learning-stats"] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/learning/topics?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
    },
    onSuccess: () => {
      toast.success("Topic deleted");
      qc.invalidateQueries({ queryKey: ["learning-topics"] });
      qc.invalidateQueries({ queryKey: ["learning-stats"] });
    },
    onError: () => toast.error("Failed to delete topic"),
  });

  // ── Handlers ──

  async function startStudy(topicId: string) {
    const res = await fetch(`/api/learning/topics/${topicId}`);
    if (!res.ok) {
      toast.error("Failed to load topic");
      return;
    }
    const data: TopicDetail = await res.json();
    setActiveTopic(data);
    setQuizAnswers({});
    setQuizSubmitted(false);
    setView("study");
  }

  function startQuiz() {
    setQuizAnswers({});
    setQuizSubmitted(false);
    setView("quiz");
  }

  function submitQuiz() {
    if (!activeTopic) return;
    const score = activeTopic.questions.reduce(
      (acc, q) => acc + (quizAnswers[q.id] === q.answer ? 1 : 0),
      0,
    );
    setQuizSubmitted(true);
    setView("results");
    submitQuizMut.mutate({
      topicId: activeTopic.id,
      score,
      totalQs: activeTopic.questions.length,
    });
  }

  function goHome() {
    setView("home");
    setActiveTopic(null);
    setQuizAnswers({});
    setQuizSubmitted(false);
  }

  // ── Derived ──

  const quizScore = activeTopic
    ? activeTopic.questions.reduce(
        (acc, q) => acc + (quizAnswers[q.id] === q.answer ? 1 : 0),
        0,
      )
    : 0;

  const textDocs = docs?.filter((d) =>
    [
      "text/plain",
      "text/csv",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ].includes(d.mimeType),
  );

  // ────── Render ──────

  if (view === "study" && activeTopic) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={goHome}>
            &larr; Back
          </Button>
          <Badge variant="secondary">
            Topic {activeTopic.questions.length} questions
          </Badge>
        </div>
        <h1 className="text-2xl font-bold">{activeTopic.title}</h1>
        <p className="text-muted-foreground">{activeTopic.summary}</p>
        <Card>
          <CardContent className="prose dark:prose-invert max-w-none pt-6">
            {activeTopic.content.split("\n").map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </CardContent>
        </Card>
        <div className="flex justify-end">
          <Button onClick={startQuiz} className="gap-2">
            Take Quiz <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  if (view === "quiz" && activeTopic) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Quiz: {activeTopic.title}</h1>
          <Badge variant="secondary">
            {Object.keys(quizAnswers).length}/{activeTopic.questions.length}{" "}
            answered
          </Badge>
        </div>
        <Progress
          value={
            (Object.keys(quizAnswers).length / activeTopic.questions.length) *
            100
          }
        />
        <div className="space-y-6">
          {activeTopic.questions.map((q, idx) => (
            <Card key={q.id}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  {idx + 1}. {q.question}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {q.options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() =>
                      setQuizAnswers((prev) => ({ ...prev, [q.id]: opt }))
                    }
                    className={cn(
                      "w-full rounded-lg border px-4 py-3 text-left text-sm transition-colors",
                      quizAnswers[q.id] === opt
                        ? "border-orange-500 bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-400"
                        : "border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800",
                    )}
                  >
                    {opt}
                  </button>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="flex justify-between">
          <Button variant="ghost" onClick={() => setView("study")}>
            &larr; Review Material
          </Button>
          <Button
            onClick={submitQuiz}
            disabled={
              Object.keys(quizAnswers).length < activeTopic.questions.length
            }
            className="gap-2"
          >
            Submit Quiz <CheckCircle2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  if (view === "results" && activeTopic && quizSubmitted) {
    const pct = Math.round(
      (quizScore / activeTopic.questions.length) * 100,
    );
    return (
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <div className="text-center space-y-3">
          <div
            className={cn(
              "mx-auto flex h-20 w-20 items-center justify-center rounded-full",
              pct >= 80
                ? "bg-green-100 dark:bg-green-950"
                : pct >= 50
                  ? "bg-yellow-100 dark:bg-yellow-950"
                  : "bg-red-100 dark:bg-red-950",
            )}
          >
            <Trophy
              className={cn(
                "h-10 w-10",
                pct >= 80
                  ? "text-green-600"
                  : pct >= 50
                    ? "text-yellow-600"
                    : "text-red-600",
              )}
            />
          </div>
          <h1 className="text-2xl font-bold">
            {pct >= 80 ? "Great job!" : pct >= 50 ? "Good effort!" : "Keep practicing!"}
          </h1>
          <p className="text-4xl font-bold">
            {quizScore}/{activeTopic.questions.length}
          </p>
          <p className="text-muted-foreground">{pct}% correct</p>
        </div>

        <div className="space-y-4">
          {activeTopic.questions.map((q, idx) => {
            const correct = quizAnswers[q.id] === q.answer;
            return (
              <Card
                key={q.id}
                className={cn(
                  "border-l-4",
                  correct ? "border-l-green-500" : "border-l-red-500",
                )}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start gap-2">
                    {correct ? (
                      <CheckCircle2 className="mt-0.5 h-5 w-5 text-green-500 shrink-0" />
                    ) : (
                      <XCircle className="mt-0.5 h-5 w-5 text-red-500 shrink-0" />
                    )}
                    <CardTitle className="text-sm font-medium">
                      {idx + 1}. {q.question}
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="text-sm space-y-1">
                  {!correct && (
                    <p>
                      <span className="text-red-600 dark:text-red-400">
                        Your answer:
                      </span>{" "}
                      {quizAnswers[q.id]}
                    </p>
                  )}
                  <p>
                    <span className="text-green-600 dark:text-green-400">
                      Correct:
                    </span>{" "}
                    {q.answer}
                  </p>
                  {q.explanation && (
                    <p className="text-muted-foreground mt-1">
                      {q.explanation}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="flex justify-between">
          <Button variant="ghost" onClick={goHome}>
            &larr; All Topics
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setView("study")}>
              Review Material
            </Button>
            <Button onClick={startQuiz}>Retake Quiz</Button>
          </div>
        </div>
      </div>
    );
  }

  // ────── HOME VIEW ──────

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="h-6 w-6 text-orange-500" />
            Micro-Learning
          </h1>
          <p className="text-sm text-muted-foreground">
            AI-powered bite-sized lessons from your documents
          </p>
        </div>
        <Button onClick={() => setShowGenerate(true)} className="gap-2">
          <Sparkles className="h-4 w-4" /> Generate Topics
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          icon={BookOpen}
          label="Topics"
          value={statsLoading ? "—" : String(stats?.topicCount ?? 0)}
        />
        <StatCard
          icon={BarChart3}
          label="Sessions"
          value={statsLoading ? "—" : String(stats?.totalSessions ?? 0)}
        />
        <StatCard
          icon={Trophy}
          label="Avg Score"
          value={statsLoading ? "—" : `${stats?.avgScore ?? 0}%`}
        />
        <StatCard
          icon={Flame}
          label="Streak"
          value={statsLoading ? "—" : `${stats?.streak ?? 0}d`}
          highlight={!!stats?.streak && stats.streak > 0}
        />
      </div>

      {/* Topic List */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Your Topics</h2>
        {topicsLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-40 rounded-xl" />
            ))}
          </div>
        ) : !topics?.length ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="font-medium">No learning topics yet</p>
              <p className="text-sm text-muted-foreground mb-4">
                Generate topics from your uploaded documents to start learning
              </p>
              <Button
                variant="outline"
                onClick={() => setShowGenerate(true)}
                className="gap-2"
              >
                <Sparkles className="h-4 w-4" /> Generate Topics
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {topics.map((topic) => {
              const lastPct = topic.lastSession
                ? Math.round(
                    (topic.lastSession.score / topic.lastSession.totalQs) * 100,
                  )
                : null;
              return (
                <Card
                  key={topic.id}
                  className="group relative hover:shadow-md transition-shadow"
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-sm font-semibold line-clamp-2">
                        {topic.title}
                      </CardTitle>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteMut.mutate(topic.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {topic.summary}
                    </p>
                    <div className="flex items-center gap-2 text-xs">
                      <Badge variant="secondary" className="text-[10px]">
                        {topic.questionCount} Qs
                      </Badge>
                      {lastPct !== null && (
                        <Badge
                          variant="secondary"
                          className={cn(
                            "text-[10px]",
                            lastPct >= 80
                              ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300"
                              : lastPct >= 50
                                ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300"
                                : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
                          )}
                        >
                          Last: {lastPct}%
                        </Badge>
                      )}
                    </div>
                    <Button
                      size="sm"
                      className="w-full gap-2"
                      onClick={() => startStudy(topic.id)}
                    >
                      <Play className="h-3.5 w-3.5" />
                      {topic.lastSession ? "Review" : "Study Now"}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Generate Dialog */}
      <Dialog open={showGenerate} onOpenChange={setShowGenerate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-orange-500" />
              Generate Learning Topics
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Select documents to break into micro-learning topics with quizzes.
            Works best with text files (.txt, .csv).
          </p>
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {!textDocs?.length ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No text documents found. Upload .txt or .csv files in the
                Documents section first.
              </p>
            ) : (
              textDocs.map((doc) => (
                <label
                  key={doc.id}
                  className="flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <Checkbox
                    checked={selectedDocIds.includes(doc.id)}
                    onCheckedChange={(checked) => {
                      setSelectedDocIds((prev) =>
                        checked
                          ? [...prev, doc.id]
                          : prev.filter((id) => id !== doc.id),
                      );
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{doc.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {doc.category} · {(doc.fileSize / 1024).toFixed(0)} KB
                    </p>
                  </div>
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                </label>
              ))
            )}
          </div>
          <DialogFooter>
            <DialogClose>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button
              disabled={!selectedDocIds.length || generateMut.isPending}
              onClick={() => generateMut.mutate(selectedDocIds)}
              className="gap-2"
            >
              {generateMut.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Generating…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" /> Generate
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ────── Sub-components ──────

function StatCard({
  icon: Icon,
  label,
  value,
  highlight,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-lg",
            highlight
              ? "bg-orange-100 dark:bg-orange-950"
              : "bg-muted",
          )}
        >
          <Icon
            className={cn(
              "h-5 w-5",
              highlight ? "text-orange-500" : "text-muted-foreground",
            )}
          />
        </div>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
