import { auth } from "@/lib/auth";

/**
 * Get the authenticated user's ID from the session.
 * Returns null if not authenticated.
 */
export async function getUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

/**
 * Get the authenticated user's ID, or throw-style return for API routes.
 * Use in API route handlers:
 *
 * ```ts
 * const userId = await getUserId();
 * if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 * ```
 */
export { getUserId as getAuthUserId };
