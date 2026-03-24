import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { extract } from "@extractus/article-extractor";
import DOMPurify from "isomorphic-dompurify";
import { getUserId } from "@/lib/auth-utils";

/**
 * POST /api/research-articles/[id]/extract
 * Extracts full article content from the article URL using article-extractor.
 * Sanitizes HTML before storing/returning to prevent XSS.
 */
export async function POST(
  _req: NextRequest,
  {
 params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  // Verify article belongs to a feed owned by this user
  const article = await prisma.researchArticle.findUnique({
    where: { id },
    include: { feed: { select: { userId: true } } },
  });
  if (!article || article.feed.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
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

    // Sanitize extracted HTML to prevent XSS
    const sanitized = DOMPurify.sanitize(result.content, {
      ALLOWED_TAGS: ['p', 'br', 'b', 'i', 'em', 'strong', 'a', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code', 'img', 'figure', 'figcaption'],
      ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class'],
      ALLOW_DATA_ATTR: false,
    });

    const updated = await prisma.researchArticle.update({
      where: { id },
      data: { content: sanitized },
    });

    return NextResponse.json({ content: updated.content });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Extraction failed" },
      { status: 500 }
    );
  }
}
