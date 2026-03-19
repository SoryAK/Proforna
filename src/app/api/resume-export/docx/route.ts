import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  SectionType,
} from "docx";
import { format } from "date-fns";

function formatDateRange(start: string, end: string | null): string {
  const s = format(new Date(start), "MMM yyyy");
  const e = end ? format(new Date(end), "MMM yyyy") : "Present";
  return `${s} — ${e}`;
}

function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text: text.toUpperCase(),
        bold: true,
        size: 24,
        color: "e8740c",
        font: "Calibri",
      }),
    ],
    spacing: { before: 300, after: 80 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "d1d5db" },
    },
  });
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const resumeId = sp.get("resumeId");

  const [profile, positions, skills, certifications, resume] = await Promise.all([
    prisma.userProfile.findFirst(),
    prisma.currentPosition.findMany({ orderBy: { startDate: "desc" } }),
    prisma.skill.findMany({ orderBy: [{ category: "asc" }, { name: "asc" }] }),
    prisma.certification.findMany({ orderBy: { issueDate: "desc" } }),
    resumeId ? prisma.resumeVersion.findUnique({ where: { id: resumeId } }) : null,
  ]);

  if (!profile) {
    return NextResponse.json(
      { error: "Profile not found." },
      { status: 404 }
    );
  }

  const children: Paragraph[] = [];

  // Header — Name
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: profile.fullName || "Your Name",
          bold: true,
          size: 36,
          font: "Calibri",
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
    })
  );

  // Headline
  if (profile.headline) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: profile.headline,
            size: 22,
            color: "6b7280",
            font: "Calibri",
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 40 },
      })
    );
  }

  // Contact line
  const contactParts = [
    profile.email,
    profile.phone,
    [profile.city, profile.state].filter(Boolean).join(", "),
    profile.linkedinUrl ? profile.linkedinUrl.replace(/^https?:\/\/(www\.)?/, "") : null,
    profile.githubUrl ? profile.githubUrl.replace(/^https?:\/\/(www\.)?/, "") : null,
  ].filter(Boolean);

  if (contactParts.length > 0) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: contactParts.join("  |  "),
            size: 18,
            color: "6b7280",
            font: "Calibri",
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
      })
    );
  }

  // Summary
  if (profile.bio) {
    children.push(sectionHeading("Summary"));
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: profile.bio, size: 20, font: "Calibri" }),
        ],
        spacing: { after: 100 },
      })
    );
  }

  // Experience
  if (positions.length > 0) {
    children.push(sectionHeading("Experience"));
    for (const pos of positions) {
      // Role + Date
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: pos.role,
              bold: true,
              size: 22,
              font: "Calibri",
            }),
            new TextRun({
              text: `    ${formatDateRange(pos.startDate.toISOString(), pos.endDate?.toISOString() || null)}`,
              size: 18,
              color: "6b7280",
              font: "Calibri",
            }),
          ],
          spacing: { before: 100, after: 20 },
        })
      );
      // Company line
      const companyLine = [
        pos.company,
        pos.department,
        pos.location,
      ].filter(Boolean).join(" · ");
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: companyLine,
              size: 20,
              color: "6b7280",
              font: "Calibri",
            }),
          ],
          spacing: { after: 40 },
        })
      );
      // Description
      if (pos.description) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: pos.description, size: 20, font: "Calibri" }),
            ],
            spacing: { after: 40 },
          })
        );
      }
      // Responsibilities as bullet points
      if (pos.responsibilities) {
        const bullets = pos.responsibilities
          .split(/[,\n]/)
          .map((r) => r.trim())
          .filter(Boolean);
        for (const bullet of bullets) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({ text: bullet, size: 20, font: "Calibri" }),
              ],
              bullet: { level: 0 },
              spacing: { after: 20 },
            })
          );
        }
      }
      // Tech stack
      if (pos.techStack) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `Tech: ${pos.techStack}`,
                size: 18,
                color: "6b7280",
                italics: true,
                font: "Calibri",
              }),
            ],
            spacing: { after: 80 },
          })
        );
      }
    }
  }

  // Skills
  if (skills.length > 0) {
    children.push(sectionHeading("Skills"));
    // Group by category
    const grouped = skills.reduce<Record<string, typeof skills>>((acc, s) => {
      const cat = s.category || "technical";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(s);
      return acc;
    }, {});

    const catLabels: Record<string, string> = {
      technical: "Technical",
      soft: "Soft Skills",
      language: "Languages",
      tool: "Tools",
    };

    for (const [cat, items] of Object.entries(grouped)) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `${catLabels[cat] || cat}: `,
              bold: true,
              size: 20,
              font: "Calibri",
            }),
            new TextRun({
              text: items.map((s) => s.name).join(", "),
              size: 20,
              font: "Calibri",
            }),
          ],
          spacing: { after: 40 },
        })
      );
    }
  }

  // Certifications
  if (certifications.length > 0) {
    children.push(sectionHeading("Certifications"));
    for (const cert of certifications) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: cert.name,
              bold: true,
              size: 20,
              font: "Calibri",
            }),
            new TextRun({
              text: ` — ${cert.issuer}, ${format(new Date(cert.issueDate), "MMM yyyy")}`,
              size: 20,
              color: "6b7280",
              font: "Calibri",
            }),
          ],
          spacing: { after: 40 },
        })
      );
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: { type: SectionType.CONTINUOUS },
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);

  const filename = resume?.name
    ? `${resume.name.replace(/[^a-zA-Z0-9-_ ]/g, "")}.docx`
    : `${(profile.fullName || "resume").replace(/\s+/g, "_")}_Resume.docx`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
