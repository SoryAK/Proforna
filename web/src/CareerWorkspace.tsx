import { useEffect, useRef, useState, type FormEvent } from "react";
import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import type { FitJudgment } from "@core/fit-judgment";
import {
  SEARCH_RADIUS_MILES,
  listingPay,
  mappableJobListings,
  searchRadiusMiles,
  type JobListing,
  type SearchRadius,
} from "@core/job-search";
import { lifeScore, type LifeAnchor } from "@core/life-anchor";
import type { MapSettings } from "@core/map-settings";
import { residenceForMap, type Residence } from "@core/residence";
import type { WorkMapRole } from "@core/work-map";
import { CareerMap } from "./CareerMap";
import { DocumentsPage } from "./DocumentsPage";
import { NetworkPage } from "./NetworkPage";
import { searchPlaces } from "./place-search";
import { LifeAnchors } from "./LifeAnchors";
import type { HomePage } from "./HomeNav";
import "./career-workspace.css";

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
  if (page === "resumes") return <ResumeStudioPage />;
  if (page === "opportunities") return <OpportunitiesPage />;
  if (page === "network") return <NetworkPage />;
  if (page === "documents") return <DocumentsPage />;
  return null;
}

type CareerManagement = {
  opportunities: Array<{
    id: string;
    kind: string;
    title: string;
    organization: string;
    fit_summary: string;
    status: string;
    pending_access_request_id: string | null;
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
    unread_inbound?: number;
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

type ListingCard = JobListing & { fit?: FitJudgment };

type OpportunitySearchMemory = {
  query: string;
  where: string;
  radius: string;
  listings: ListingCard[];
  selectedListingId: string | null;
  searchArea: SearchRadius | null;
  searchNote: string;
};

const opportunitySearchMemory: OpportunitySearchMemory = {
  query: "",
  where: "",
  radius: "25",
  listings: [],
  selectedListingId: null,
  searchArea: null,
  searchNote: "",
};

function ListingFocus({
  listing,
  saved,
  life,
  onBack,
  onSave,
}: {
  listing: ListingCard;
  saved: boolean;
  life: number | null;
  onBack: () => void;
  onSave: () => void;
}) {
  const pay = listingPay(listing);
  const facts = [pay, listing.contract, listing.category, postedLabel(listing.postedOn)].filter(
    Boolean,
  );
  return (
    <article className="listing-focus">
      <button type="button" onClick={onBack}>
        Back to results
      </button>
      <h2>{listing.title}</h2>
      <h3>{listing.organization}</h3>
      {listing.location ? <p>{listing.location}</p> : null}
      {facts.length > 0 ? (
        <ul>
          {facts.map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
        </ul>
      ) : null}
      {listing.fit ? <p className="opportunity-fit">{listing.fit.summary}</p> : null}
      {life != null ? <p>Life score {life}</p> : null}
      {listing.description ? <p className="listing-body">{listing.description}</p> : null}
      <div className="opportunity-actions">
        {listing.url ? (
          <a href={listing.url} rel="noreferrer" target="_blank">
            Open posting
          </a>
        ) : null}
        <button disabled={saved} type="button" onClick={onSave}>
          {saved ? "Saved" : "Save opportunity"}
        </button>
      </div>
    </article>
  );
}

function postedLabel(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return `Posted ${date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
}

function AnchorMark() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <circle cx="12" cy="5.2" r="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M12 7.2v12.2M8.2 11.2h7.6M7 16.2a5 5 0 0 0 10 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function OpportunitiesPage() {
  const [data, setData] = useState<CareerManagement | null>(null);
  const [roles, setRoles] = useState<WorkMapRole[]>([]);
  const [home, setHome] = useState<Residence | null>(null);
  const [mapSettings, setMapSettings] = useState<MapSettings | null>(null);
  const [query, setQuery] = useState(opportunitySearchMemory.query);
  const [where, setWhere] = useState(opportunitySearchMemory.where);
  const [radius, setRadius] = useState(opportunitySearchMemory.radius);
  const [radiusOpen, setRadiusOpen] = useState(false);
  const [searchArea, setSearchArea] = useState<SearchRadius | null>(
    opportunitySearchMemory.searchArea,
  );
  const [listings, setListings] = useState<ListingCard[]>(opportunitySearchMemory.listings);
  const [selectedListingId, setSelectedListingId] = useState<string | null>(
    opportunitySearchMemory.selectedListingId,
  );
  const [searching, setSearching] = useState(false);
  const [searchNote, setSearchNote] = useState(opportunitySearchMemory.searchNote);
  const [anchorsOpen, setAnchorsOpen] = useState(false);
  const [anchors, setAnchors] = useState<LifeAnchor[]>([]);
  const [title, setTitle] = useState("");
  const [organization, setOrganization] = useState("");
  const [fitSummary, setFitSummary] = useState("");
  const [editingOpportunityId, setEditingOpportunityId] = useState<string | null>(null);
  const opportunityTitleRef = useRef<HTMLInputElement>(null);
  const [planTitle, setPlanTitle] = useState("");
  const [planOutcome, setPlanOutcome] = useState("");
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [removingPlan, setRemovingPlan] = useState<{ id: string; title: string } | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void load();
    void loadMap();
  }, []);

  useEffect(() => {
    opportunitySearchMemory.query = query;
    opportunitySearchMemory.where = where;
    opportunitySearchMemory.radius = radius;
    opportunitySearchMemory.listings = listings;
    opportunitySearchMemory.selectedListingId = selectedListingId;
    opportunitySearchMemory.searchArea = searchArea;
    opportunitySearchMemory.searchNote = searchNote;
  }, [query, where, radius, listings, selectedListingId, searchArea, searchNote]);

  async function load() {
    const response = await fetch("/api/career-management");
    setData((await response.json()) as CareerManagement);
  }

  async function loadMap() {
    const [mapResponse, settingsResponse] = await Promise.all([
      fetch("/api/work-map"),
      fetch("/api/maps"),
    ]);
    if (mapResponse.ok) {
      const body = (await mapResponse.json()) as {
        roles?: WorkMapRole[];
        residences?: Residence[];
      };
      setRoles(body.roles ?? []);
      setHome(residenceForMap(body.residences ?? [], null));
    }
    if (settingsResponse.ok) {
      const body = (await settingsResponse.json()) as { settings?: MapSettings };
      setMapSettings(body.settings ?? null);
    }
  }

  async function searchJobs(event: FormEvent) {
    event.preventDefault();
    setSearching(true);
    setSearchNote("");
    const place = where.trim();
    const miles = searchRadiusMiles(radius);
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (place) params.set("where", place);
    params.set("distance", String(miles));
    const [response, places] = await Promise.all([
      fetch(`/api/job-search?${params}`),
      place ? searchPlaces(place) : Promise.resolve(null),
    ]);
    const body = (await response.json()) as {
      configured?: boolean;
      listings?: Array<JobListing & { fit?: FitJudgment }>;
      error?: string;
    };
    setSearching(false);
    if (!response.ok) {
      setSearchArea(null);
      setSearchNote("Add a role or a place to search.");
      return;
    }
    const hit = places?.place ?? places?.places[0] ?? null;
    setSearchArea(
      hit ? { latitude: hit.latitude, longitude: hit.longitude, miles } : null,
    );
    const found = body.listings ?? [];
    setListings(found);
    setSelectedListingId(null);
    if (body.configured === false) {
      setSearchNote(
        "Listings are not connected yet. The map still shows your career and home.",
      );
      return;
    }
    const within = place ? ` within ${miles} miles` : "";
    setSearchNote(
      found.length
        ? `${found.length} roles${within}. The ones with a place are on the map.`
        : place
          ? `No roles within ${miles} miles.`
          : "No roles matched that search.",
    );
  }

  function clearSearch() {
    setListings([]);
    setSelectedListingId(null);
    setSearchArea(null);
    setSearchNote("");
  }

  async function saveListing(listing: JobListing & { fit?: FitJudgment }) {
    const response = await fetch("/api/opportunities", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "role",
        title: listing.title,
        organization: listing.organization,
        location: listing.location,
        sourceUrl: listing.url,
        fitSummary: listing.fit?.summary ?? "",
      }),
    });
    setMessage(response.ok ? "Opportunity saved." : "Could not save that role.");
    if (response.ok) await load();
  }

  async function saveOpportunity(event: FormEvent) {
    event.preventDefault();
    const editing = editingOpportunityId;
    const response = await fetch(editing ? `/api/opportunities/${editing}` : "/api/opportunities", {
      method: editing ? "PUT" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        editing ? { title, organization, fitSummary } : { kind: "role", title, organization, fitSummary },
      ),
    });
    setMessage(
      response.ok
        ? editing
          ? "Role saved."
          : "Opportunity saved."
        : "Check the role and organization.",
    );
    if (response.ok) {
      closeOpportunityForm();
      await load();
    }
  }

  function editOpportunity(opportunity: { id: string; title: string; organization: string; fit_summary: string }) {
    setEditingOpportunityId(opportunity.id);
    setTitle(opportunity.title);
    setOrganization(opportunity.organization);
    setFitSummary(opportunity.fit_summary ?? "");
    const field = opportunityTitleRef.current;
    field?.scrollIntoView({ block: "center", behavior: "smooth" });
    field?.focus({ preventScroll: true });
  }

  function closeOpportunityForm() {
    setEditingOpportunityId(null);
    setTitle("");
    setOrganization("");
    setFitSummary("");
  }

  async function startApplication(opportunityId: string) {
    await fetch(`/api/opportunities/${opportunityId}/applications`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nextStep: "Choose a resume revision" }),
    });
    await load();
  }

  async function resolveAccess(opportunityId: string, decision: "grant" | "decline") {
    const response = await fetch(`/api/opportunities/${opportunityId}/access`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    setMessage(
      response.ok
        ? decision === "grant"
          ? "Access granted."
          : "Request declined."
        : "Could not resolve that request.",
    );
    window.dispatchEvent(new Event("proforna:notices-changed"));
    await load();
  }

  async function keepInNetwork(opportunityId: string) {
    const response = await fetch(`/api/opportunities/${opportunityId}/network`, {
      method: "POST",
    });
    setMessage(
      response.ok
        ? "Kept in My Network. The conversation stays on that person."
        : "Only a connection can move into My Network.",
    );
    await load();
  }

  async function removeOpportunity(opportunityId: string) {
    const response = await fetch(`/api/opportunities/${opportunityId}`, {
      method: "DELETE",
    });
    setMessage(response.ok ? "Removed." : "That role could not be removed.");
    if (response.ok && editingOpportunityId === opportunityId) closeOpportunityForm();
    await load();
  }

  async function removeApplication(applicationId: string) {
    const response = await fetch(`/api/applications/${applicationId}`, {
      method: "DELETE",
    });
    setMessage(response.ok ? "Removed." : "That application could not be removed.");
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
    const editing = editingPlanId;
    const response = await fetch(editing ? `/api/plans/${editing}` : "/api/plans", {
      method: editing ? "PUT" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        editing
          ? { title: planTitle, outcome: planOutcome }
          : { title: planTitle, outcome: planOutcome, horizon: "90 days" },
      ),
    });
    if (!response.ok) {
      setMessage(editing ? "Could not save that plan." : "Could not create that plan.");
      return;
    }
    setMessage(editing ? "Plan saved." : "");
    closePlanForm();
    await load();
  }

  function editPlan(plan: { id: string; title: string; outcome: string }) {
    setEditingPlanId(plan.id);
    setPlanTitle(plan.title);
    setPlanOutcome(plan.outcome);
  }

  function closePlanForm() {
    setEditingPlanId(null);
    setPlanTitle("");
    setPlanOutcome("");
  }

  async function removePlan() {
    const plan = removingPlan;
    if (!plan) return;
    setRemovingPlan(null);
    const response = await fetch(`/api/plans/${plan.id}`, { method: "DELETE" });
    setMessage(response.ok ? "Plan removed." : "Could not remove that plan.");
    if (editingPlanId === plan.id) closePlanForm();
    await load();
  }

  const pins = mappableJobListings(listings).map((listing) => ({
    id: listing.id,
    latitude: listing.latitude,
    longitude: listing.longitude,
    title: listing.title,
    detail: [listing.organization, listing.location].filter(Boolean).join(" · "),
    pay: listingPay(listing),
    summary: listing.summary,
  }));
  const focusedListing = listings.find((listing) => listing.id === selectedListingId) ?? null;
  const homePin =
    home && home.latitude != null && home.longitude != null
      ? {
          latitude: home.latitude,
          longitude: home.longitude,
          label: home.label,
          detail: home.address,
        }
      : null;

  return (
    <section className="career-page opportunities-page">
      <h1>Opportunities</h1>
      <p className="career-lead">
        Search for roles on your career map, then keep the ones you want to pursue.
      </p>
      <div className="opportunity-board">
        <div className="opportunity-column">
          {focusedListing ? (
            <ListingFocus
              listing={focusedListing}
              saved={(data?.opportunities ?? []).some(
                (opportunity) =>
                  opportunity.title === focusedListing.title &&
                  opportunity.organization === focusedListing.organization,
              )}
              life={
                anchors.length > 0 &&
                focusedListing.latitude != null &&
                focusedListing.longitude != null
                  ? lifeScore(
                      {
                        latitude: focusedListing.latitude,
                        longitude: focusedListing.longitude,
                      },
                      anchors,
                    )
                  : null
              }
              onBack={() => setSelectedListingId(null)}
              onSave={() => void saveListing(focusedListing)}
            />
          ) : null}
          {focusedListing
            ? null
            : listings.map((listing) => {
            const pay = listingPay(listing);
            const saved = (data?.opportunities ?? []).some(
              (opportunity) =>
                opportunity.title === listing.title &&
                opportunity.organization === listing.organization,
            );
            return (
              <article
                className={
                  listing.id === selectedListingId
                    ? "opportunity-card is-selected"
                    : "opportunity-card"
                }
                key={listing.id}
              >
                <button
                  className="opportunity-hit"
                  type="button"
                  onClick={() => setSelectedListingId(listing.id)}
                >
                  <span>Listing</span>
                  <h2>{listing.title}</h2>
                  <h3>{listing.organization}</h3>
                  <p>{listing.location}</p>
                  {pay ? <p>{pay}</p> : null}
                  {listing.fit ? <p className="opportunity-fit">{listing.fit.summary}</p> : null}
                  {anchors.length > 0 &&
                  listing.latitude != null &&
                  listing.longitude != null ? (
                    <p>
                      Life score{" "}
                      {lifeScore(
                        {
                          latitude: listing.latitude,
                          longitude: listing.longitude,
                        },
                        anchors,
                      )}
                    </p>
                  ) : null}
                </button>
                <button
                  disabled={saved}
                  type="button"
                  onClick={() => void saveListing(listing)}
                >
                  {saved ? "Saved" : "Save opportunity"}
                </button>
              </article>
            );
          })}
        <main>
          {(data?.opportunities ?? []).map((opportunity) => {
            const application = data?.applications.find(
              (item) => item.opportunity_id === opportunity.id,
            );
            return (
              <article className="opportunity-card" key={opportunity.id}>
                <span>
                  {opportunity.kind === "connection"
                    ? opportunity.pending_access_request_id
                      ? "Inbound request"
                      : opportunity.status
                    : opportunity.status}
                </span>
                <h2>{opportunity.title}</h2>
                <h3>{opportunity.organization}</h3>
                <p>{opportunity.fit_summary}</p>
                {opportunity.kind === "connection" ? (
                  <div className="opportunity-actions">
                    {opportunity.pending_access_request_id ? (
                      <>
                        <button
                          className="is-primary"
                          type="button"
                          onClick={() => void resolveAccess(opportunity.id, "grant")}
                        >
                          Grant access
                        </button>
                        <button
                          className="is-danger"
                          type="button"
                          onClick={() => void resolveAccess(opportunity.id, "decline")}
                        >
                          Decline
                        </button>
                      </>
                    ) : null}
                    {opportunity.status !== "closed" ? (
                      <button
                        type="button"
                        onClick={() => void keepInNetwork(opportunity.id)}
                      >
                        Keep in My Network
                      </button>
                    ) : null}
                    {opportunity.pending_access_request_id ? null : (
                      <button
                        className="is-danger"
                        type="button"
                        onClick={() => void removeOpportunity(opportunity.id)}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ) : application ? (
                  <div className="application-state">
                    <strong>{application.stage}</strong>
                    <select
                      aria-label="Current stage"
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
                    <button type="button" onClick={() => editOpportunity(opportunity)}>
                      Edit
                    </button>
                    <button
                      className="is-danger"
                      type="button"
                      onClick={() => void removeApplication(application.id)}
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="opportunity-actions">
                    <button onClick={() => void startApplication(opportunity.id)}>
                      Start application
                    </button>
                    <button type="button" onClick={() => editOpportunity(opportunity)}>
                      Edit
                    </button>
                    <button
                      className="is-danger"
                      type="button"
                      onClick={() => void removeOpportunity(opportunity.id)}
                    >
                      Remove
                    </button>
                  </div>
                )}
              </article>
            );
          })}
          {!data?.opportunities.length ? (
            <p className="career-empty">
              Search for a role, or inbound Work Map requests will land here.
            </p>
          ) : null}
        </main>
        <aside>
          <form className="compact-career-form" onSubmit={saveOpportunity}>
            <h2>{editingOpportunityId ? "Edit role" : "Save a role"}</h2>
            <input
              ref={opportunityTitleRef}
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
            <div className="career-form-actions">
              <button type="submit">{editingOpportunityId ? "Save role" : "Save opportunity"}</button>
              {editingOpportunityId ? (
                <button type="button" onClick={closeOpportunityForm}>
                  Cancel
                </button>
              ) : null}
            </div>
          </form>
          <form className="compact-career-form" onSubmit={savePlan}>
            <h2>{editingPlanId ? "Edit plan" : "Career plan"}</h2>
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
            <div className="career-form-actions">
              <button type="submit">{editingPlanId ? "Save plan" : "Create plan"}</button>
              {editingPlanId ? (
                <button type="button" onClick={closePlanForm}>
                  Cancel
                </button>
              ) : null}
            </div>
            {(data?.plans ?? []).map((plan) => (
              <div className="career-plan-row" key={plan.id}>
                <small>
                  {plan.title} · {plan.horizon}
                </small>
                <button type="button" aria-label={`Edit ${plan.title}`} onClick={() => editPlan(plan)}>
                  Edit
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${plan.title}`}
                  onClick={() => setRemovingPlan({ id: plan.id, title: plan.title })}
                >
                  Remove
                </button>
              </div>
            ))}
          </form>
          <AlertDialog
            isOpen={removingPlan != null}
            onOpenChange={(next) => {
              if (!next) setRemovingPlan(null);
            }}
            title="Remove this plan?"
            description={removingPlan ? `${removingPlan.title} and its tasks are removed.` : ""}
            actionLabel="Remove"
            onAction={() => void removePlan()}
          />
        </aside>
        </div>
        <div className="opportunity-stage">
            <form className="opportunity-search" onSubmit={(event) => void searchJobs(event)}>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Role"
                aria-label="Role"
              />
              <input
                value={where}
                onChange={(event) => setWhere(event.target.value)}
                placeholder="Place"
                aria-label="Place"
              />
              <div
                className="opportunity-radius"
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) setRadiusOpen(false);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setRadiusOpen(false);
                }}
              >
                <button
                  type="button"
                  aria-expanded={radiusOpen}
                  aria-haspopup="listbox"
                  aria-label="Radius"
                  onClick={() => setRadiusOpen((open) => !open)}
                >
                  {radius} mi
                </button>
                {radiusOpen ? (
                  <ul role="listbox" aria-label="Radius">
                    {SEARCH_RADIUS_MILES.map((miles) => (
                      <li key={miles}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={radius === String(miles)}
                          onClick={() => {
                            setRadius(String(miles));
                            setRadiusOpen(false);
                          }}
                        >
                          {miles} mi
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <button type="submit" disabled={searching}>
                {searching ? "Searching" : "Search"}
              </button>
              {listings.length > 0 || searchArea || searchNote ? (
                <button type="button" onClick={clearSearch}>
                  Clear
                </button>
              ) : null}
              {searchNote ? <p className="map-search-note">{searchNote}</p> : null}
            </form>
          <div className="opportunity-map">
            <div
              className="map-anchor"
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setAnchorsOpen(false);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") setAnchorsOpen(false);
              }}
            >
              <button
                type="button"
                className="map-anchor-toggle"
                aria-expanded={anchorsOpen}
                aria-label="Life anchors"
                onClick={() => setAnchorsOpen((open) => !open)}
              >
                <AnchorMark />
              </button>
              <div className="map-anchor-sheet" hidden={!anchorsOpen}>
                <LifeAnchors onChange={setAnchors} />
              </div>
            </div>
          <CareerMap
            anchors={anchors.map((anchor) => ({
              id: anchor.id,
              latitude: anchor.latitude,
              longitude: anchor.longitude,
              label: anchor.label,
              detail: anchor.address,
              icon: anchor.icon,
            }))}
            fitKey={`${selectedListingId ?? ""}|${
              searchArea
                ? `${searchArea.latitude.toFixed(4)},${searchArea.longitude.toFixed(4)},${searchArea.miles}`
                : ""
            }`}
            home={homePin}
            onSelect={() => undefined}
            onSelectOverlay={setSelectedListingId}
            overlays={pins}
            roles={roles}
            selectedId={null}
            searchRadius={searchArea}
            selectedOverlayId={selectedListingId}
            settings={mapSettings}
            suppressEmpty
            viewKey="opportunities"
          />
          </div>
        </div>
      </div>
      {message ? <p className="career-message">{message}</p> : null}
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

