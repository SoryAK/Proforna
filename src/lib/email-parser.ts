/**
 * Email Lead Parser — extracts structured job data from job-site email alerts.
 *
 * Supports: Indeed, LinkedIn, Glassdoor, ZipRecruiter, Dice, Google Alerts
 * Each parser returns an array of ParsedLead objects from a single email body.
 */

export interface ParsedLead {
  title: string;
  company: string;
  location: string;
  salaryMin: number | null;
  salaryMax: number | null;
  applyUrl: string | null;
  source: string;
  description: string;
}

/* ── Helpers ── */

/** Decode MIME quoted-printable encoding (=3D → =, soft line breaks, etc.) */
function decodeQuotedPrintable(text: string): string {
  return text
    .replace(/=\r?\n/g, "")  // Remove soft line breaks
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex: string) =>
      String.fromCharCode(parseInt(hex, 16))
    );
}

/** Strip HTML tags → plain text */
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&#\d+;/g, "").replace(/\s+/g, " ").trim();
}

/** Extract salary numbers from a string like "$60,000 - $80,000" or "$25/hr" */
function parseSalary(text: string): { min: number | null; max: number | null } {
  if (!text) return { min: null, max: null };
  // Match dollar amounts: $60,000 or $25 or $120K
  const nums = text.match(/\$[\d,]+(?:\.\d+)?[kK]?/g) ?? [];
  const values = nums.map((n) => {
    let v = Number(n.replace(/[$,]/g, ""));
    if (/[kK]/.test(n)) v *= 1000;
    // If value < 200, likely hourly — annualize (×2080)
    if (v > 0 && v < 200) v *= 2080;
    return v;
  }).filter((v) => v > 0);

  if (values.length >= 2) return { min: values[0], max: values[1] };
  if (values.length === 1) return { min: values[0], max: null };
  return { min: null, max: null };
}

/** Generate a stable dedup hash from title + company + location */
export function dedupeHash(title: string, company: string, location: string): string {
  const raw = `${title}|${company}|${location}`.toLowerCase().replace(/\s+/g, " ").trim();
  // Simple hash — no crypto needed for dedup
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const chr = raw.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

/* ── Source Detection ── */

const SOURCE_PATTERNS: Record<string, RegExp[]> = {
  indeed: [/indeed\.com/i, /from:.*indeed/i, /noreply@indeed/i, /jobs that may interest you/i],
  linkedin: [/linkedin\.com/i, /from:.*linkedin/i, /jobs for you/i, /new job opportunities/i],
  glassdoor: [/glassdoor\.com/i, /from:.*glassdoor/i],
  ziprecruiter: [/ziprecruiter\.com/i, /from:.*ziprecruiter/i, /jobs matched/i],
  dice: [/dice\.com/i, /from:.*dice/i],
  google: [/jobs\.google\.com/i, /google\.com\/about\/careers/i],
};

export function detectSource(emailBody: string): string {
  for (const [source, patterns] of Object.entries(SOURCE_PATTERNS)) {
    if (patterns.some((p) => p.test(emailBody))) return source;
  }
  return "other";
}

/* ── Per-source Parsers ── */

/**
 * Indeed email structure:
/**
 * Indeed email structure (real format):
 * Table-based layout. Each job is a block that starts with an <a> to
 * indeed.com/pagead/clk or /viewjob or /rc/clk, followed by separate
 * table cells / paragraphs for company, rating, location, salary, description.
 *
 * Quoted-printable encoding is decoded BEFORE this runs.
 */
function parseIndeed(html: string): ParsedLead[] {
  const leads: ParsedLead[] = [];

  // Find all Indeed job links (pagead, viewjob, rc/clk, jk=)
  const jobLinkRe = /<a[^>]+href="([^"]*(?:indeed\.com|indeed\.co)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  const allLinks = [...html.matchAll(jobLinkRe)];

  // Filter to actual job links only
  const jobLinks = allLinks.filter(m => {
    const url = m[1];
    const text = stripHtml(m[2]);
    if (/unsubscribe|manage\s*alert|view\s*all|sign\s*in|privacy|terms|see\s*all|update|settings|logo/i.test(text)) return false;
    if (text.length < 3 || text.length > 150) return false;
    // Must be a job URL pattern
    return /pagead|viewjob|rc\/clk|jk=/i.test(url);
  });

  for (let i = 0; i < jobLinks.length; i++) {
    const match = jobLinks[i];
    const url = match[1];
    const rawTitle = stripHtml(match[2]);

    // Grab the block of HTML between this job link and the next one (or 3000 chars)
    const linkEnd = html.indexOf(match[0]) + match[0].length;
    const nextLinkStart = i + 1 < jobLinks.length
      ? html.indexOf(jobLinks[i + 1][0])
      : linkEnd + 3000;
    const blockHtml = html.slice(linkEnd, Math.min(nextLinkStart, linkEnd + 3000));
    const blockText = stripHtml(blockHtml);

    // ── Extract location: "City, ST" or "City, ST 12345" ──
    let location = "";
    const locMatch = blockText.match(
      /([A-Z][a-zA-Z'-]+(?:\s[A-Z][a-zA-Z'-]+)*,\s*[A-Z]{2}(?:\s+\d{5})?)/
    );
    if (locMatch) location = locMatch[1];

    // ── Extract company: text between title and location ──
    let company = "";
    if (location) {
      const locIdx = blockText.indexOf(location);
      const before = blockText.slice(0, locIdx).trim();
      // Clean out rating numbers like "2.98" or "4.1 out of 5 stars"
      const cleaned = before
        .replace(/\d+\.\d+\s*(out of \d+\s*stars?)?/gi, "")
        .replace(/\s+/g, " ")
        .trim();
      // Split on big gaps / separators — company is typically the first (or biggest) chunk
      const parts = cleaned.split(/\s{2,}|[|·]/).map(s => s.trim()).filter(s => s.length > 1);
      company = parts[0] || "";
    } else {
      // No location found — still try to grab company from first chunk
      const parts = blockText.split(/\s{2,}/).map(s => s.trim()).filter(s => s.length > 1 && s.length < 100);
      company = parts[0] || "";
    }

    // ── Extract salary ──
    const salary = parseSalary(blockText.slice(0, 500));

    // ── Extract description snippet ──
    let description = "";
    const descChunks = blockText.split(/\s{2,}/).filter(s => s.length > 30);
    // Find the first long chunk that isn't the company/location/salary
    for (const chunk of descChunks) {
      if (chunk.includes(company) || chunk === location) continue;
      if (/^\$[\d,]/.test(chunk)) continue; // salary line
      if (/easily apply|apply now/i.test(chunk)) continue;
      description = chunk;
      break;
    }

    if (rawTitle && (company || location)) {
      leads.push({
        title: rawTitle,
        company: company.slice(0, 100),
        location: location.slice(0, 100),
        salaryMin: salary.min,
        salaryMax: salary.max,
        applyUrl: url.startsWith("http") ? url : `https://www.indeed.com${url}`,
        source: "indeed",
        description: description.slice(0, 300),
      });
    }
  }

  return leads;
}

/**
 * LinkedIn email structure:
 * Job alerts contain cards with: job title, company, location, sometimes via badge
 * Links go to linkedin.com/comm/jobs/view/... or linkedin.com/jobs/view/...
 */
function parseLinkedIn(html: string): ParsedLead[] {
  const leads: ParsedLead[] = [];

  const jobBlockPattern = /<a[^>]+href="([^"]*linkedin\.com[^"]*(?:jobs\/view|jobs\/collections)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  const blocks = [...html.matchAll(jobBlockPattern)];

  for (const match of blocks) {
    const url = match[1];
    const blockHtml = match[2];
    const blockText = stripHtml(blockHtml);

    // Split the block text — LinkedIn often has "Title Company Location" vertically
    const parts = blockText.split(/\s{2,}/).map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) continue;

    const rawTitle = parts[0];
    if (/unsubscribe|view all|manage/i.test(rawTitle)) continue;
    if (rawTitle.length < 3 || rawTitle.length > 150) continue;

    const company = parts[1] || "";
    const location = parts[2] || "";

    const salary = parseSalary(blockText);

    if (rawTitle) {
      leads.push({
        title: rawTitle,
        company: company.slice(0, 100),
        location: location.slice(0, 100),
        salaryMin: salary.min,
        salaryMax: salary.max,
        applyUrl: url,
        source: "linkedin",
        description: "",
      });
    }
  }

  return leads;
}

/**
 * Glassdoor email structure:
 * Job alerts with links to glassdoor.com/job-listing/... or glassdoor.com/partner/...
 */
function parseGlassdoor(html: string): ParsedLead[] {
  const leads: ParsedLead[] = [];

  const jobBlockPattern = /<a[^>]+href="([^"]*glassdoor\.com[^"]*(?:job-listing|partner|Job)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  const blocks = [...html.matchAll(jobBlockPattern)];

  for (const match of blocks) {
    const url = match[1];
    const blockText = stripHtml(match[2]);
    const parts = blockText.split(/\s{2,}/).map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) continue;

    const rawTitle = parts[0];
    if (/unsubscribe|view|manage|sign/i.test(rawTitle)) continue;
    if (rawTitle.length < 3 || rawTitle.length > 150) continue;

    const company = parts[1] || "";
    const location = parts[2] || "";
    const salary = parseSalary(blockText);

    if (rawTitle) {
      leads.push({
        title: rawTitle,
        company: company.slice(0, 100),
        location: location.slice(0, 100),
        salaryMin: salary.min,
        salaryMax: salary.max,
        applyUrl: url,
        source: "glassdoor",
        description: "",
      });
    }
  }

  return leads;
}

/**
 * ZipRecruiter email structure:
 * Links to ziprecruiter.com/... with job title in anchor text
 */
function parseZipRecruiter(html: string): ParsedLead[] {
  const leads: ParsedLead[] = [];

  const jobBlockPattern = /<a[^>]+href="([^"]*ziprecruiter\.com[^"]*(?:\/jobs\/|\/c\/)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  const blocks = [...html.matchAll(jobBlockPattern)];

  for (const match of blocks) {
    const url = match[1];
    const blockText = stripHtml(match[2]);
    const parts = blockText.split(/\s{2,}/).map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) continue;

    const rawTitle = parts[0];
    if (/unsubscribe|view|manage|sign/i.test(rawTitle)) continue;
    if (rawTitle.length < 3 || rawTitle.length > 150) continue;

    const company = parts[1] || "";
    const location = parts[2] || "";
    const salary = parseSalary(blockText);

    if (rawTitle) {
      leads.push({
        title: rawTitle,
        company: company.slice(0, 100),
        location: location.slice(0, 100),
        salaryMin: salary.min,
        salaryMax: salary.max,
        applyUrl: url,
        source: "ziprecruiter",
        description: "",
      });
    }
  }

  return leads;
}

/**
 * Generic fallback parser — attempts to extract job-like data from any email.
 * Looks for patterns: linked text + "City, ST" locations + salary patterns
 */
function parseGeneric(html: string): ParsedLead[] {
  const leads: ParsedLead[] = [];

  // Find all links that might be job postings (exclude common non-job links)
  const linkPattern = /<a[^>]+href="([^"]+)"[^>]*>([^<]{5,100})<\/a>/gi;
  const matches = [...html.matchAll(linkPattern)];

  for (const match of matches) {
    const url = match[1];
    const linkText = stripHtml(match[2]);

    // Skip obviously non-job links
    if (/unsubscribe|manage|privacy|terms|view in browser|logo|update|settings|help/i.test(linkText)) continue;
    if (!/^https?:\/\//.test(url)) continue;

    // Must look like a reasonable job title (3+ words, starts with capital)
    const words = linkText.split(/\s+/);
    if (words.length < 2 || words.length > 15) continue;
    if (!/^[A-Z]/.test(linkText)) continue;

    // Look for surrounding context
    const idx = html.indexOf(match[0]);
    const surrounding = stripHtml(html.slice(idx, idx + 500));

    // Find company and location patterns
    const locMatch = surrounding.match(/([A-Z][a-z]+(?:\s[A-Z][a-z]+)*,\s*[A-Z]{2}(?:\s+\d{5})?)/);
    const salary = parseSalary(surrounding.slice(0, 300));

    // Extract a company name — often appears near the title
    const afterTitle = surrounding.slice(linkText.length).trim();
    const companyMatch = afterTitle.match(/^([A-Z][A-Za-z\s&.,'-]+?)(?:\s[-–·|]\s|\s{2,}|$)/);

    leads.push({
      title: linkText,
      company: companyMatch?.[1]?.slice(0, 100) || "",
      location: locMatch?.[1]?.slice(0, 100) || "",
      salaryMin: salary.min,
      salaryMax: salary.max,
      applyUrl: url,
      source: "other",
      description: "",
    });
  }

  // Deduplicate by title (generic parser can be noisy)
  const seen = new Set<string>();
  return leads.filter((l) => {
    const key = l.title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/* ── Main Entry Point ── */

const SOURCE_PARSERS: Record<string, (html: string) => ParsedLead[]> = {
  indeed: parseIndeed,
  linkedin: parseLinkedIn,
  glassdoor: parseGlassdoor,
  ziprecruiter: parseZipRecruiter,
};

/**
 * Parse an email body (HTML or plain text) into structured job leads.
 * Auto-detects the source and applies the appropriate parser.
 * Falls back to generic parsing if source-specific parser yields no results.
 */
export function parseJobEmail(emailBody: string): ParsedLead[] {
  // Decode MIME quoted-printable if the body looks encoded (=3D, =20, etc.)
  let html = emailBody;
  if (/=[0-9A-Fa-f]{2}/.test(html)) {
    html = decodeQuotedPrintable(html);
  }

  const source = detectSource(html);
  const parser = SOURCE_PARSERS[source];

  let leads: ParsedLead[] = [];

  if (parser) {
    leads = parser(html);
  }

  // Fallback to generic if source parser found nothing
  if (leads.length === 0) {
    leads = parseGeneric(html);
  }

  // Final cleanup — remove leads with no title
  return leads.filter((l) => l.title.length >= 3);
}
