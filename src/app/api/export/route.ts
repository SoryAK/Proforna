import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth-utils";

function toCsv(headers: string[], rows: string[][]): string {
  const escape = (val: string) => {
    if (val.includes(",") || val.includes('"') || val.includes("\n")) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };
  const lines = [headers.map(escape).join(",")];
  for (const row of rows) {
    lines.push(row.map((v) => escape(v ?? "")).join(","));
  }
  return lines.join("\n");
}

export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");

  let csv = "";
  let filename = "export.csv";

  switch (type) {
    case "applications": {
      const data = await prisma.jobApplication.findMany({ orderBy: { updatedAt: "desc" } });
      csv = toCsv(
        ["Company", "Role", "Status", "Type", "Location", "Salary Min", "Salary Max", "Currency", "Applied Date", "URL", "Notes"],
        data.map((a) => [
          a.company, a.role, a.status, a.type, a.location || "", 
          a.salaryMin?.toString() || "", a.salaryMax?.toString() || "", a.currency,
          a.appliedDate ? a.appliedDate.toISOString().slice(0, 10) : "", a.url || "", a.notes || "",
        ])
      );
      filename = "applications.csv";
      break;
    }
    case "interviews": {
      const data = await prisma.interview.findMany({
        include: { jobApplication: true },
        orderBy: { scheduledAt: "desc" },
      });
      csv = toCsv(
        ["Company", "Role", "Type", "Status", "Scheduled At", "Duration (min)", "Interviewer", "Rating", "Location", "Notes"],
        data.map((i) => [
          i.jobApplication.company, i.jobApplication.role, i.type, i.status,
          i.scheduledAt.toISOString(), i.durationMinutes?.toString() || "",
          i.interviewerName || "", i.rating?.toString() || "", i.location || "", i.notes || "",
        ])
      );
      filename = "interviews.csv";
      break;
    }
    case "contacts": {
      const data = await prisma.contact.findMany({ orderBy: { name: "asc" } });
      csv = toCsv(
        ["Name", "Email", "Phone", "Company", "Role", "Relationship", "LinkedIn", "Last Contacted", "Notes"],
        data.map((c) => [
          c.name, c.email || "", c.phone || "", c.company || "", c.role || "",
          c.relationship, c.linkedinUrl || "",
          c.lastContactedAt ? c.lastContactedAt.toISOString().slice(0, 10) : "", c.notes || "",
        ])
      );
      filename = "contacts.csv";
      break;
    }
    case "skills": {
      const data = await prisma.skill.findMany({ orderBy: { name: "asc" } });
      csv = toCsv(
        ["Name", "Category", "Proficiency"],
        data.map((s) => [s.name, s.category, s.proficiency])
      );
      filename = "skills.csv";
      break;
    }
    case "goals": {
      const data = await prisma.careerGoal.findMany({ include: { milestones: true }, orderBy: { createdAt: "desc" } });
      csv = toCsv(
        ["Title", "Description", "Status", "Priority", "Target Date", "Milestones Total", "Milestones Done"],
        data.map((g) => [
          g.title, g.description || "", g.status, g.priority,
          g.targetDate ? g.targetDate.toISOString().slice(0, 10) : "",
          g.milestones.length.toString(),
          g.milestones.filter((m) => m.completed).length.toString(),
        ])
      );
      filename = "goals.csv";
      break;
    }
    case "full-json": {
      const [applications, interviews, contacts, skills, goals, certifications] = await Promise.all([
        prisma.jobApplication.findMany({ orderBy: { updatedAt: "desc" } }),
        prisma.interview.findMany({ include: { jobApplication: { select: { company: true, role: true } } }, orderBy: { scheduledAt: "desc" } }),
        prisma.contact.findMany({ orderBy: { name: "asc" } }),
        prisma.skill.findMany({ orderBy: { name: "asc" } }),
        prisma.careerGoal.findMany({ include: { milestones: true }, orderBy: { createdAt: "desc" } }),
        prisma.certification.findMany({ orderBy: { issueDate: "desc" } }),
      ]);
      const json = JSON.stringify({ exportedAt: new Date().toISOString(), applications, interviews, contacts, skills, goals, certifications }, null, 2);
      return new NextResponse(json, {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="resumsify-backup-${new Date().toISOString().slice(0, 10)}.json"`,
        },
      });
    }
    default:
      return NextResponse.json({ error: "Invalid type. Use: applications, interviews, contacts, skills, goals, full-json" }, { status: 400 });
  }

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
