import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";

/** Parse a date string safely — returns null if invalid */
function safeDate(val: string | null | undefined): Date | null {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const contentType = request.headers.get("content-type") || "";

    let parsedData: any;
    let resumeFile: File | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const dataField = formData.get("data");
      if (typeof dataField === "string") {
        parsedData = JSON.parse(dataField);
      } else {
        return NextResponse.json({ error: "Missing data field" }, { status: 400 });
      }
      const fileField = formData.get("file");
      if (fileField instanceof File) {
        resumeFile = fileField;
      }
    } else {
      parsedData = await request.json();
    }

    if (!parsedData) {
      return NextResponse.json({ error: "No data provided" }, { status: 400 });
    }

    // 1. Update Profile (if it exists)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true }
    });

    if (!user) {
      return NextResponse.json({ error: "User not found. Please sign out and sign back in." }, { status: 401 });
    }

    if (parsedData.profile) {
      const pInfo = parsedData.profile;

      let parsedCity: string | null = null;
      let parsedState: string | null = null;
      if (pInfo.location) {
         const parts = pInfo.location.split(",");
         if (parts.length > 0) parsedCity = parts[0].trim() || null;
         if (parts.length > 1) parsedState = parts[1].trim() || null;
      }

      const profileData = {
        headline: pInfo.headline || null,
        bio: pInfo.bio || null,
        city: parsedCity,
        state: parsedState,
        portfolioUrl: pInfo.website || null,
        githubUrl: pInfo.githubUrl || null,
        linkedinUrl: pInfo.linkedinUrl || null,
      };

      await prisma.userProfile.upsert({
        where: { userId },
        update: profileData,
        create: { userId, ...profileData },
      });
    }

    // 2. Update Experience (CurrentPositions)
    if (parsedData.experience && Array.isArray(parsedData.experience)) {
      for (const exp of parsedData.experience) {
        if (!exp.company || !exp.title) continue;
        
        await prisma.currentPosition.create({
          data: {
            userId,
            role: exp.title,
            company: exp.company,
            location: exp.location,
            startDate: safeDate(exp.startDate) ?? new Date(),
            endDate: safeDate(exp.endDate),
            isActive: exp.isCurrent ?? (!exp.endDate),
            description: exp.description,
            responsibilities: JSON.stringify(exp.achievements || []),
          }
        });
      }
    }

    // 3. Update Skills
    if (parsedData.skills && Array.isArray(parsedData.skills)) {
      for (const sName of parsedData.skills) {
        if (!sName) continue;
        
        // Basic upsert so we don't have duplicated skills for this user
        const existing = await prisma.skill.findFirst({
          where: { userId, name: sName }
        });
        
        if (!existing) {
          await prisma.skill.create({
            data: {
              userId,
              name: sName,
              proficiency: "intermediate", // Default proficiency
            }
          });
        }
      }
    }

    // 4. Create Interactive Resume with proper sections config
    const resumeTitle = parsedData.profile?.headline
      ? `${parsedData.profile.headline} Resume`
      : "Imported Resume";
    const slugBase = (resumeTitle)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const uniqueSlug = `${slugBase}-${Math.random().toString(36).slice(2, 8)}`;

    const defaultSections = [
      { type: "summary", visible: true, order: 0 },
      { type: "experience", visible: true, order: 1 },
      { type: "skills", visible: true, order: 2 },
      { type: "certifications", visible: true, order: 3 },
      { type: "contact", visible: true, order: 4 },
    ];

    await prisma.interactiveResume.create({
      data: {
        userId,
        slug: uniqueSlug,
        title: resumeTitle,
        targetRole: parsedData.experience?.[0]?.title || null,
        summary: parsedData.profile?.bio || null,
        sections: JSON.stringify(defaultSections),
        customContent: JSON.stringify(parsedData),
      }
    });

    // 5. Create baseline ResumeVersion (and store the uploaded PDF if provided)
    let filePath: string | null = null;
    let fileName: string | null = null;
    let fileSize: number | null = null;

    if (resumeFile) {
      const uploadsDir = path.join(process.cwd(), "public", "uploads", "resumes");
      await mkdir(uploadsDir, { recursive: true });

      const ext = path.extname(resumeFile.name) || ".pdf";
      const safeName = `${userId}-${crypto.randomUUID()}${ext}`;
      const destPath = path.join(uploadsDir, safeName);

      const buffer = Buffer.from(await resumeFile.arrayBuffer());
      await writeFile(destPath, buffer);

      filePath = `/uploads/resumes/${safeName}`;
      fileName = resumeFile.name;
      fileSize = resumeFile.size;
    }

    await prisma.resumeVersion.create({
      data: {
        userId,
        name: resumeTitle.replace(/ Resume$/, " — Baseline"),
        targetRole: parsedData.experience?.[0]?.title || null,
        notes: "Imported during onboarding",
        versionNumber: 1,
        isActive: true,
        filePath,
        fileName,
        fileSize,
      },
    });

    return NextResponse.json({ success: true });
  } catch (dbError: any) {
    console.error("DB update error:", dbError);
    return NextResponse.json({ error: "Failed to update profile.", details: dbError.message }, { status: 500 });
  }
}