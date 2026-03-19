import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { extract } from "@extractus/article-extractor";

/**
 * POST /api/research-articles/[id]/extract
 * Extracts full article content from the article URL using article-extractor.
 * Returns the extracted content and saves it to the database.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const article = await prisma.researchArticle.findUnique({ where: { id } });
  if (!article) {
    return NextResponse.json({ error: "Article not found" }, { status: 404 });
  }

  // Return cached content if already extracted
  if (article.content) {
    return NextResponse.json({ content: article.content });
  }

  try {
    const result = await extract(article.url);
    if (!result?.content) {
      return NextResponse.json(
        { error: "Could not extract content from this URL" },
        { status: 422 }
      );
    }

    const updated = await prisma.researchArticle.update({
      where: { id },
      data: { content: result.content },
    });

    return NextResponse.json({ content: updated.content });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Extraction failed" },
      { status: 500 }
    );
  }
}
