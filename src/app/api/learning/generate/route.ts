import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";
import { ai, AIProviderError } from "@/lib/ai";
import { toAIEnvelope } from "@/lib/ai/envelope";
import type { AIResponse } from "@/lib/ai/types";

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { documentIds } = body as { documentIds?: string[] };

  if (!documentIds?.length) {
    return NextResponse.json(
      { error: "At least one document ID is required" },
      { status: 400 }
    );
  }

  // Fetch documents owned by this user — only text-based for now
  const docs = await prisma.document.findMany({
    where: {
      id: { in: documentIds },
      userId,
      mimeType: {
        in: [
          "text/plain",
          "text/csv",
          "application/pdf",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ],
      },
    },
    select: { id: true, name: true, data: true, mimeType: true },
  });

  if (!docs.length) {
    return NextResponse.json(
      { error: "No valid text documents found" },
      { status: 400 }
    );
  }

  // Extract text from base64 data (text/plain and CSV we can decode directly)
  const textChunks: string[] = [];
  for (const doc of docs) {
    const buf = Buffer.from(doc.data, "base64");
    if (
      doc.mimeType === "text/plain" ||
      doc.mimeType === "text/csv"
    ) {
      textChunks.push(`--- Document: ${doc.name} ---\n${buf.toString("utf-8")}`);
    } else {
      // For PDF/DOC, send the raw text representation the user can extract
      // We'll try a simple UTF-8 decode as a best effort
      const raw = buf.toString("utf-8");
      // Filter out binary noise — keep printable ascii and common chars
      const cleaned = raw.replace(/[^\x20-\x7E\n\r\t]/g, " ").replace(/\s{3,}/g, " ");
      if (cleaned.trim().length > 50) {
        textChunks.push(`--- Document: ${doc.name} ---\n${cleaned.slice(0, 15000)}`);
      }
    }
  }

  if (!textChunks.length) {
    return NextResponse.json(
      { error: "Could not extract text from the selected documents. Try uploading text (.txt) files." },
      { status: 400 }
    );
  }

  const combinedText = textChunks.join("\n\n").slice(0, 30000);

  const prompt = `You are an expert educator. Analyze the following document content and break it into micro-learning topics with quiz questions.

DOCUMENT CONTENT:
${combinedText}

Create 5-10 focused learning topics from this material. For each topic, create 3-5 quiz questions.

Return a JSON object with this EXACT structure:
{
  "topics": [
    {
      "title": "Short descriptive topic title",
      "summary": "2-3 sentence overview of what this topic covers",
      "content": "Detailed explanation of the topic (3-5 paragraphs, educational and clear)",
      "questions": [
        {
          "question": "The quiz question",
          "type": "multiple_choice",
          "options": ["Option A", "Option B", "Option C", "Option D"],
          "answer": "The correct option text (must exactly match one of the options)",
          "explanation": "Brief explanation of why this is correct"
        }
      ]
    }
  ]
}

GUIDELINES:
- Topics should progress from foundational to advanced concepts
- Each topic should be self-contained and learnable in 2-5 minutes
- Quiz questions should test understanding, not just memorization
- Include a mix of multiple_choice and true_false question types
- For true_false questions, options should be ["True", "False"]
- Explanations should be educational and reinforce the learning
- Make content clear and accessible`;

  let parsed: {
    topics?: Array<{
      title: string;
      summary: string;
      content: string;
      questions: Array<{
        question: string;
        type: string;
        options: string[];
        answer: string;
        explanation?: string;
      }>;
    }>;
  };

  let aiResult: AIResponse<typeof parsed> | null = null;
  let aiDurationMs = 0;
  try {
    const t0 = Date.now();
    const result = await ai.generate<typeof parsed>({
      task: "extract",
      messages: [{ role: "user", content: prompt }],
      userId,
    });
    aiDurationMs = Date.now() - t0;
    aiResult = result;
    parsed = result.json ?? {};
    console.log(`[learning/generate] used model: ${result.model}`);
  } catch (error) {
    if (error instanceof AIProviderError) {
      console.error(`[learning/generate] ${error.providerId} error:`, error.message);
      return NextResponse.json(
        { error: error.message, retryAfter: error.retryAfter },
        { status: error.status ?? 500 },
      );
    }
    console.error("[learning/generate] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }

  try {
    if (!parsed.topics?.length) {
      return NextResponse.json(
        { error: "AI could not generate topics from this content" },
        { status: 422 },
      );
    }

    // Persist topics and questions
    const created = [];
    for (let i = 0; i < parsed.topics.length; i++) {
      const t = parsed.topics[i];
      const topic = await prisma.learningTopic.create({
        data: {
          userId,
          documentId: docs[0].id,
          title: t.title,
          summary: t.summary,
          content: t.content,
          order: i,
          questions: {
            create: (t.questions || []).map((q) => ({
              question: q.question,
              type: q.type || "multiple_choice",
              optionsJson: JSON.stringify(q.options || []),
              answer: q.answer,
              explanation: q.explanation || null,
            })),
          },
        },
        include: { questions: true },
      });
      created.push(topic);
    }

    return NextResponse.json(
      aiResult
        ? toAIEnvelope({ topics: created }, aiResult, aiDurationMs)
        : { topics: created },
      { status: 201 },
    );
  } catch (error) {
    console.error("[learning/generate] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
