"use client";

import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Shield,
  Send,
  AlertTriangle,
  ExternalLink,
  Phone,
  Loader2,
  Scale,
  HardHat,
  Ban,
  Megaphone,
  DollarSign,
  Siren,
  RefreshCw,
  ChevronRight,
} from "lucide-react";

interface Agency {
  name: string;
  description: string;
  url: string;
  phone?: string;
}

interface RightsResponse {
  answer: string;
  agencies: Agency[];
  keyPoints: string[];
  actionSteps: string[];
  category: string;
  disclaimer: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  data?: RightsResponse;
}

const QUICK_QUESTIONS = [
  {
    icon: HardHat,
    label: "Unsafe Working Conditions",
    question:
      "My workplace has unsafe conditions. What are my OSHA rights and how do I file a complaint?",
    color: "text-orange-600",
  },
  {
    icon: DollarSign,
    label: "Wage Theft",
    question:
      "I think my employer is not paying me correctly (overtime, minimum wage, or withheld wages). What can I do?",
    color: "text-green-600",
  },
  {
    icon: Ban,
    label: "Discrimination",
    question:
      "I'm experiencing discrimination at work based on my race, gender, age, or disability. What protections do I have?",
    color: "text-purple-600",
  },
  {
    icon: Megaphone,
    label: "Whistleblower Protections",
    question:
      "I want to report illegal activity at my company but I'm afraid of retaliation. What protections exist for whistleblowers?",
    color: "text-blue-600",
  },
  {
    icon: Siren,
    label: "Harassment",
    question:
      "I'm being harassed at work. What are my rights and what steps should I take to document and report it?",
    color: "text-red-600",
  },
  {
    icon: Scale,
    label: "Wrongful Termination",
    question:
      "I was fired and I believe it was illegal (retaliation, discrimination, breach of contract). What are my options?",
    color: "text-amber-600",
  },
];

const CATEGORY_COLORS: Record<string, string> = {
  osha: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  "wage-theft":
    "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  discrimination:
    "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  whistleblower:
    "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  harassment: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  retaliation:
    "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  "workers-comp":
    "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
  general: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
};

function formatCategoryLabel(cat: string) {
  return cat
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Render basic markdown: headers, bold, bullets, links */
function RenderMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {lines.map((line, i) => {
        if (line.startsWith("## "))
          return (
            <h3 key={i} className="font-semibold text-base mt-3">
              {line.slice(3)}
            </h3>
          );
        if (line.startsWith("### "))
          return (
            <h4 key={i} className="font-semibold text-sm mt-2">
              {line.slice(4)}
            </h4>
          );
        if (line.startsWith("- ") || line.startsWith("* "))
          return (
            <li key={i} className="ml-4 list-disc">
              <InlineFormat text={line.slice(2)} />
            </li>
          );
        if (line.trim() === "") return <div key={i} className="h-1" />;
        return (
          <p key={i}>
            <InlineFormat text={line} />
          </p>
        );
      })}
    </div>
  );
}

function InlineFormat({ text }: { text: string }) {
  // Handle **bold** and [links](url)
  const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**"))
          return (
            <strong key={i} className="font-semibold">
              {part.slice(2, -2)}
            </strong>
          );
        const linkMatch = part.match(/\[([^\]]+)\]\(([^)]+)\)/);
        if (linkMatch)
          return (
            <a
              key={i}
              href={linkMatch[2]}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 underline hover:text-blue-800"
            >
              {linkMatch[1]}
            </a>
          );
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

export default function WorkerRightsPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  async function askQuestion(question: string) {
    if (!question.trim() || loading) return;

    const userMsg: Message = { role: "user", content: question };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/worker-rights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });

      if (!res.ok) throw new Error("Request failed");

      const data: RightsResponse = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.answer, data },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Sorry, I was unable to process your question. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    askQuestion(input);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      askQuestion(input);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="h-6 w-6 text-blue-600" />
          Worker Rights & Protections
        </h1>
        <p className="text-sm text-muted-foreground">
          Understand your workplace rights — OSHA, labor laws, discrimination
          protections, and more
        </p>
      </div>

      {/* Disclaimer Banner */}
      <Card className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
        <CardContent className="py-3 px-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-amber-800 dark:text-amber-200">
            <strong>Disclaimer:</strong> This tool provides general educational
            information about workplace rights, NOT legal advice. For
            advice specific to your situation, consult a licensed attorney.
            If you are in immediate danger, call 911.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Main Chat Area */}
        <div className="lg:col-span-3 flex flex-col">
          <Card className="flex-1 flex flex-col min-h-[500px]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Ask about your workplace rights
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col gap-3 pb-3">
              {/* Messages */}
              <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto space-y-4 pr-1"
              >
                {messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center px-4">
                    <Shield className="h-12 w-12 text-muted-foreground/30 mb-4" />
                    <h3 className="font-medium text-muted-foreground mb-2">
                      Know Your Rights
                    </h3>
                    <p className="text-sm text-muted-foreground/80 max-w-md mb-6">
                      Ask any question about workplace laws, safety regulations,
                      or employee protections. Your questions are contextualized
                      to your state and industry.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
                      {QUICK_QUESTIONS.map((q) => (
                        <button
                          key={q.label}
                          onClick={() => askQuestion(q.question)}
                          disabled={loading}
                          className="flex items-center gap-2 p-3 rounded-lg border text-left text-xs
                            hover:bg-accent transition-colors disabled:opacity-50"
                        >
                          <q.icon className={`h-4 w-4 flex-shrink-0 ${q.color}`} />
                          <span>{q.label}</span>
                          <ChevronRight className="h-3 w-3 ml-auto text-muted-foreground" />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  messages.map((msg, i) => (
                    <div key={i}>
                      {msg.role === "user" ? (
                        <div className="flex justify-end">
                          <div className="bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-4 py-2 max-w-[80%] text-sm">
                            {msg.content}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {/* Category Badge */}
                          {msg.data?.category && (
                            <Badge
                              className={
                                CATEGORY_COLORS[msg.data.category] ||
                                CATEGORY_COLORS.general
                              }
                            >
                              {formatCategoryLabel(msg.data.category)}
                            </Badge>
                          )}

                          {/* Main Answer */}
                          <div className="bg-muted/50 rounded-2xl rounded-bl-sm p-4 max-w-[95%]">
                            <RenderMarkdown text={msg.content} />
                          </div>

                          {/* Key Points */}
                          {msg.data?.keyPoints &&
                            msg.data.keyPoints.length > 0 && (
                              <Card className="border-blue-200 dark:border-blue-800">
                                <CardContent className="py-3 px-4">
                                  <h4 className="text-xs font-semibold uppercase tracking-wide text-blue-600 mb-2">
                                    Key Takeaways
                                  </h4>
                                  <ul className="space-y-1">
                                    {msg.data.keyPoints.map((kp, j) => (
                                      <li
                                        key={j}
                                        className="text-xs flex items-start gap-2"
                                      >
                                        <span className="text-blue-500 mt-0.5">
                                          •
                                        </span>
                                        {kp}
                                      </li>
                                    ))}
                                  </ul>
                                </CardContent>
                              </Card>
                            )}

                          {/* Action Steps */}
                          {msg.data?.actionSteps &&
                            msg.data.actionSteps.length > 0 && (
                              <Card className="border-green-200 dark:border-green-800">
                                <CardContent className="py-3 px-4">
                                  <h4 className="text-xs font-semibold uppercase tracking-wide text-green-600 mb-2">
                                    Action Steps
                                  </h4>
                                  <ol className="space-y-1">
                                    {msg.data.actionSteps.map((step, j) => (
                                      <li
                                        key={j}
                                        className="text-xs flex items-start gap-2"
                                      >
                                        <span className="text-green-600 font-semibold min-w-[18px]">
                                          {j + 1}.
                                        </span>
                                        {step}
                                      </li>
                                    ))}
                                  </ol>
                                </CardContent>
                              </Card>
                            )}

                          {/* Agencies */}
                          {msg.data?.agencies &&
                            msg.data.agencies.length > 0 && (
                              <Card className="border-indigo-200 dark:border-indigo-800">
                                <CardContent className="py-3 px-4">
                                  <h4 className="text-xs font-semibold uppercase tracking-wide text-indigo-600 mb-2">
                                    Contact These Agencies
                                  </h4>
                                  <div className="space-y-2">
                                    {msg.data.agencies.map((agency, j) => (
                                      <div
                                        key={j}
                                        className="flex items-start gap-2 text-xs"
                                      >
                                        <Shield className="h-3.5 w-3.5 text-indigo-500 mt-0.5 flex-shrink-0" />
                                        <div>
                                          <div className="font-medium">
                                            {agency.url ? (
                                              <a
                                                href={agency.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1"
                                              >
                                                {agency.name}
                                                <ExternalLink className="h-3 w-3" />
                                              </a>
                                            ) : (
                                              agency.name
                                            )}
                                          </div>
                                          <p className="text-muted-foreground">
                                            {agency.description}
                                          </p>
                                          {agency.phone && (
                                            <p className="text-muted-foreground flex items-center gap-1 mt-0.5">
                                              <Phone className="h-3 w-3" />
                                              {agency.phone}
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </CardContent>
                              </Card>
                            )}

                          {/* Disclaimer */}
                          {msg.data?.disclaimer && (
                            <p className="text-[10px] text-muted-foreground/60 italic px-1">
                              {msg.data.disclaimer}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}

                {loading && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Researching your rights...
                  </div>
                )}
              </div>

              {/* Input */}
              <form
                onSubmit={handleSubmit}
                className="flex items-end gap-2 pt-2 border-t"
              >
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about workplace rights, OSHA, labor laws, discrimination..."
                  className="resize-none min-h-[44px] max-h-[120px] text-sm"
                  rows={1}
                  disabled={loading}
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={loading || !input.trim()}
                  className="h-[44px] px-3"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Resource Sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Emergency Resources</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <ResourceLink
                name="OSHA Complaint Hotline"
                phone="1-800-321-OSHA (6742)"
                url="https://www.osha.gov/workers/file-complaint"
              />
              <ResourceLink
                name="National Labor Relations Board"
                phone="1-844-762-NLRB"
                url="https://www.nlrb.gov/about-nlrb/what-we-do/investigate-charges"
              />
              <ResourceLink
                name="EEOC (Discrimination)"
                phone="1-800-669-4000"
                url="https://www.eeoc.gov/filing-charge-discrimination"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Federal Agencies</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <ResourceLink
                name="Dept. of Labor — Wage & Hour"
                url="https://www.dol.gov/agencies/whd/contact/complaints"
              />
              <ResourceLink
                name="OSHA — Safety & Health"
                url="https://www.osha.gov/"
              />
              <ResourceLink
                name="EEOC — Equal Employment"
                url="https://www.eeoc.gov/"
              />
              <ResourceLink
                name="NLRB — Union & Organizing"
                url="https://www.nlrb.gov/"
              />
              <ResourceLink
                name="DOJ — Civil Rights"
                url="https://www.justice.gov/crt"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Know Your Rights</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground space-y-2">
              <p>
                <strong>Retaliation is illegal.</strong> Employers cannot fire,
                demote, or punish you for filing complaints or exercising your
                rights.
              </p>
              <p>
                <strong>Anonymous reports.</strong> Many agencies accept
                anonymous complaints, including OSHA.
              </p>
              <p>
                <strong>Time limits apply.</strong> Most workplace claims have
                filing deadlines — act promptly.
              </p>
              <p>
                <strong>Document everything.</strong> Keep records of incidents,
                communications, and witnesses.
              </p>
            </CardContent>
          </Card>

          {messages.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setMessages([])}
            >
              <RefreshCw className="h-3 w-3 mr-2" />
              Clear Conversation
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function ResourceLink({
  name,
  url,
  phone,
}: {
  name: string;
  url: string;
  phone?: string;
}) {
  return (
    <div className="text-xs">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
      >
        {name}
        <ExternalLink className="h-3 w-3" />
      </a>
      {phone && (
        <p className="text-muted-foreground flex items-center gap-1 mt-0.5">
          <Phone className="h-3 w-3" />
          {phone}
        </p>
      )}
    </div>
  );
}
