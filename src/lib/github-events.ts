// GitHub public events sync — no token required, uses /users/{username}/events.
// Pulls the last ~90 days of public activity (PushEvent, PullRequestEvent,
// IssuesEvent, ReleaseEvent) and aggregates into per-day auto worklog entries.

export type GhEvent = {
  externalId: string;     // stable per-event id
  date: Date;             // event timestamp
  kind: "push" | "pr" | "issue" | "release";
  repo: string;           // "org/repo"
  title: string;          // line summary
  url?: string;
  notable: boolean;       // e.g. PR merged, release
};

type RawGhEvent = {
  id: string;
  type: string;
  created_at: string;
  repo: { name: string };
  payload: Record<string, unknown>;
};

const SUPPORTED_TYPES = new Set([
  "PushEvent",
  "PullRequestEvent",
  "IssuesEvent",
  "ReleaseEvent",
]);

export async function fetchGitHubPublicEvents(username: string): Promise<GhEvent[]> {
  // Public endpoint — returns up to 90 days, paginated 30 per page (max 3 pages).
  const out: GhEvent[] = [];
  for (let page = 1; page <= 3; page++) {
    const res = await fetch(
      `https://api.github.com/users/${encodeURIComponent(username)}/events/public?per_page=30&page=${page}`,
      { headers: { Accept: "application/vnd.github+json", "User-Agent": "Resumsify" } }
    );
    if (!res.ok) {
      if (res.status === 404) throw new Error(`GitHub user "${username}" not found`);
      throw new Error(`GitHub API ${res.status}`);
    }
    const json = (await res.json()) as RawGhEvent[];
    if (!Array.isArray(json) || json.length === 0) break;
    for (const ev of json) {
      const mapped = mapEvent(ev);
      if (mapped) out.push(mapped);
    }
    if (json.length < 30) break;
  }
  return out;
}

function mapEvent(ev: RawGhEvent): GhEvent | null {
  if (!SUPPORTED_TYPES.has(ev.type)) return null;
  const date = new Date(ev.created_at);
  const repo = ev.repo?.name ?? "unknown";

  if (ev.type === "PushEvent") {
    const commits = (ev.payload.commits as Array<{ message: string; sha: string }> | undefined) ?? [];
    if (commits.length === 0) return null;
    const first = commits[0];
    const more = commits.length > 1 ? ` (+${commits.length - 1} more)` : "";
    return {
      externalId: `push:${ev.id}`,
      date,
      kind: "push",
      repo,
      title: `${repo}: ${first.message.split("\n")[0]}${more}`,
      notable: false,
    };
  }
  if (ev.type === "PullRequestEvent") {
    const action = ev.payload.action as string;
    const pr = ev.payload.pull_request as { title: string; html_url: string; merged: boolean; number: number } | undefined;
    if (!pr || (action !== "opened" && action !== "closed")) return null;
    const merged = pr.merged;
    const verb = merged ? "Merged" : action === "opened" ? "Opened" : "Closed";
    return {
      externalId: `pr:${ev.id}`,
      date,
      kind: "pr",
      repo,
      title: `${verb} PR #${pr.number} in ${repo}: ${pr.title}`,
      url: pr.html_url,
      notable: merged,
    };
  }
  if (ev.type === "IssuesEvent") {
    const action = ev.payload.action as string;
    const issue = ev.payload.issue as { title: string; html_url: string; number: number } | undefined;
    if (!issue || (action !== "opened" && action !== "closed")) return null;
    return {
      externalId: `issue:${ev.id}`,
      date,
      kind: "issue",
      repo,
      title: `${action === "opened" ? "Opened" : "Closed"} issue #${issue.number} in ${repo}: ${issue.title}`,
      url: issue.html_url,
      notable: false,
    };
  }
  if (ev.type === "ReleaseEvent") {
    const action = ev.payload.action as string;
    const release = ev.payload.release as { name: string; tag_name: string; html_url: string } | undefined;
    if (!release || action !== "published") return null;
    return {
      externalId: `release:${ev.id}`,
      date,
      kind: "release",
      repo,
      title: `Released ${release.name || release.tag_name} in ${repo}`,
      url: release.html_url,
      notable: true,
    };
  }
  return null;
}
