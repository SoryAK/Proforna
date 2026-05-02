import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { getUserId } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";

const MAX_SIZE = 8 * 1024 * 1024; // 8 MB
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

// POST /api/gallery/annotations/upload — multipart/form-data with `file`
// Returns { url } pointing at /uploads/annotations/<file>
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = checkRateLimit(`annot:upload:${userId}`, { limit: 100, windowMs: 60 * 60 * 1000 });
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: rl.headers });

  try {
    const form = await request.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "file required" }, { status: 400 });
    if (!ALLOWED.has(file.type))
      return NextResponse.json({ error: "image/png, jpeg, webp, or gif only" }, { status: 400 });
    if (file.size > MAX_SIZE)
      return NextResponse.json({ error: "Max 8 MB" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.type === "image/png" ? ".png"
      : file.type === "image/webp" ? ".webp"
      : file.type === "image/gif" ? ".gif"
      : ".jpg";
    const filename = `ann-${crypto.randomBytes(10).toString("hex")}${ext}`;

    const uploadDir = path.join(process.cwd(), "public", "uploads", "annotations");
    await mkdir(uploadDir, { recursive: true });
    await writeFile(path.join(uploadDir, filename), buffer);

    return NextResponse.json({ url: `/uploads/annotations/${filename}` });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
