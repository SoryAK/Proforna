import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/auth-utils";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";

const MAX_SIZE = 5 * 1024 * 1024;
const MAX_FILES_PER_REQUEST = 30;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// Strip extension + clean separators → friendly default name
function nameFromFile(filename: string): string {
  const stem = filename.replace(/\.[^./\\]+$/, "");
  const cleaned = stem.replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, 200) || "Untitled item";
}

// POST multipart form: repeated `file` fields (and optional `category`)
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const formData = await request.formData();
    const files = formData.getAll("file").filter((f): f is File => f instanceof File);
    const category = (formData.get("category") as string | null) || "tool";

    if (files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }
    if (files.length > MAX_FILES_PER_REQUEST) {
      return NextResponse.json(
        { error: `Too many files (max ${MAX_FILES_PER_REQUEST} per request)` },
        { status: 400 },
      );
    }

    const uploadDir = path.join(process.cwd(), "public", "uploads", "personal-equipment");
    await mkdir(uploadDir, { recursive: true });

    const created: unknown[] = [];
    const errors: { fileName: string; error: string }[] = [];

    for (const file of files) {
      try {
        if (!ALLOWED_TYPES.includes(file.type)) {
          errors.push({ fileName: file.name, error: "Invalid file type" });
          continue;
        }
        if (file.size > MAX_SIZE) {
          errors.push({ fileName: file.name, error: "File too large (max 5 MB)" });
          continue;
        }

        const ext = file.type.split("/")[1] === "jpeg" ? "jpg" : file.type.split("/")[1];
        const filename = `pe-${crypto.randomBytes(8).toString("hex")}.${ext}`;
        const buffer = Buffer.from(await file.arrayBuffer());
        await writeFile(path.join(uploadDir, filename), buffer);

        const item = await prisma.personalEquipment.create({
          data: {
            userId,
            name: nameFromFile(file.name),
            category,
            ownership: "personal",
            condition: "good",
            isPrivate: true,
            isDraft: true,
            photos: {
              create: {
                filePath: `/uploads/personal-equipment/${filename}`,
                fileName: file.name,
                fileMime: file.type,
                fileSize: file.size,
                isCover: true,
                sortOrder: 0,
              },
            },
          },
          include: { photos: true },
        });
        created.push(item);
      } catch (err) {
        errors.push({ fileName: file.name, error: String(err) });
      }
    }

    return NextResponse.json(
      { created, errors, createdCount: created.length, errorCount: errors.length },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
