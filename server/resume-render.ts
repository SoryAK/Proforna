import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { ResumeRevision } from "../core/index";

export async function renderResumePdf(
  revision: ResumeRevision,
): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.setTitle(`${revision.title} — ${revision.targetRole}`);
  document.setAuthor(revision.title);
  const created = new Date(revision.createdAt);
  document.setCreationDate(created);
  document.setModificationDate(created);
  const font = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  let page = document.addPage([612, 792]);
  let y = 742;

  const write = (
    text: string,
    options: { size?: number; bold?: boolean; gap?: number } = {},
  ) => {
    const size = options.size ?? 10;
    const lines = wrap(text, options.bold ? bold : font, size, 500);
    for (const line of lines) {
      if (y < 55) {
        page = document.addPage([612, 792]);
        y = 742;
      }
      page.drawText(line, {
        x: 56,
        y,
        size,
        font: options.bold ? bold : font,
        color: rgb(0.12, 0.11, 0.1),
      });
      y -= size * 1.35;
    }
    y -= options.gap ?? 4;
  };

  write(revision.title, { size: 24, bold: true, gap: 2 });
  write(revision.targetRole, { size: 12, gap: 16 });
  if (revision.summary.length) {
    write("PROFILE", { size: 9, bold: true, gap: 6 });
    revision.summary.forEach((claim) => write(claim.text, { gap: 6 }));
    y -= 6;
  }
  for (const role of revision.experience) {
    write(role.title, { size: 13, bold: true, gap: 1 });
    write([role.organization, role.span].filter(Boolean).join(" · "), {
      size: 9,
      gap: 7,
    });
    role.claims.forEach((claim) => write(`• ${claim.text}`, { gap: 4 }));
    y -= 7;
  }
  if (revision.skills.length) {
    write("SKILLS", { size: 9, bold: true, gap: 6 });
    write(revision.skills.map((skill) => skill.text).join(" · "));
  }
  return document.save({ useObjectStreams: false });
}

export async function renderResumeDocx(
  revision: ResumeRevision,
): Promise<Uint8Array> {
  const children: Paragraph[] = [
    new Paragraph({
      text: revision.title,
      heading: HeadingLevel.TITLE,
    }),
    new Paragraph({
      children: [new TextRun({ text: revision.targetRole, bold: true })],
    }),
  ];
  if (revision.summary.length) {
    children.push(
      new Paragraph({ text: "Profile", heading: HeadingLevel.HEADING_1 }),
      ...revision.summary.map((claim) => new Paragraph(claim.text)),
    );
  }
  for (const role of revision.experience) {
    children.push(
      new Paragraph({
        text: role.title,
        heading: HeadingLevel.HEADING_1,
      }),
      new Paragraph(
        [role.organization, role.span].filter(Boolean).join(" · "),
      ),
      ...role.claims.map(
        (claim) =>
          new Paragraph({ text: claim.text, bullet: { level: 0 } }),
      ),
    );
  }
  if (revision.skills.length) {
    children.push(
      new Paragraph({ text: "Skills", heading: HeadingLevel.HEADING_1 }),
      new Paragraph(revision.skills.map((skill) => skill.text).join(" · ")),
    );
  }
  const document = new Document({
    creator: revision.title,
    title: `${revision.title} — ${revision.targetRole}`,
    description: `Proforna resume revision ${revision.revisionNumber}`,
    sections: [{ children }],
  });
  return new Uint8Array(await Packer.toBuffer(document));
}

function wrap(
  text: string,
  font: { widthOfTextAtSize(text: string, size: number): number },
  size: number,
  width: number,
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(next, size) > width) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}
