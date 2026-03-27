1. the conmpany needs to show whether its public and private in the header card 
2. it shouldnt say Title for the position the user holds and instead it should say postion
3. I should run some ideas about what the overal page layout for the comapny 
4. The page should be more customizable like notion allowing the user to be able to structure the page more to their liking due to there being many types of positions and companies 
5. The user should be able to add images to the company photo and banner ( this should be template idea when regarding header banners)
6. Replace SerpAPI for Company News & Scholar with Gemini 2.0 + Google Search Grounding (free with existing GEMINI_API_KEY). Keep SerpAPI only for Job Discovery (needs structured job data with apply links). This would reduce SerpAPI usage significantly and leverage the already-configured Gemini API.
7. 

## Life Anchors Feature (Job Search / Map)
**Priority: High | Complexity: Medium-High**

Workers with families/dependents don't just care about commute from home — they need to know distance to a spouse's job, kids' school, daycare, etc. No major job platform addresses this.

**Concept:** Let users save labeled locations ("Life Anchors") — Home, Spouse's Work, Kids' School, Daycare, Gym, etc. When viewing a job, show commute time to ALL anchors, not just home.

**Implementation plan:**
- New `LifeAnchor` Prisma model: `id, userId, label, icon, address, lat, lng, weight (priority 1-5)`
- Life Anchors management panel (profile/settings) with Google Places Autocomplete for each
- Job detail view: commute breakdown card showing travel time + distance to every anchor
- **"Life Score"** — weighted composite score summarizing how well a job fits the user's whole life
- Map: draw multi-colored commute lines from job to each anchor
- Sort/filter jobs by Life Score alongside salary
- Batch estimation via OSRM for list view; Google Directions for selected job detail

**Cost note:** Each anchor = 1 Directions API call per job viewed. Keep OSRM for bulk estimates, Google only for selected job.


## Email Lead Ingestion Pipeline (Job Search / Map)
**Priority: High | Complexity: High**

Job seekers already receive a firehose of leads daily from Indeed, LinkedIn, Glassdoor, ZipRecruiter, etc. That data sits unused in their inbox. We can turn passive job email spam into structured, map-ready leads — at zero API cost per lead.

**Core Insight:** Users already receive the data we're paying Adzuna for. Connecting to their email lets us harvest those leads, dramatically lowering API spend while increasing lead volume and freshness.

**Concept:**
1. **Email → Structured Leads:** Connect to user's email (Gmail / Outlook), filter by known job-site senders, parse job title, company, location, salary, and apply link from the email body
2. **Retention Database:** Store parsed leads with a 30–60 day TTL. Deduplicate against Adzuna/Google Jobs results. Leads age out automatically, keeping the pool fresh
3. **High-Density Job Zones:** With enough volume, cluster analysis reveals hotspots (airports, hospital districts, downtown cores) that consistently produce many listings
4. **Job Hub Cards (future):** Identify and label these high-density zones, show all jobs a location offers in a single expandable card on the map

**Implementation plan (phased):**

### Phase 1 — Email Forwarding (MVP, no OAuth)
- Give each user a unique ingest address (e.g. `leads+{userId}@resumsify.app`)
- User forwards job emails (or sets up auto-forward rules) to that address
- Inbound webhook (SendGrid / Mailgun) receives the email
- Parser extracts: title, company, location, salary range, apply URL, source (Indeed/LinkedIn/etc.)
- Geocode location → store as `EmailLead` in DB → feed to map alongside Adzuna results
- **Why first:** Zero OAuth review, tests the parsing pipeline cheaply, validates user interest

### Phase 2 — Gmail OAuth Integration
- `gmail.readonly` scope, filtered by sender (Indeed, LinkedIn, Glassdoor, ZipRecruiter, Dice, etc.)
- Background sync: poll new messages every ~15 min or use Gmail push notifications (Pub/Sub)
- Same parsing pipeline as Phase 1, now automated
- **Barrier:** Google verified app review (privacy policy, security audit, weeks of lead time)

### Phase 3 — Outlook / Microsoft Graph
- `Mail.Read` scope with same sender filtering
- Captures the ~30% of users on Outlook/Hotmail
- Same parser pipeline, different email format templates

### Phase 4 — Retention DB + Dedup + High-Density Zones
- `EmailLead` table with `expiresAt` (TTL), `source`, `dedupeHash` (title+company+location)
- Cron job prunes expired leads
- Cluster analysis on accumulated leads → detect high-density zones
- Map overlay: "Job Hub" markers for zones with 10+ active leads (e.g. airport, hospital campus)
- Hub detail card: expandable list of all jobs at that location

**Data model (EmailLead):**
```
id, userId, title, company, location, lat, lng, salaryMin, salaryMax,
applyUrl, source (indeed/linkedin/glassdoor/etc.), emailDate,
dedupeHash, expiresAt, createdAt
```

**Key risks & mitigations:**
- **OAuth approval delays** → Phase 1 (forwarding) ships independently, no blockers
- **Email template changes** → Modular per-source parsers, easy to update one without breaking others
- **User trust ("read my email?")** → Read-only, filtered to known job senders only, clear privacy messaging
- **Scale** → Background queue (bull/pg-boss) for parsing, not real-time in request cycle

**Cost impact:** Near-zero marginal cost per lead (vs $0.001+ per Adzuna API call). At scale, email leads could supply 80%+ of a user's lead pool.


UI design inspiration 

https://unbounce.com/landing-page-examples/best-landing-page-examples/#example-calm
https://www.landingfolio.com/

5. The "Pay Transparency" Loophole (The New Way)
Many states (California, New York, Colorado, Washington, etc.) have recently passed Pay Transparency Laws.
The Filing: Companies in these states are now required to include a pay range (
35.00
–
35.00–
45.00/hr) on every job posting.
How to "look it up": While this isn't a single "state filing" database, it means you can look at the company's active job listings or use an API (like Adzuna or Google Jobs) to see what the state-mandated pay range is for that role.

Here are the list of things that we can use to improve the app
https://ai.studio/apps/bundled/research_visualization
https://ai.studio/apps/5d253a77-8931-4188-8677-250eb94e2273