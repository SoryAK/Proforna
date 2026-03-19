import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Link,
} from "@react-pdf/renderer";
import { format } from "date-fns";

/* ── Styles ── */

const colors = {
  primary: "#e8740c",
  dark: "#1a1a1a",
  muted: "#6b7280",
  light: "#f3f4f6",
  border: "#d1d5db",
  white: "#ffffff",
};

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    padding: 40,
    color: colors.dark,
    lineHeight: 1.4,
  },
  // Header
  header: { marginBottom: 16 },
  name: { fontSize: 22, fontFamily: "Helvetica-Bold", marginBottom: 2, color: colors.dark },
  headline: { fontSize: 11, color: colors.muted, marginBottom: 6 },
  contactRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  contactItem: { fontSize: 9, color: colors.muted },
  contactLink: { fontSize: 9, color: colors.primary, textDecoration: "none" },
  // Section
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: colors.primary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 3,
    marginBottom: 8,
    marginTop: 14,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  // Experience
  expHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },
  expRole: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  expCompany: { fontSize: 10, color: colors.muted, marginBottom: 2 },
  expDate: { fontSize: 9, color: colors.muted },
  expDesc: { fontSize: 9.5, color: colors.dark, marginTop: 3, lineHeight: 1.5 },
  expItem: { marginBottom: 10 },
  // Skills
  skillsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  skillCategory: { marginBottom: 6 },
  skillCatLabel: { fontSize: 9, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  skillBadge: {
    fontSize: 8.5,
    backgroundColor: colors.light,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    marginRight: 4,
    marginBottom: 3,
  },
  skillRow: { flexDirection: "row", flexWrap: "wrap" },
  // Certs
  certItem: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  certName: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  certIssuer: { fontSize: 9, color: colors.muted },
  certDate: { fontSize: 9, color: colors.muted },
  // Summary
  summary: { fontSize: 10, color: colors.dark, lineHeight: 1.6 },
});

/* ── Types ── */

interface ResumeData {
  profile: {
    fullName: string;
    headline: string;
    email: string;
    phone: string;
    city: string;
    state: string;
    linkedinUrl: string;
    githubUrl: string;
    portfolioUrl: string;
    bio: string;
  };
  experience: {
    company: string;
    role: string;
    department: string | null;
    location: string | null;
    type: string;
    startDate: string;
    endDate: string | null;
    isActive: boolean;
    techStack: string | null;
    description: string | null;
    responsibilities: string | null;
  }[];
  skills: {
    name: string;
    category: string;
    proficiency: string;
  }[];
  certifications: {
    name: string;
    issuer: string;
    issueDate: string;
    expiryDate: string | null;
  }[];
  targetRole: string | null;
}

/* ── Helpers ── */

function formatDateRange(start: string, end: string | null): string {
  const s = format(new Date(start), "MMM yyyy");
  const e = end ? format(new Date(end), "MMM yyyy") : "Present";
  return `${s} — ${e}`;
}

function stripUrl(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
}

const CATEGORY_LABELS: Record<string, string> = {
  technical: "Technical",
  soft: "Soft Skills",
  language: "Languages",
  tool: "Tools",
};

/* ── Document ── */

export function ResumePdfDocument({ data }: { data: ResumeData }) {
  const { profile, experience, skills, certifications } = data;

  // Group skills by category
  const skillsByCategory = skills.reduce<Record<string, typeof skills>>((acc, s) => {
    const cat = s.category || "technical";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(s);
    return acc;
  }, {});

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.name}>{profile.fullName}</Text>
          {profile.headline && <Text style={styles.headline}>{profile.headline}</Text>}
          <View style={styles.contactRow}>
            {profile.email && <Text style={styles.contactItem}>{profile.email}</Text>}
            {profile.phone && <Text style={styles.contactItem}>{profile.phone}</Text>}
            {(profile.city || profile.state) && (
              <Text style={styles.contactItem}>
                {[profile.city, profile.state].filter(Boolean).join(", ")}
              </Text>
            )}
            {profile.linkedinUrl && (
              <Link src={profile.linkedinUrl} style={styles.contactLink}>
                {stripUrl(profile.linkedinUrl)}
              </Link>
            )}
            {profile.githubUrl && (
              <Link src={profile.githubUrl} style={styles.contactLink}>
                {stripUrl(profile.githubUrl)}
              </Link>
            )}
            {profile.portfolioUrl && (
              <Link src={profile.portfolioUrl} style={styles.contactLink}>
                {stripUrl(profile.portfolioUrl)}
              </Link>
            )}
          </View>
        </View>

        {/* Summary */}
        {profile.bio && (
          <View>
            <Text style={styles.sectionTitle}>Summary</Text>
            <Text style={styles.summary}>{profile.bio}</Text>
          </View>
        )}

        {/* Experience */}
        {experience.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>Experience</Text>
            {experience.map((exp, i) => (
              <View key={i} style={styles.expItem} wrap={false}>
                <View style={styles.expHeader}>
                  <Text style={styles.expRole}>{exp.role}</Text>
                  <Text style={styles.expDate}>
                    {formatDateRange(exp.startDate, exp.endDate)}
                  </Text>
                </View>
                <Text style={styles.expCompany}>
                  {exp.company}
                  {exp.department ? ` · ${exp.department}` : ""}
                  {exp.location ? ` · ${exp.location}` : ""}
                </Text>
                {exp.description && (
                  <Text style={styles.expDesc}>{exp.description}</Text>
                )}
                {exp.responsibilities && (
                  <Text style={styles.expDesc}>
                    {exp.responsibilities
                      .split(/[,\n]/)
                      .map((r) => r.trim())
                      .filter(Boolean)
                      .map((r) => `• ${r}`)
                      .join("\n")}
                  </Text>
                )}
                {exp.techStack && (
                  <Text style={{ ...styles.expDesc, color: colors.muted, fontSize: 9 }}>
                    Tech: {exp.techStack}
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Skills */}
        {skills.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>Skills</Text>
            {Object.entries(skillsByCategory).map(([cat, items]) => (
              <View key={cat} style={styles.skillCategory}>
                <Text style={styles.skillCatLabel}>
                  {CATEGORY_LABELS[cat] || cat}
                </Text>
                <View style={styles.skillRow}>
                  {items.map((s) => (
                    <Text key={s.name} style={styles.skillBadge}>
                      {s.name}
                    </Text>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Certifications */}
        {certifications.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>Certifications</Text>
            {certifications.map((c, i) => (
              <View key={i} style={styles.certItem} wrap={false}>
                <View>
                  <Text style={styles.certName}>{c.name}</Text>
                  <Text style={styles.certIssuer}>{c.issuer}</Text>
                </View>
                <Text style={styles.certDate}>
                  {format(new Date(c.issueDate), "MMM yyyy")}
                </Text>
              </View>
            ))}
          </View>
        )}
      </Page>
    </Document>
  );
}
