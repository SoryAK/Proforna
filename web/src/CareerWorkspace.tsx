import { useEffect, useState, type FormEvent } from "react";
import type { HomePage } from "./HomeNav";
import "./career-workspace.css";

type WorklogEntry = {
  id: string;
  occurredOn: string;
  title: string;
  content: string;
  project: string;
  tags: string[];
};

type ChangeSet = { id: string; purpose: string };

type ResumeRevision = {
  id: string;
  revisionNumber: number;
  title: string;
  targetRole: string;
  summary: Array<{ text: string }>;
  experience: Array<{
    title: string;
    organization: string;
    span: string;
    claims: Array<{ text: string }>;
  }>;
  skills: Array<{ text: string }>;
  pinnedFacts: Array<{ factId: string; version: number }>;
};

type ResumeVariant = {
  id: string;
  name: string;
  targetRole: string;
  audience: string;
  intent: string;
  revisions: ResumeRevision[];
};

export function CareerWorkspace({ page }: { page: HomePage }) {
  if (page === "worklog") return <WorklogPage />;
  if (page === "resumes") return <ResumeStudioPage />;
  if (page === "opportunities") return <OpportunitiesPage />;
  if (page === "network") return <NetworkPage />;
  if (page === "documents") return <DocumentsPage />;
  return null;
}

type VaultDocument = {
  id: string;
  originalName: string;
  mediaType: string;
  sizeBytes: number;
  category: string;
  createdAt: string;
};

type Integration = {
  id: string;
  kind: string;
  label: string;
  status: string;
};

function DocumentsPage() {
  const [documents, setDocuments] = useState<VaultDocument[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [kind, setKind] = useState("calendar");
  const [label, setLabel] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    const [documentsResponse, integrationsResponse] = await Promise.all([
      fetch("/api/documents"),
      fetch("/api/integrations"),
    ]);
    setDocuments(
      ((await documentsResponse.json()) as { documents: VaultDocument[] })
        .documents,
    );
    setIntegrations(
      ((await integrationsResponse.json()) as { integrations: Integration[] })
        .integrations,
    );
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/documents", {
      method: "POST",
      body: form,
    });
    setMessage(response.ok ? "Document stored and registered as evidence." : "Could not store that document.");
    if (response.ok) {
      event.currentTarget.reset();
      await load();
    }
  }

  async function restore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch("/api/portability/restore", {
      method: "POST",
      body: new FormData(event.currentTarget),
    });
    setMessage(response.ok ? "Portable archive restored." : "That archive could not be verified.");
    if (response.ok) await load();
  }

  async function connect(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/integrations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, label, config: {} }),
    });
    setMessage(response.ok ? "Adapter metadata configured." : "Could not configure that adapter.");
    if (response.ok) {
      setLabel("");
      await load();
    }
  }

  return (
    <section className="career-page documents-page">
      <h1>My Docs</h1>
      <p className="career-lead">
        Keep source material in the local vault, attach it to Career Memory,
        and take the full archive with you at any time.
      </p>
      <div className="documents-grid">
        <main>
          <form className="document-upload" onSubmit={upload}>
            <input required type="file" name="file" />
            <select name="category" defaultValue="evidence">
              <option value="evidence">Evidence</option>
              <option value="resume">Resume</option>
              <option value="offer">Offer</option>
              <option value="certificate">Certificate</option>
            </select>
            <button type="submit">Store document</button>
          </form>
          <div className="document-list">
            {documents.map((document) => (
              <a href={`/api/documents/${document.id}`} key={document.id}>
                <div>
                  <strong>{document.originalName}</strong>
                  <span>{document.category} · {Math.ceil(document.sizeBytes / 1024)} KB</span>
                </div>
                <small>Download</small>
              </a>
            ))}
          </div>
        </main>
        <aside>
          <section className="portable-card">
            <h2>Portable vault</h2>
            <p>Includes career data, audit records, and stored files with checksums.</p>
            <a href="/api/portability/export">Export full archive</a>
            <form onSubmit={restore}>
              <input required type="file" name="archive" accept=".zip,application/zip" />
              <button type="submit">Restore archive</button>
            </form>
          </section>
          <form className="compact-career-form" onSubmit={connect}>
            <h2>Integration adapters</h2>
            <select value={kind} onChange={(event) => setKind(event.target.value)}>
              <option value="calendar">Calendar</option>
              <option value="email">Email</option>
              <option value="job-board">Job board</option>
            </select>
            <input required value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Connection label" />
            <button type="submit">Configure adapter</button>
            {integrations.map((integration) => (
              <small key={integration.id}>{integration.label} · {integration.kind}</small>
            ))}
          </form>
        </aside>
      </div>
      {message ? <p className="career-message">{message}</p> : null}
    </section>
  );
}

type CareerManagement = {
  opportunities: Array<{
    id: string;
    title: string;
    organization: string;
    fit_summary: string;
    status: string;
  }>;
  applications: Array<{
    id: string;
    opportunity_id: string;
    stage: string;
    next_step: string;
  }>;
  contacts: Array<{
    id: string;
    name: string;
    organization: string;
    role: string;
    email: string;
  }>;
  plans: Array<{
    id: string;
    title: string;
    outcome: string;
    horizon: string;
    tasks: unknown[];
  }>;
  actions: Array<{ id: string; kind: string; status: string; destination: string }>;
};

function OpportunitiesPage() {
  const [data, setData] = useState<CareerManagement | null>(null);
  const [title, setTitle] = useState("");
  const [organization, setOrganization] = useState("");
  const [fitSummary, setFitSummary] = useState("");
  const [planTitle, setPlanTitle] = useState("");
  const [planOutcome, setPlanOutcome] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    const response = await fetch("/api/career-management");
    setData((await response.json()) as CareerManagement);
  }

  async function saveOpportunity(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/opportunities", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "role", title, organization, fitSummary }),
    });
    setMessage(response.ok ? "Opportunity saved." : "Check the role and organization.");
    if (response.ok) {
      setTitle("");
      setOrganization("");
      setFitSummary("");
      await load();
    }
  }

  async function startApplication(opportunityId: string) {
    await fetch(`/api/opportunities/${opportunityId}/applications`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nextStep: "Choose a resume revision" }),
    });
    await load();
  }

  async function transition(applicationId: string, stage: string) {
    const response = await fetch(`/api/applications/${applicationId}/transition`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stage }),
    });
    setMessage(
      response.ok
        ? `Application moved to ${stage}.`
        : "That stage does not follow the current one.",
    );
    await load();
  }

  async function savePlan(event: FormEvent) {
    event.preventDefault();
    await fetch("/api/plans", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: planTitle,
        outcome: planOutcome,
        horizon: "90 days",
      }),
    });
    setPlanTitle("");
    setPlanOutcome("");
    await load();
  }

  return (
    <section className="career-page opportunities-page">
      <h1>Opportunities</h1>
      <p className="career-lead">
        Keep roles, applications, next steps, and career plans in one governed
        operating loop.
      </p>
      <div className="opportunity-grid">
        <main>
          {(data?.opportunities ?? []).map((opportunity) => {
            const application = data?.applications.find(
              (item) => item.opportunity_id === opportunity.id,
            );
            return (
              <article className="opportunity-card" key={opportunity.id}>
                <span>{opportunity.status}</span>
                <h2>{opportunity.title}</h2>
                <h3>{opportunity.organization}</h3>
                <p>{opportunity.fit_summary}</p>
                {application ? (
                  <div className="application-state">
                    <strong>{application.stage}</strong>
                    <select
                      value={application.stage}
                      onChange={(event) =>
                        void transition(application.id, event.target.value)
                      }
                    >
                      <option value={application.stage}>Current stage</option>
                      <option value="submitted">Submitted</option>
                      <option value="screen">Screen</option>
                      <option value="interview">Interview</option>
                      <option value="offer">Offer</option>
                      <option value="accepted">Accepted</option>
                      <option value="rejected">Rejected</option>
                      <option value="withdrawn">Withdrawn</option>
                    </select>
                  </div>
                ) : (
                  <button onClick={() => void startApplication(opportunity.id)}>
                    Start application
                  </button>
                )}
              </article>
            );
          })}
          {!data?.opportunities.length ? (
            <p className="career-empty">Save a role to begin the pursuit loop.</p>
          ) : null}
        </main>
        <aside>
          <form className="compact-career-form" onSubmit={saveOpportunity}>
            <h2>Save a role</h2>
            <input
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Role title"
            />
            <input
              required
              value={organization}
              onChange={(event) => setOrganization(event.target.value)}
              placeholder="Organization"
            />
            <textarea
              value={fitSummary}
              onChange={(event) => setFitSummary(event.target.value)}
              placeholder="Why this fits"
            />
            <button type="submit">Save opportunity</button>
          </form>
          <form className="compact-career-form" onSubmit={savePlan}>
            <h2>Career plan</h2>
            <input
              required
              value={planTitle}
              onChange={(event) => setPlanTitle(event.target.value)}
              placeholder="Plan title"
            />
            <textarea
              value={planOutcome}
              onChange={(event) => setPlanOutcome(event.target.value)}
              placeholder="Desired outcome"
            />
            <button type="submit">Create plan</button>
            {(data?.plans ?? []).map((plan) => (
              <small key={plan.id}>{plan.title} · {plan.horizon}</small>
            ))}
          </form>
        </aside>
      </div>
      {message ? <p className="career-message">{message}</p> : null}
    </section>
  );
}

function NetworkPage() {
  const [data, setData] = useState<CareerManagement | null>(null);
  const [name, setName] = useState("");
  const [organization, setOrganization] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    const response = await fetch("/api/career-management");
    setData((await response.json()) as CareerManagement);
  }

  async function saveContact(event: FormEvent) {
    event.preventDefault();
    await fetch("/api/contacts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, organization, role, email }),
    });
    setName("");
    setOrganization("");
    setRole("");
    setEmail("");
    await load();
  }

  return (
    <section className="career-page network-page">
      <h1>My Network</h1>
      <p className="career-lead">
        Keep relationship context private. Outreach remains a draft until the
        exact destination and message are approved.
      </p>
      <form className="compact-career-form network-form" onSubmit={saveContact}>
        <input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Name" />
        <input value={organization} onChange={(event) => setOrganization(event.target.value)} placeholder="Organization" />
        <input value={role} onChange={(event) => setRole(event.target.value)} placeholder="Role" />
        <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" />
        <button type="submit">Add contact</button>
      </form>
      <div className="contact-list">
        {(data?.contacts ?? []).map((contact) => (
          <article key={contact.id}>
            <h2>{contact.name}</h2>
            <p>{[contact.role, contact.organization].filter(Boolean).join(" · ")}</p>
            <span>{contact.email}</span>
          </article>
        ))}
      </div>
    </section>
  );
}

function ResumeStudioPage() {
  const [variants, setVariants] = useState<ResumeVariant[]>([]);
  const [name, setName] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [intent, setIntent] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void loadVariants();
  }, []);

  async function loadVariants() {
    const response = await fetch("/api/resume-studio");
    const body = (await response.json()) as { variants: ResumeVariant[] };
    setVariants(body.variants);
    setSelectedId((current) => current ?? body.variants[0]?.id ?? null);
  }

  async function createVariant(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    const response = await fetch("/api/resume-studio", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, targetRole, intent }),
    });
    const body = (await response.json()) as {
      variant?: ResumeVariant;
      error?: string;
    };
    if (!response.ok || !body.variant) {
      setMessage(body.error ?? "Could not create that variant.");
      return;
    }
    setName("");
    setTargetRole("");
    setIntent("");
    setSelectedId(body.variant.id);
    await loadVariants();
  }

  async function createRevision() {
    if (!selectedId) return;
    const response = await fetch(
      `/api/resume-studio/${selectedId}/revisions`,
      { method: "POST" },
    );
    const body = (await response.json()) as { error?: string };
    setMessage(
      response.ok
        ? "Immutable revision created from the selected fact versions."
        : body.error ?? "Could not create a revision.",
    );
    await loadVariants();
  }

  const selected = variants.find((variant) => variant.id === selectedId);
  const revision = selected?.revisions[0];

  return (
    <section className="career-page resume-studio-page">
      <div className="career-heading">
        <div>
          <h1>Resume Studio</h1>
          <p className="career-lead">
            Variants reference Career Memory. Revisions pin exact facts so an
            exported claim can always be traced back to evidence.
          </p>
        </div>
        {selected ? (
          <button className="career-action" onClick={createRevision}>
            Create revision
          </button>
        ) : null}
      </div>

      <div className="resume-studio-grid">
        <aside className="resume-variants">
          <h2>Variants</h2>
          {variants.map((variant) => (
            <button
              className={selectedId === variant.id ? "is-selected" : ""}
              key={variant.id}
              onClick={() => setSelectedId(variant.id)}
            >
              <strong>{variant.name}</strong>
              <span>{variant.targetRole}</span>
              <small>{variant.revisions.length} revision(s)</small>
            </button>
          ))}
          <form onSubmit={createVariant}>
            <h3>New variant</h3>
            <input
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Variant name"
            />
            <input
              required
              value={targetRole}
              onChange={(event) => setTargetRole(event.target.value)}
              placeholder="Target role"
            />
            <input
              value={intent}
              onChange={(event) => setIntent(event.target.value)}
              placeholder="Narrative intent"
            />
            <button type="submit">Create variant</button>
          </form>
        </aside>

        <main className="resume-preview">
          {revision ? (
            <article>
              <header>
                <h2>{revision.title}</h2>
                <p>{revision.targetRole}</p>
                <span>
                  Revision {revision.revisionNumber} ·{" "}
                  {revision.pinnedFacts.length} pinned facts
                </span>
              </header>
              {revision.summary.length ? (
                <section>
                  <h3>Profile</h3>
                  {revision.summary.map((claim) => (
                    <p key={claim.text}>{claim.text}</p>
                  ))}
                </section>
              ) : null}
              {revision.experience.map((role) => (
                <section key={role.title + role.organization}>
                  <h3>{role.title}</h3>
                  <p>{role.organization} · {role.span}</p>
                  <ul>
                    {role.claims.map((claim) => (
                      <li key={claim.text}>{claim.text}</li>
                    ))}
                  </ul>
                </section>
              ))}
              {revision.skills.length ? (
                <section>
                  <h3>Skills</h3>
                  <p>{revision.skills.map((skill) => skill.text).join(" · ")}</p>
                </section>
              ) : null}
              <footer>
                <a
                  href={`/api/resume-studio/revisions/${revision.id}/export/pdf`}
                >
                  Download PDF
                </a>
                <a
                  href={`/api/resume-studio/revisions/${revision.id}/export/docx`}
                >
                  Download DOCX
                </a>
              </footer>
            </article>
          ) : (
            <div className="career-empty">
              {selected
                ? "Create the first immutable revision for this variant."
                : "Create a resume variant to begin."}
            </div>
          )}
        </main>
      </div>
      {message ? <p className="career-message">{message}</p> : null}
    </section>
  );
}

function WorklogPage() {
  const [entries, setEntries] = useState<WorklogEntry[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [project, setProject] = useState("");
  const [tags, setTags] = useState("");
  const [proposals, setProposals] = useState<ChangeSet[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void loadEntries();
  }, []);

  async function loadEntries() {
    const response = await fetch("/api/worklog");
    const body = (await response.json()) as { entries: WorklogEntry[] };
    setEntries(body.entries);
  }

  async function capture(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    const response = await fetch("/api/worklog", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title,
        content,
        project,
        tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      }),
    });
    if (!response.ok) {
      setMessage("Add a title and enough detail to remember the work.");
      return;
    }
    const body = (await response.json()) as { entry: WorklogEntry };
    setTitle("");
    setContent("");
    setProject("");
    setTags("");
    await loadEntries();
    const proposed = await fetch(`/api/worklog/${body.entry.id}/proposals`, {
      method: "POST",
    });
    const proposedBody = (await proposed.json()) as { changeSets: ChangeSet[] };
    setProposals(proposedBody.changeSets);
    setMessage(
      proposedBody.changeSets.length
        ? `${proposedBody.changeSets.length} career fact proposal(s) ready for review.`
        : "Captured. No career facts were inferred.",
    );
  }

  async function approveAll() {
    await fetch("/api/worklog/proposals/approve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        changeSetIds: proposals.map((proposal) => proposal.id),
      }),
    });
    setMessage(`${proposals.length} proposal(s) added to Career Memory.`);
    setProposals([]);
  }

  return (
    <section className="career-page worklog-page">
      <div className="career-heading">
        <div>
          <h1>Worklog</h1>
          <p className="career-lead">
            Capture the work while it is fresh. Proforna turns useful details
            into proposals—you decide what becomes career memory.
          </p>
        </div>
        <span className="private-mark">Private vault</span>
      </div>

      <form className="capture-form" onSubmit={capture}>
        <label>
          What happened?
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. Atlas migration"
          />
        </label>
        <label>
          Outcome, metric, or lesson
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Led the migration of 18 systems without service loss…"
            rows={5}
          />
        </label>
        <div className="capture-row">
          <label>
            Project
            <input
              value={project}
              onChange={(event) => setProject(event.target.value)}
              placeholder="Atlas"
            />
          </label>
          <label>
            Tags
            <input
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="migration, skill:Incident leadership"
            />
          </label>
        </div>
        <button type="submit">Capture work</button>
      </form>

      {message ? <p className="career-message">{message}</p> : null}
      {proposals.length ? (
        <section className="proposal-review">
          <h2>Review proposed changes</h2>
          <p>
            These remain drafts until you approve the exact change set.
          </p>
          <ul>
            {proposals.map((proposal) => (
              <li key={proposal.id}>{proposal.purpose}</li>
            ))}
          </ul>
          <button type="button" onClick={approveAll}>
            Approve {proposals.length} proposal(s)
          </button>
        </section>
      ) : null}

      <section className="entry-list">
        <h2>Recent captures</h2>
        {entries.length === 0 ? (
          <p className="career-empty">Your worklog is ready for its first entry.</p>
        ) : (
          entries.map((entry) => (
            <article key={entry.id}>
              <time>{entry.occurredOn}</time>
              <h3>{entry.title}</h3>
              <p>{entry.content}</p>
              {entry.project ? <span>{entry.project}</span> : null}
            </article>
          ))
        )}
      </section>
    </section>
  );
}
